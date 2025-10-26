// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

import {IdentityRegistry} from "./IdentityRegistry.sol";
import {NominationVoting} from "./NominationVoting.sol";
import {CandidacyNFT} from "./CandidacyNft.sol";

/**
 * @title VettingJury
 * @author Emmanuel Nyamweya
 * @notice Phase 2: Random jury vets candidates via commit-reveal voting
 * @dev FIXED: Added public getters for juror reports and evidence
 */
contract VettingJury is VRFConsumerBaseV2Plus, AccessControl, ReentrancyGuard, AutomationCompatibleInterface {
    /////////////////////
    //  CUSTOM ERRORS //
    ///////////////////

    error VettingJury__NotJuror();
    error VettingJury__JuryNotSelected();
    error VettingJury__JuryAlreadySelected();
    error VettingJury__CommitPeriodNotActive();
    error VettingJury__RevealPeriodNotActive();
    error VettingJury__AlreadyCommitted();
    error VettingJury__AlreadyRevealed();
    error VettingJury__InvalidReveal();
    error VettingJury__InsufficientStake();
    error VettingJury__VettingNotComplete();
    error VettingJury__AlreadyFinalized();
    error VettingJury__ZeroAddress();
    error VettingJury__InvalidJurySize();
    error VettingJury__InsufficientEligibleJurors();

    /////////////////////////
    // TYPE DECLARATIONS //
    //////////////////////

    enum SessionPhase {
        JurySelection,
        Commit,
        Reveal,
        Finalized
    }

    struct DetailedVettingResults {
        uint256 candidateId;
        uint256 approvals;
        uint256 rejections;
        uint256 totalReveals;
        uint256 approvalPercentage;
        string[] evidenceIPFSLinks; // IPFS links from all jurors
        string[] findingsSummaries; // Findings from all jurors
        address[] jurorAddresses; // Juror addresses
        bool[] jurorApprovals; // Each juror's vote
    }

    struct VettingSession {
        uint256 electionId;
        uint256[] candidateIds;
        address[] jurors;
        mapping(address => bool) isJuror;
        uint96 commitStart;
        uint96 commitEnd;
        uint96 revealEnd;
        uint256 jurySize;
        uint256 stakeAmount;
        bool isFinalized;
        uint256[] vettedCandidates;
        SessionPhase currentPhase;
        bool autoTransitionEnabled;
    }

    struct VoteCommit {
        bytes32 commitHash;
        bool hasCommitted;
        bool hasRevealed;
    }

    //  FIX: Enhanced VoteReveal structure
    struct VoteReveal {
        bool approve;
        string evidenceIPFS;
        string findingsSummary; // Short summary of findings
        uint96 revealedAt; // Timestamp of reveal
    }

    //  NEW: Struct for frontend integration
    struct JurorReport {
        address juror;
        bool approve;
        string evidenceIPFS;
        string findingsSummary;
        uint96 revealedAt;
        bool hasRevealed;
    }

    /////////////////////////
    //  STATE VARIABLES   //
    ////////////////////////

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant AUTOMATION_ROLE = keccak256("AUTOMATION_ROLE");

    IdentityRegistry public immutable identityRegistry;
    NominationVoting public immutable nominationVoting;
    CandidacyNFT public immutable candidacyNFT;

    uint256 public immutable vrfSubscriptionId;
    bytes32 public immutable vrfKeyHash;
    uint32 public constant VRF_CALLBACK_GAS_LIMIT = 2500000;
    uint16 public constant VRF_REQUEST_CONFIRMATIONS = 3;
    uint32 public constant VRF_NUM_WORDS = 1;

    uint256 public constant APPROVAL_THRESHOLD = 60;
    uint256 public constant DEFAULT_STAKE_AMOUNT = 0.01 ether;

    uint256 public sessionCounter;
    mapping(uint256 => VettingSession) private vettingSessions;
    mapping(uint256 => mapping(uint256 => mapping(address => VoteCommit))) private voteCommits;

    mapping(uint256 => mapping(uint256 => mapping(address => VoteReveal))) public voteReveals;

    mapping(uint256 => mapping(uint256 => uint256)) private approvalCounts;
    mapping(uint256 => mapping(address => uint256)) public jurorStakes;
    mapping(uint256 => uint256) private pendingVRFRequests;

    uint256[] private activeSessionIds;
    mapping(uint256 => uint256) private sessionIdToIndex;

    /////////////
    // EVENTS //
    ///////////

    event VettingSessionCreated(
        uint256 indexed sessionId,
        uint256 indexed electionId,
        uint256[] candidateIds,
        uint256 jurySize,
        uint256 stakeAmount
    );
    event JurySelectionRequested(uint256 indexed sessionId, uint256 requestId);
    event JurySelected(uint256 indexed sessionId, address[] jurors, uint256 randomSeed, uint256 timestamp);
    event JurorStaked(uint256 indexed sessionId, address indexed juror, uint256 amount);
    event VoteCommitted(
        uint256 indexed sessionId, uint256 indexed candidateId, address indexed juror, uint256 timestamp
    );
    event VoteRevealed(
        uint256 indexed sessionId,
        uint256 indexed candidateId,
        address indexed juror,
        bool approved,
        string evidenceIPFS,
        uint256 timestamp
    );
    event VettingFinalized(
        uint256 indexed sessionId, uint256[] vettedCandidates, uint256[] rejectedCandidates, uint256 timestamp
    );
    event StakeSlashed(uint256 indexed sessionId, address indexed juror, uint256 amount);
    event StakeReturned(uint256 indexed sessionId, address indexed juror, uint256 amount);
    event PhaseTransitioned(uint256 indexed sessionId, SessionPhase newPhase, uint256 timestamp);
    event AutoTransitionTriggered(uint256 indexed sessionId, SessionPhase fromPhase, SessionPhase toPhase);

    //////////////////
    // CONSTRUCTOR //
    ////////////////

    constructor(
        address _vrfCoordinator,
        uint256 _vrfSubscriptionId,
        bytes32 _vrfKeyHash,
        address _identityRegistry,
        address _nominationVoting,
        address _candidacyNFT
    ) VRFConsumerBaseV2Plus(_vrfCoordinator) {
        if (_identityRegistry == address(0) || _nominationVoting == address(0) || _candidacyNFT == address(0)) {
            revert VettingJury__ZeroAddress();
        }

        vrfSubscriptionId = _vrfSubscriptionId;
        vrfKeyHash = _vrfKeyHash;
        identityRegistry = IdentityRegistry(_identityRegistry);
        nominationVoting = NominationVoting(_nominationVoting);
        candidacyNFT = CandidacyNFT(_candidacyNFT);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(AUTOMATION_ROLE, msg.sender);
    }

    /////////////////////////
    // EXTERNAL FUNCTIONS //
    ///////////////////////

    function createVettingSession(
        uint256 _electionId,
        uint256 _jurySize,
        uint96 _commitDuration,
        uint96 _revealDuration,
        uint256 _stakeAmount,
        bool _autoTransitionEnabled
    ) external onlyRole(ADMIN_ROLE) returns (uint256) {
        if (_jurySize < 5 || _jurySize > 21 || _jurySize % 2 == 0) {
            revert VettingJury__InvalidJurySize();
        }

        uint256[] memory candidateIds = nominationVoting.getTopCandidates(_electionId);

        uint256 sessionId = ++sessionCounter;
        VettingSession storage session = vettingSessions[sessionId];

        session.electionId = _electionId;
        session.candidateIds = candidateIds;
        session.jurySize = _jurySize;
        session.stakeAmount = _stakeAmount;
        session.currentPhase = SessionPhase.JurySelection;
        session.autoTransitionEnabled = _autoTransitionEnabled;

        uint96 currentTime = uint96(block.timestamp);
        session.commitStart = currentTime;
        session.commitEnd = currentTime + _commitDuration;
        session.revealEnd = currentTime + _commitDuration + _revealDuration;

        if (_autoTransitionEnabled) {
            activeSessionIds.push(sessionId);
            sessionIdToIndex[sessionId] = activeSessionIds.length - 1;
        }

        emit VettingSessionCreated(sessionId, _electionId, candidateIds, _jurySize, _stakeAmount);

        return sessionId;
    }

    function requestJurySelection(uint256 _sessionId) external onlyRole(ADMIN_ROLE) returns (uint256) {
        VettingSession storage session = vettingSessions[_sessionId];

        if (session.jurors.length > 0) {
            revert VettingJury__JuryAlreadySelected();
        }

        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: vrfKeyHash,
                subId: vrfSubscriptionId,
                requestConfirmations: VRF_REQUEST_CONFIRMATIONS,
                callbackGasLimit: VRF_CALLBACK_GAS_LIMIT,
                numWords: VRF_NUM_WORDS,
                extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: false}))
            })
        );

        pendingVRFRequests[requestId] = _sessionId;

        emit JurySelectionRequested(_sessionId, requestId);

        return requestId;
    }

    function stakeAsJuror(uint256 _sessionId) external payable nonReentrant {
        VettingSession storage session = vettingSessions[_sessionId];

        if (!session.isJuror[msg.sender]) {
            revert VettingJury__NotJuror();
        }

        if (msg.value < session.stakeAmount) {
            revert VettingJury__InsufficientStake();
        }

        jurorStakes[_sessionId][msg.sender] = msg.value;

        emit JurorStaked(_sessionId, msg.sender, msg.value);
    }

    function commitVote(uint256 _sessionId, uint256 _candidateId, bytes32 _commitHash) external {
        VettingSession storage session = vettingSessions[_sessionId];

        if (!session.isJuror[msg.sender]) {
            revert VettingJury__NotJuror();
        }

        if (block.timestamp < session.commitStart || block.timestamp >= session.commitEnd) {
            revert VettingJury__CommitPeriodNotActive();
        }

        VoteCommit storage commit = voteCommits[_sessionId][_candidateId][msg.sender];

        if (commit.hasCommitted) {
            revert VettingJury__AlreadyCommitted();
        }

        commit.commitHash = _commitHash;
        commit.hasCommitted = true;

        emit VoteCommitted(_sessionId, _candidateId, msg.sender, block.timestamp);
    }

    function revealVote(
        uint256 _sessionId,
        uint256 _candidateId,
        bool _approve,
        string calldata _evidenceIPFS,
        string calldata _findingsSummary,
        string calldata _secret
    ) external {
        VettingSession storage session = vettingSessions[_sessionId];

        if (!session.isJuror[msg.sender]) {
            revert VettingJury__NotJuror();
        }

        if (block.timestamp < session.commitEnd || block.timestamp >= session.revealEnd) {
            revert VettingJury__RevealPeriodNotActive();
        }

        VoteCommit storage commit = voteCommits[_sessionId][_candidateId][msg.sender];

        if (!commit.hasCommitted) {
            revert VettingJury__InvalidReveal();
        }

        if (commit.hasRevealed) {
            revert VettingJury__AlreadyRevealed();
        }

        bytes32 expectedHash = keccak256(abi.encodePacked(_approve, _secret, msg.sender));

        if (expectedHash != commit.commitHash) {
            revert VettingJury__InvalidReveal();
        }

        commit.hasRevealed = true;

        voteReveals[_sessionId][_candidateId][msg.sender] = VoteReveal({
            approve: _approve,
            evidenceIPFS: _evidenceIPFS,
            findingsSummary: _findingsSummary,
            revealedAt: uint96(block.timestamp)
        });

        if (_approve) {
            approvalCounts[_sessionId][_candidateId]++;
        }

        identityRegistry.recordActivity(msg.sender);

        emit VoteRevealed(_sessionId, _candidateId, msg.sender, _approve, _evidenceIPFS, block.timestamp);
    }

    function finalizeVetting(uint256 _sessionId) external nonReentrant {
        VettingSession storage session = vettingSessions[_sessionId];

        if (block.timestamp < session.revealEnd) {
            revert VettingJury__VettingNotComplete();
        }

        if (session.isFinalized) {
            revert VettingJury__AlreadyFinalized();
        }

        _executeFinalization(_sessionId);
    }

    ///////////////////////////////////
    // CHAINLINK AUTOMATION FUNCTIONS //
    ///////////////////////////////////

    function checkUpkeep(bytes calldata /* checkData */ )
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        uint256[] memory sessionsToTransition = new uint256[](activeSessionIds.length);
        SessionPhase[] memory targetPhases = new SessionPhase[](activeSessionIds.length);
        uint256 count = 0;

        for (uint256 i = 0; i < activeSessionIds.length; i++) {
            uint256 sessionId = activeSessionIds[i];
            VettingSession storage session = vettingSessions[sessionId];

            if (!session.autoTransitionEnabled || session.isFinalized) {
                continue;
            }

            if (session.currentPhase == SessionPhase.Commit && block.timestamp >= session.commitEnd) {
                sessionsToTransition[count] = sessionId;
                targetPhases[count] = SessionPhase.Reveal;
                count++;
            } else if (session.currentPhase == SessionPhase.Reveal && block.timestamp >= session.revealEnd) {
                sessionsToTransition[count] = sessionId;
                targetPhases[count] = SessionPhase.Finalized;
                count++;
            }
        }

        if (count > 0) {
            uint256[] memory finalSessions = new uint256[](count);
            SessionPhase[] memory finalPhases = new SessionPhase[](count);

            for (uint256 i = 0; i < count; i++) {
                finalSessions[i] = sessionsToTransition[i];
                finalPhases[i] = targetPhases[i];
            }

            return (true, abi.encode(finalSessions, finalPhases));
        }

        return (false, "");
    }

    function performUpkeep(bytes calldata performData) external override onlyRole(AUTOMATION_ROLE) {
        (uint256[] memory sessionsToTransition, SessionPhase[] memory targetPhases) =
            abi.decode(performData, (uint256[], SessionPhase[]));

        for (uint256 i = 0; i < sessionsToTransition.length; i++) {
            uint256 sessionId = sessionsToTransition[i];
            SessionPhase targetPhase = targetPhases[i];
            VettingSession storage session = vettingSessions[sessionId];

            if (session.isFinalized || !session.autoTransitionEnabled) {
                continue;
            }

            if (
                targetPhase == SessionPhase.Reveal && session.currentPhase == SessionPhase.Commit
                    && block.timestamp >= session.commitEnd
            ) {
                SessionPhase oldPhase = session.currentPhase;
                session.currentPhase = SessionPhase.Reveal;
                emit PhaseTransitioned(sessionId, SessionPhase.Reveal, block.timestamp);
                emit AutoTransitionTriggered(sessionId, oldPhase, SessionPhase.Reveal);
            } else if (
                targetPhase == SessionPhase.Finalized && session.currentPhase == SessionPhase.Reveal
                    && block.timestamp >= session.revealEnd
            ) {
                SessionPhase oldPhase = session.currentPhase;
                _executeFinalization(sessionId);
                emit AutoTransitionTriggered(sessionId, oldPhase, SessionPhase.Finalized);
            }
        }
    }

    //////////////////////
    //  ADMIN FUNCTIONS //
    //////////////////////

    function setAutoTransition(uint256 _sessionId, bool _enabled) external onlyRole(ADMIN_ROLE) {
        VettingSession storage session = vettingSessions[_sessionId];

        if (session.isFinalized) {
            revert VettingJury__AlreadyFinalized();
        }

        session.autoTransitionEnabled = _enabled;

        if (_enabled && sessionIdToIndex[_sessionId] == 0) {
            activeSessionIds.push(_sessionId);
            sessionIdToIndex[_sessionId] = activeSessionIds.length - 1;
        }
    }

    //////////////////////
    //  VIEW FUNCTIONS //
    ////////////////////

    function getVettingSession(uint256 _sessionId)
        external
        view
        returns (
            uint256 electionId,
            uint256[] memory candidateIds,
            address[] memory jurors,
            uint96 commitStart,
            uint96 commitEnd,
            uint96 revealEnd,
            bool isFinalized,
            SessionPhase currentPhase
        )
    {
        VettingSession storage session = vettingSessions[_sessionId];
        return (
            session.electionId,
            session.candidateIds,
            session.jurors,
            session.commitStart,
            session.commitEnd,
            session.revealEnd,
            session.isFinalized,
            session.currentPhase
        );
    }

    /**
     * @notice Get complete vetting results with all evidence and findings
     * @dev Returns detailed info including IPFS links to all juror reports
     */
    function getDetailedVettingResults(uint256 _sessionId, uint256 _candidateId)
        external
        view
        returns (DetailedVettingResults memory)
    {
        VettingSession storage session = vettingSessions[_sessionId];
        uint256 jurySize = session.jurors.length;

        // Count revealed votes
        uint256 revealCount = 0;
        for (uint256 i = 0; i < jurySize; i++) {
            if (voteCommits[_sessionId][_candidateId][session.jurors[i]].hasRevealed) {
                revealCount++;
            }
        }

        // Build arrays with only revealed votes
        string[] memory evidenceLinks = new string[](revealCount);
        string[] memory findings = new string[](revealCount);
        address[] memory jurors = new address[](revealCount);
        bool[] memory approvals = new bool[](revealCount);

        uint256 index = 0;
        uint256 approvalCount = 0;

        for (uint256 i = 0; i < jurySize; i++) {
            address juror = session.jurors[i];

            if (voteCommits[_sessionId][_candidateId][juror].hasRevealed) {
                VoteReveal storage reveal = voteReveals[_sessionId][_candidateId][juror];

                evidenceLinks[index] = reveal.evidenceIPFS;
                findings[index] = reveal.findingsSummary;
                jurors[index] = juror;
                approvals[index] = reveal.approve;

                if (reveal.approve) {
                    approvalCount++;
                }

                index++;
            }
        }

        uint256 rejectionCount = revealCount > approvalCount ? revealCount - approvalCount : 0;
        uint256 percentage = revealCount > 0 ? (approvalCount * 100 / revealCount) : 0;

        return DetailedVettingResults({
            candidateId: _candidateId,
            approvals: approvalCount,
            rejections: rejectionCount,
            totalReveals: revealCount,
            approvalPercentage: percentage,
            evidenceIPFSLinks: evidenceLinks,
            findingsSummaries: findings,
            jurorAddresses: jurors,
            jurorApprovals: approvals
        });
    }

    function getVettedCandidates(uint256 _sessionId) external view returns (uint256[] memory) {
        if (!vettingSessions[_sessionId].isFinalized) {
            revert VettingJury__VettingNotComplete();
        }
        return vettingSessions[_sessionId].vettedCandidates;
    }

    function isJuror(uint256 _sessionId, address _address) external view returns (bool) {
        return vettingSessions[_sessionId].isJuror[_address];
    }

    function hasCommitted(uint256 _sessionId, uint256 _candidateId, address _juror) external view returns (bool) {
        return voteCommits[_sessionId][_candidateId][_juror].hasCommitted;
    }

    function hasRevealed(uint256 _sessionId, uint256 _candidateId, address _juror) external view returns (bool) {
        return voteCommits[_sessionId][_candidateId][_juror].hasRevealed;
    }

    function getApprovalCount(uint256 _sessionId, uint256 _candidateId) external view returns (uint256) {
        return approvalCounts[_sessionId][_candidateId];
    }

    // FIX New getter function for individual juror report
    function getJurorReport(uint256 _sessionId, uint256 _candidateId, address _juror)
        external
        view
        returns (VoteReveal memory)
    {
        return voteReveals[_sessionId][_candidateId][_juror];
    }

    //  FIX: New batch getter for all juror reports on a candidate
    function getAllJurorReports(uint256 _sessionId, uint256 _candidateId)
        external
        view
        returns (JurorReport[] memory)
    {
        VettingSession storage session = vettingSessions[_sessionId];
        uint256 jurySize = session.jurors.length;

        JurorReport[] memory reports = new JurorReport[](jurySize);

        for (uint256 i = 0; i < jurySize;) {
            address juror = session.jurors[i];
            VoteCommit storage commit = voteCommits[_sessionId][_candidateId][juror];
            VoteReveal storage reveal = voteReveals[_sessionId][_candidateId][juror];

            reports[i] = JurorReport({
                juror: juror,
                approve: reveal.approve,
                evidenceIPFS: reveal.evidenceIPFS,
                findingsSummary: reveal.findingsSummary,
                revealedAt: reveal.revealedAt,
                hasRevealed: commit.hasRevealed
            });

            unchecked {
                ++i;
            }
        }

        return reports;
    }

    // NEW: Get vetting results summary for frontend
    function getVettingResults(uint256 _sessionId, uint256 _candidateId)
        external
        view
        returns (uint256 approvals, uint256 rejections, uint256 totalReveals, uint256 approvalPercentage)
    {
        approvals = approvalCounts[_sessionId][_candidateId];
        totalReveals = _countReveals(_sessionId, _candidateId);
        rejections = totalReveals > approvals ? totalReveals - approvals : 0;
        approvalPercentage = totalReveals > 0 ? (approvals * 100 / totalReveals) : 0;

        return (approvals, rejections, totalReveals, approvalPercentage);
    }

    function getActiveSessions() external view returns (uint256[] memory) {
        return activeSessionIds;
    }

    /////////////////////////
    // INTERNAL FUNCTIONS //
    ////////////////////////

    function fulfillRandomWords(uint256 _requestId, uint256[] calldata _randomWords) internal override {
        uint256 sessionId = pendingVRFRequests[_requestId];
        VettingSession storage session = vettingSessions[sessionId];

        if (session.jurors.length > 0) return;

        address[] memory eligibleJurors = _getEligibleJurors();

        if (eligibleJurors.length < session.jurySize) {
            revert VettingJury__InsufficientEligibleJurors();
        }

        address[] memory selectedJurors = _selectRandomJurors(eligibleJurors, session.jurySize, _randomWords[0]);

        session.jurors = selectedJurors;

        for (uint256 i = 0; i < selectedJurors.length;) {
            session.isJuror[selectedJurors[i]] = true;
            unchecked {
                ++i;
            }
        }

        session.currentPhase = SessionPhase.Commit;

        emit JurySelected(sessionId, selectedJurors, _randomWords[0], block.timestamp);
        emit PhaseTransitioned(sessionId, SessionPhase.Commit, block.timestamp);
    }

    function _executeFinalization(uint256 _sessionId) internal {
        VettingSession storage session = vettingSessions[_sessionId];

        uint256[] memory candidates = session.candidateIds;
        uint256[] memory vetted = new uint256[](candidates.length);
        uint256[] memory rejected = new uint256[](candidates.length);
        uint256 vettedCount = 0;
        uint256 rejectedCount = 0;

        for (uint256 i = 0; i < candidates.length;) {
            uint256 candidateId = candidates[i];
            uint256 approvals = approvalCounts[_sessionId][candidateId];
            uint256 totalVotes = _countReveals(_sessionId, candidateId);

            if (totalVotes > 0 && (approvals * 100 / totalVotes) >= APPROVAL_THRESHOLD) {
                vetted[vettedCount++] = candidateId;
            } else {
                rejected[rejectedCount++] = candidateId;
                candidacyNFT.disqualifyCandidate(candidateId);
            }

            unchecked {
                ++i;
            }
        }

        uint256[] memory finalVetted = new uint256[](vettedCount);
        uint256[] memory finalRejected = new uint256[](rejectedCount);

        for (uint256 i = 0; i < vettedCount;) {
            finalVetted[i] = vetted[i];
            unchecked {
                ++i;
            }
        }

        for (uint256 i = 0; i < rejectedCount;) {
            finalRejected[i] = rejected[i];
            unchecked {
                ++i;
            }
        }

        session.vettedCandidates = finalVetted;
        session.isFinalized = true;
        session.currentPhase = SessionPhase.Finalized;

        _removeFromActiveSessions(_sessionId);
        _processJurorStakes(_sessionId);

        emit VettingFinalized(_sessionId, finalVetted, finalRejected, block.timestamp);
        emit PhaseTransitioned(_sessionId, SessionPhase.Finalized, block.timestamp);
    }

    function _removeFromActiveSessions(uint256 _sessionId) internal {
        uint256 index = sessionIdToIndex[_sessionId];
        uint256 lastIndex = activeSessionIds.length - 1;

        if (index != lastIndex) {
            uint256 lastSessionId = activeSessionIds[lastIndex];
            activeSessionIds[index] = lastSessionId;
            sessionIdToIndex[lastSessionId] = index;
        }

        activeSessionIds.pop();
        delete sessionIdToIndex[_sessionId];
    }

    function _getEligibleJurors() internal view returns (address[] memory) {
        address[] memory allMembers = identityRegistry.getAllMembers();
        address[] memory eligible = new address[](allMembers.length);
        uint256 count = 0;

        for (uint256 i = 0; i < allMembers.length; i++) {
            if (identityRegistry.isEligibleJuror(allMembers[i])) {
                eligible[count++] = allMembers[i];
            }
        }

        address[] memory result = new address[](count);
        for (uint256 i = 0; i < count;) {
            result[i] = eligible[i];
            unchecked {
                ++i;
            }
        }

        return result;
    }

    function getSessionProgress(uint256 _sessionId)
        external
        view
        returns (string memory phase, uint256 timeRemaining)
    {
        VettingSession storage s = vettingSessions[_sessionId];
        if (s.currentPhase == SessionPhase.Commit) {
            return ("Commit", s.commitEnd > block.timestamp ? s.commitEnd - block.timestamp : 0);
        }
        // ... similar for other phases
    }

    function _selectRandomJurors(address[] memory _pool, uint256 _jurySize, uint256 _randomSeed)
        internal
        pure
        returns (address[] memory)
    {
        address[] memory shuffled = new address[](_pool.length);

        for (uint256 i = 0; i < _pool.length;) {
            shuffled[i] = _pool[i];
            unchecked {
                ++i;
            }
        }

        for (uint256 i = 0; i < _pool.length;) {
            uint256 j = uint256(keccak256(abi.encodePacked(_randomSeed, i))) % _pool.length;
            (shuffled[i], shuffled[j]) = (shuffled[j], shuffled[i]);
            unchecked {
                ++i;
            }
        }

        address[] memory selected = new address[](_jurySize);
        for (uint256 i = 0; i < _jurySize;) {
            selected[i] = shuffled[i];
            unchecked {
                ++i;
            }
        }

        return selected;
    }

    function _countReveals(uint256 _sessionId, uint256 _candidateId) internal view returns (uint256) {
        uint256 count = 0;
        VettingSession storage session = vettingSessions[_sessionId];

        for (uint256 i = 0; i < session.jurors.length;) {
            if (voteCommits[_sessionId][_candidateId][session.jurors[i]].hasRevealed) {
                count++;
            }
            unchecked {
                ++i;
            }
        }

        return count;
    }

    function _processJurorStakes(uint256 _sessionId) internal {
        VettingSession storage session = vettingSessions[_sessionId];

        for (uint256 i = 0; i < session.jurors.length;) {
            address juror = session.jurors[i];
            uint256 stake = jurorStakes[_sessionId][juror];

            if (stake > 0) {
                bool participated = _didJurorParticipate(_sessionId, juror);

                if (participated) {
                    (bool success,) = juror.call{value: stake}("");
                    require(success, "Stake return failed");
                    emit StakeReturned(_sessionId, juror, stake);
                } else {
                    emit StakeSlashed(_sessionId, juror, stake);
                }

                jurorStakes[_sessionId][juror] = 0;
            }

            unchecked {
                ++i;
            }
        }
    }

    function _didJurorParticipate(uint256 _sessionId, address _juror) internal view returns (bool) {
        VettingSession storage session = vettingSessions[_sessionId];
        uint256 revealedCount = 0;

        for (uint256 i = 0; i < session.candidateIds.length;) {
            if (voteCommits[_sessionId][session.candidateIds[i]][_juror].hasRevealed) {
                revealedCount++;
            }
            unchecked {
                ++i;
            }
        }

        return revealedCount >= (session.candidateIds.length / 2);
    }
}
