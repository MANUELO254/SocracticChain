// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

interface IIdentityRegistry {
    function isEligibleJuror(address _juror) external view returns (bool);
    function recordActivity(address _member) external;
}

interface INominationVoting {
    function getTopCandidates(uint256 _electionId) external view returns (uint256[] memory);
}

interface ICandidacyNFT {
    function disqualifyCandidate(uint256 _tokenId) external;
}

/**
 * @title VettingJury
 * @author Emmanuel Nyamweya
 * @notice Phase 2: Random jury vets candidates via commit-reveal voting
 * @dev Uses Chainlink VRF for random selection, commit-reveal for privacy
 */
contract VettingJury is VRFConsumerBaseV2Plus, AccessControl, ReentrancyGuard {
    
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
    }
    
    struct VoteCommit {
        bytes32 commitHash;
        bool hasCommitted;
        bool hasRevealed;
    }
    
    struct VoteReveal {
        bool approve;
        string evidenceIPFS;
    }
    
   /////////////////////////
   //  STATE VARIABLES   //
   ////////////////////////
    
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    IIdentityRegistry public immutable identityRegistry;
    INominationVoting public immutable nominationVoting;
    ICandidacyNFT public immutable candidacyNFT;
    
    uint256 public immutable vrfSubscriptionId;
    bytes32 public immutable vrfKeyHash;
    uint32 public constant VRF_CALLBACK_GAS_LIMIT = 500000;
    uint16 public constant VRF_REQUEST_CONFIRMATIONS = 3;
    uint32 public constant VRF_NUM_WORDS = 1;
    
    uint256 public constant APPROVAL_THRESHOLD = 60;
    uint256 public constant DEFAULT_STAKE_AMOUNT = 0.01 ether;
    
    uint256 public sessionCounter;
    mapping(uint256 => VettingSession) private vettingSessions;
    mapping(uint256 => mapping(uint256 => mapping(address => VoteCommit))) private voteCommits;
    mapping(uint256 => mapping(uint256 => mapping(address => VoteReveal))) private voteReveals;
    mapping(uint256 => mapping(uint256 => uint256)) private approvalCounts;
    mapping(uint256 => mapping(address => uint256)) public jurorStakes;
    mapping(uint256 => uint256) private pendingVRFRequests;
    
    /////////////
    // EVENTS //
    ///////////
    
    event VettingSessionCreated(uint256 indexed sessionId, uint256 indexed electionId, uint256[] candidateIds, uint256 jurySize, uint256 stakeAmount);
    event JurySelectionRequested(uint256 indexed sessionId, uint256 requestId);
    event JurySelected(uint256 indexed sessionId, address[] jurors, uint256 randomSeed, uint256 timestamp);
    event JurorStaked(uint256 indexed sessionId, address indexed juror, uint256 amount);
    event VoteCommitted(uint256 indexed sessionId, uint256 indexed candidateId, address indexed juror, uint256 timestamp);
    event VoteRevealed(uint256 indexed sessionId, uint256 indexed candidateId, address indexed juror, bool approved, string evidenceIPFS, uint256 timestamp);
    event VettingFinalized(uint256 indexed sessionId, uint256[] vettedCandidates, uint256[] rejectedCandidates, uint256 timestamp);
    event StakeSlashed(uint256 indexed sessionId, address indexed juror, uint256 amount);
    event StakeReturned(uint256 indexed sessionId, address indexed juror, uint256 amount);
    
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
        identityRegistry = IIdentityRegistry(_identityRegistry);
        nominationVoting = INominationVoting(_nominationVoting);
        candidacyNFT = ICandidacyNFT(_candidacyNFT);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }
    
/////////////////////////
// EXTERNAL FUNCTIONS //
///////////////////////
    
    /**
     * @notice Create vetting session for election's top candidates
     */
    function createVettingSession(
        uint256 _electionId,
        uint256 _jurySize,
        uint96 _commitDuration,
        uint96 _revealDuration,
        uint256 _stakeAmount
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
        
        uint96 currentTime = uint96(block.timestamp);
        session.commitStart = currentTime;
        session.commitEnd = currentTime + _commitDuration;
        session.revealEnd = currentTime + _commitDuration + _revealDuration;
        
        emit VettingSessionCreated(sessionId, _electionId, candidateIds, _jurySize, _stakeAmount);
        
        return sessionId;
    }
    
    /**
     * @notice Request random jury selection via Chainlink VRF
     */
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
    
    /**
     * @notice Stake to participate as juror (after selection)
     */
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
    
    /**
     * @notice Commit vote (hashed vote + secret)
     * @param _sessionId Vetting session
     * @param _candidateId Candidate being vetted
     * @param _commitHash keccak256(abi.encodePacked(approve, secret, msg.sender))
     */
    function commitVote(
        uint256 _sessionId,
        uint256 _candidateId,
        bytes32 _commitHash
    ) external {
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
    
    /**
     * @notice Reveal vote (must match commit hash)
     */
    function revealVote(
        uint256 _sessionId,
        uint256 _candidateId,
        bool _approve,
        string calldata _evidenceIPFS,
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
            evidenceIPFS: _evidenceIPFS
        });
        
        if (_approve) {
            approvalCounts[_sessionId][_candidateId]++;
        }
        
        identityRegistry.recordActivity(msg.sender);
        
        emit VoteRevealed(_sessionId, _candidateId, msg.sender, _approve, _evidenceIPFS, block.timestamp);
    }
    
    /**
     * @notice Finalize vetting and disqualify rejected candidates
     */
    function finalizeVetting(uint256 _sessionId) external nonReentrant {
        VettingSession storage session = vettingSessions[_sessionId];
        
        if (block.timestamp < session.revealEnd) {
            revert VettingJury__VettingNotComplete();
        }
        
        if (session.isFinalized) {
            revert VettingJury__AlreadyFinalized();
        }
        
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
            
            unchecked { ++i; }
        }
        
        uint256[] memory finalVetted = new uint256[](vettedCount);
        uint256[] memory finalRejected = new uint256[](rejectedCount);
        
        for (uint256 i = 0; i < vettedCount;) {
            finalVetted[i] = vetted[i];
            unchecked { ++i; }
        }
        
        for (uint256 i = 0; i < rejectedCount;) {
            finalRejected[i] = rejected[i];
            unchecked { ++i; }
        }
        
        session.vettedCandidates = finalVetted;
        session.isFinalized = true;
        
        _processJurorStakes(_sessionId);
        
        emit VettingFinalized(_sessionId, finalVetted, finalRejected, block.timestamp);
    }
    
   //////////////////////
   //  VIEW FUNCTIONS //
   ////////////////////
    
    function getVettingSession(uint256 _sessionId) external view returns (
        uint256 electionId,
        uint256[] memory candidateIds,
        address[] memory jurors,
        uint96 commitStart,
        uint96 commitEnd,
        uint96 revealEnd,
        bool isFinalized
    ) {
        VettingSession storage session = vettingSessions[_sessionId];
        return (
            session.electionId,
            session.candidateIds,
            session.jurors,
            session.commitStart,
            session.commitEnd,
            session.revealEnd,
            session.isFinalized
        );
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
    
    function getVoteReveal(uint256 _sessionId, uint256 _candidateId, address _juror) external view returns (
        bool approve,
        string memory evidenceIPFS
    ) {
        VoteReveal memory reveal = voteReveals[_sessionId][_candidateId][_juror];
        return (reveal.approve, reveal.evidenceIPFS);
    }
    
    /////////////////////////
    // INTERNAL FUNCTIONS //
    ////////////////////////
    
    /**
     * @notice Chainlink VRF callback
     */
    function fulfillRandomWords(uint256 _requestId, uint256[] calldata _randomWords) internal override {
        uint256 sessionId = pendingVRFRequests[_requestId];
        VettingSession storage session = vettingSessions[sessionId];
        
        if (session.jurors.length > 0) return;
        
        address[] memory eligibleJurors = _getEligibleJurors();
        
        if (eligibleJurors.length < session.jurySize) {
            revert VettingJury__InsufficientEligibleJurors();
        }
        
        address[] memory selectedJurors = _selectRandomJurors(
            eligibleJurors,
            session.jurySize,
            _randomWords[0]
        );
        
        session.jurors = selectedJurors;
        
        for (uint256 i = 0; i < selectedJurors.length;) {
            session.isJuror[selectedJurors[i]] = true;
            unchecked { ++i; }
        }
        
        emit JurySelected(sessionId, selectedJurors, _randomWords[0], block.timestamp);
    }
    
    function _getEligibleJurors() internal view returns (address[] memory) {
        address[] memory allMembers = new address[](100);
        uint256 count = 0;
        
        for (uint256 i = 0; i < 100; i++) {
            address member = address(uint160(i + 1));
            if (identityRegistry.isEligibleJuror(member)) {
                allMembers[count++] = member;
            }
        }
        
        address[] memory eligible = new address[](count);
        for (uint256 i = 0; i < count;) {
            eligible[i] = allMembers[i];
            unchecked { ++i; }
        }
        
        return eligible;
    }
    
    function _selectRandomJurors(
        address[] memory _pool,
        uint256 _jurySize,
        uint256 _randomSeed
    ) internal pure returns (address[] memory) {
        address[] memory shuffled = new address[](_pool.length);
        
        for (uint256 i = 0; i < _pool.length;) {
            shuffled[i] = _pool[i];
            unchecked { ++i; }
        }
        
        for (uint256 i = 0; i < _pool.length;) {
            uint256 j = uint256(keccak256(abi.encodePacked(_randomSeed, i))) % _pool.length;
            (shuffled[i], shuffled[j]) = (shuffled[j], shuffled[i]);
            unchecked { ++i; }
        }
        
        address[] memory selected = new address[](_jurySize);
        for (uint256 i = 0; i < _jurySize;) {
            selected[i] = shuffled[i];
            unchecked { ++i; }
        }
        
        return selected;
    }
    
    function _countReveals(uint256 _sessionId, uint256 _candidateId) internal view returns (uint256) {
        VettingSession storage session = vettingSessions[_sessionId];
        uint256 count = 0;
        
        for (uint256 i = 0; i < session.jurors.length;) {
            if (voteCommits[_sessionId][_candidateId][session.jurors[i]].hasRevealed) {
                count++;
            }
            unchecked { ++i; }
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
                    (bool success, ) = juror.call{value: stake}("");
                    require(success, "Stake return failed");
                    emit StakeReturned(_sessionId, juror, stake);
                } else {
                    emit StakeSlashed(_sessionId, juror, stake);
                }
                
                jurorStakes[_sessionId][juror] = 0;
            }
            
            unchecked { ++i; }
        }
    }
    
    function _didJurorParticipate(uint256 _sessionId, address _juror) internal view returns (bool) {
        VettingSession storage session = vettingSessions[_sessionId];
        uint256 revealedCount = 0;
        
        for (uint256 i = 0; i < session.candidateIds.length;) {
            if (voteCommits[_sessionId][session.candidateIds[i]][_juror].hasRevealed) {
                revealedCount++;
            }
            unchecked { ++i; }
        }
        
        return revealedCount >= (session.candidateIds.length / 2);
    }
}