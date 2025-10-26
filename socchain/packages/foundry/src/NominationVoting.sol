// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

import {IdentityRegistry} from "./IdentityRegistry.sol";
import {CandidacyNFT} from "./CandidacyNft.sol";

/**
 * @title NominationVoting
 * @author Emmanuel Nyamweya
 * @notice Phase 1: Community nominates candidates via approval voting
 * @dev FIXED: Optimized leaderboard with cached top candidates
 */
contract NominationVoting is AccessControl, ReentrancyGuard, AutomationCompatibleInterface {
    /////////////////////
    //  CUSTOM ERRORS //
    ///////////////////

    error NominationVoting__NotEligible();
    error NominationVoting__AlreadyVoted();
    error NominationVoting__InvalidCandidate();
    error NominationVoting__NominationPeriodNotStarted();
    error NominationVoting__NominationPeriodEnded();
    error NominationVoting__TooManyNominations();
    error NominationVoting__NotFinalized();
    error NominationVoting__AlreadyFinalized();
    error NominationVoting__InsufficientCandidates();
    error NominationVoting__ZeroAddress();
    error NominationVoting__InvalidElectionId();

    /////////////////////////
    // TYPE DECLARATIONS //
    //////////////////////

    struct Election {
        uint256 electionId;
        uint96 nominationStart;
        uint96 nominationEnd;
        uint256 topN;
        uint256 minimumNominations;
        bool isFinalized;
        uint256[] topCandidates;
        bool autoFinalizationEnabled;
        uint256[] cachedLeaderboard; //  Cached sorted candidate IDs
        uint256 lastLeaderboardUpdate; //   Track cache freshness
    }

    struct NominationData {
        mapping(uint256 => uint256) nominationCount;
        mapping(address => bool) hasVoted;
        mapping(address => uint256[]) voterNominations;
        uint256 totalVoters;
    }

    // NEW: Leaderboard entry for efficient frontend display
    struct LeaderboardEntry {
        uint256 candidateId;
        uint256 nominationCount;
        address candidateAddress;
        string platformSummary;
        bool isActive;
    }

    /////////////////////////
    //  STATE VARIABLES   //
    ////////////////////////

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant AUTOMATION_ROLE = keccak256("AUTOMATION_ROLE");

    IdentityRegistry public immutable identityRegistry;
    CandidacyNFT public immutable candidacyNFT;

    uint256 public electionCounter;
    uint256 public constant MAX_NOMINATIONS_PER_VOTER = 10;
    uint256 public constant LEADERBOARD_CACHE_DURATION = 5 minutes;

    mapping(uint256 => Election) public elections;
    mapping(uint256 => NominationData) private nominationData;

    uint256[] private activeElectionIds;
    mapping(uint256 => uint256) private electionIdToIndex;

    /////////////
    // EVENTS //
    ///////////

    event ElectionCreated(
        uint256 indexed electionId,
        uint96 nominationStart,
        uint96 nominationEnd,
        uint256 topN,
        uint256 minimumNominations
    );
    event NominationCast(uint256 indexed electionId, address indexed voter, uint256[] candidates, uint256 timestamp);
    event NominationsFinalized(uint256 indexed electionId, uint256[] topCandidates, uint256 timestamp);
    event ElectionParametersUpdated(uint256 indexed electionId, uint96 newEnd, uint256 newTopN);
    event AutoFinalizationTriggered(uint256 indexed electionId, uint256 timestamp);
    event LeaderboardCacheUpdated(uint256 indexed electionId, uint256 timestamp);

    //////////////////
    // CONSTRUCTOR //
    ////////////////

    constructor(address _identityRegistry, address _candidacyNFT) {
        if (_identityRegistry == address(0) || _candidacyNFT == address(0)) {
            revert NominationVoting__ZeroAddress();
        }

        identityRegistry = IdentityRegistry(_identityRegistry);
        candidacyNFT = CandidacyNFT(_candidacyNFT);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(AUTOMATION_ROLE, msg.sender);
    }

    /////////////////////////
    // EXTERNAL FUNCTIONS //
    ///////////////////////

    function createElection(
        uint96 _nominationStart,
        uint96 _nominationEnd,
        uint256 _topN,
        uint256 _minimumNominations,
        bool _autoFinalizationEnabled
    ) external onlyRole(ADMIN_ROLE) returns (uint256) {
        if (_nominationEnd <= _nominationStart) revert NominationVoting__InvalidElectionId();
        if (_topN == 0) revert NominationVoting__InvalidElectionId();

        uint256 electionId = ++electionCounter;

        elections[electionId] = Election({
            electionId: electionId,
            nominationStart: _nominationStart,
            nominationEnd: _nominationEnd,
            topN: _topN,
            minimumNominations: _minimumNominations,
            isFinalized: false,
            topCandidates: new uint256[](0),
            autoFinalizationEnabled: _autoFinalizationEnabled,
            cachedLeaderboard: new uint256[](0),
            lastLeaderboardUpdate: 0
        });

        if (_autoFinalizationEnabled) {
            activeElectionIds.push(electionId);
            electionIdToIndex[electionId] = activeElectionIds.length - 1;
        }

        emit ElectionCreated(electionId, _nominationStart, _nominationEnd, _topN, _minimumNominations);

        return electionId;
    }

    function nominate(uint256 _electionId, uint256[] calldata _candidateIds) external nonReentrant {
        if (!identityRegistry.isEligibleVoter(msg.sender)) {
            revert NominationVoting__NotEligible();
        }

        Election storage election = elections[_electionId];

        if (block.timestamp < election.nominationStart) {
            revert NominationVoting__NominationPeriodNotStarted();
        }

        if (block.timestamp >= election.nominationEnd) {
            revert NominationVoting__NominationPeriodEnded();
        }

        if (election.isFinalized) {
            revert NominationVoting__AlreadyFinalized();
        }

        NominationData storage data = nominationData[_electionId];

        if (data.hasVoted[msg.sender]) {
            revert NominationVoting__AlreadyVoted();
        }

        uint256 numNominations = _candidateIds.length;
        if (numNominations == 0 || numNominations > MAX_NOMINATIONS_PER_VOTER) {
            revert NominationVoting__TooManyNominations();
        }

        uint256[] memory activeCandidates = candidacyNFT.getActiveCandidatesForElection(_electionId);

        for (uint256 i = 0; i < numNominations;) {
            uint256 candidateId = _candidateIds[i];

            if (!_isActiveCandidate(candidateId, activeCandidates)) {
                revert NominationVoting__InvalidCandidate();
            }

            data.nominationCount[candidateId]++;

            unchecked {
                ++i;
            }
        }

        data.hasVoted[msg.sender] = true;
        data.voterNominations[msg.sender] = _candidateIds;
        data.totalVoters++;

        // Invalidate cache on new vote
        election.lastLeaderboardUpdate = 0;

        identityRegistry.recordActivity(msg.sender);

        emit NominationCast(_electionId, msg.sender, _candidateIds, block.timestamp);
    }

    function finalizeNominations(uint256 _electionId) external nonReentrant {
        if (block.timestamp < elections[_electionId].nominationEnd) {
            revert NominationVoting__NominationPeriodEnded();
        }

        if (elections[_electionId].isFinalized) {
            revert NominationVoting__AlreadyFinalized();
        }

        _executeFinalization(_electionId);
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
        uint256[] memory electionsToFinalize = new uint256[](activeElectionIds.length);
        uint256 count = 0;

        for (uint256 i = 0; i < activeElectionIds.length; i++) {
            uint256 electionId = activeElectionIds[i];
            Election storage election = elections[electionId];

            if (!election.isFinalized && election.autoFinalizationEnabled && block.timestamp >= election.nominationEnd)
            {
                electionsToFinalize[count] = electionId;
                count++;
            }
        }

        if (count > 0) {
            uint256[] memory finalElections = new uint256[](count);
            for (uint256 i = 0; i < count; i++) {
                finalElections[i] = electionsToFinalize[i];
            }

            return (true, abi.encode(finalElections));
        }

        return (false, "");
    }

    function performUpkeep(bytes calldata performData) external override onlyRole(AUTOMATION_ROLE) {
        uint256[] memory electionsToFinalize = abi.decode(performData, (uint256[]));

        for (uint256 i = 0; i < electionsToFinalize.length; i++) {
            uint256 electionId = electionsToFinalize[i];
            Election storage election = elections[electionId];

            if (!election.isFinalized && election.autoFinalizationEnabled && block.timestamp >= election.nominationEnd)
            {
                _executeFinalization(electionId);
                emit AutoFinalizationTriggered(electionId, block.timestamp);
            }
        }
    }

    //////////////////////
    //  ADMIN FUNCTIONS //
    //////////////////////

    function updateElectionParameters(uint256 _electionId, uint96 _newNominationEnd, uint256 _newTopN)
        external
        onlyRole(ADMIN_ROLE)
    {
        Election storage election = elections[_electionId];

        if (election.isFinalized) {
            revert NominationVoting__AlreadyFinalized();
        }

        if (_newNominationEnd > election.nominationStart) {
            election.nominationEnd = _newNominationEnd;
        }

        if (_newTopN > 0) {
            election.topN = _newTopN;
        }

        emit ElectionParametersUpdated(_electionId, _newNominationEnd, _newTopN);
    }

    function setAutoFinalization(uint256 _electionId, bool _enabled) external onlyRole(ADMIN_ROLE) {
        Election storage election = elections[_electionId];

        if (election.isFinalized) {
            revert NominationVoting__AlreadyFinalized();
        }

        election.autoFinalizationEnabled = _enabled;

        if (_enabled && electionIdToIndex[_electionId] == 0) {
            activeElectionIds.push(_electionId);
            electionIdToIndex[_electionId] = activeElectionIds.length - 1;
        }
    }

    // Manual cache refresh for admin
    function refreshLeaderboardCache(uint256 _electionId) external onlyRole(ADMIN_ROLE) {
        _updateLeaderboardCache(_electionId);
    }

    //////////////////////
    //  VIEW FUNCTIONS //
    ////////////////////

    function getNominationCount(uint256 _electionId, uint256 _candidateId) external view returns (uint256) {
        return nominationData[_electionId].nominationCount[_candidateId];
    }

    function hasVoted(uint256 _electionId, address _voter) external view returns (bool) {
        return nominationData[_electionId].hasVoted[_voter];
    }

    function getVoterNominations(uint256 _electionId, address _voter) external view returns (uint256[] memory) {
        return nominationData[_electionId].voterNominations[_voter];
    }

    function getTotalVoters(uint256 _electionId) external view returns (uint256) {
        return nominationData[_electionId].totalVoters;
    }

    function getTopCandidates(uint256 _electionId) external view returns (uint256[] memory) {
        if (!elections[_electionId].isFinalized) {
            revert NominationVoting__NotFinalized();
        }

        return elections[_electionId].topCandidates;
    }

    function getElection(uint256 _electionId)
        external
        view
        returns (
            uint96 nominationStart,
            uint96 nominationEnd,
            uint256 topN,
            uint256 minimumNominations,
            bool isFinalized,
            uint256 totalVoters,
            bool autoFinalizationEnabled
        )
    {
        Election memory election = elections[_electionId];
        return (
            election.nominationStart,
            election.nominationEnd,
            election.topN,
            election.minimumNominations,
            election.isFinalized,
            nominationData[_electionId].totalVoters,
            election.autoFinalizationEnabled
        );
    }

    // FIX: Optimized leaderboard with caching
    function getNominationLeaderboard(uint256 _electionId)
        external
        view
        returns (uint256[] memory candidateIds, uint256[] memory counts)
    {
        Election storage election = elections[_electionId];

        // Use cached leaderboard if fresh
        if (
            election.cachedLeaderboard.length > 0
                && (block.timestamp - election.lastLeaderboardUpdate) < LEADERBOARD_CACHE_DURATION
        ) {
            uint256 cachedLength = election.cachedLeaderboard.length;
            candidateIds = new uint256[](cachedLength);
            counts = new uint256[](cachedLength);

            NominationData storage cachedData = nominationData[_electionId];

            for (uint256 i = 0; i < cachedLength;) {
                candidateIds[i] = election.cachedLeaderboard[i];
                counts[i] = cachedData.nominationCount[election.cachedLeaderboard[i]];
                unchecked {
                    ++i;
                }
            }

            return (candidateIds, counts);
        }

        // Fallback: compute fresh (expensive)
        uint256[] memory activeCandidates = candidacyNFT.getActiveCandidatesForElection(_electionId);
        uint256 length = activeCandidates.length;

        candidateIds = new uint256[](length);
        counts = new uint256[](length);

        NominationData storage data = nominationData[_electionId];

        for (uint256 i = 0; i < length;) {
            candidateIds[i] = activeCandidates[i];
            counts[i] = data.nominationCount[activeCandidates[i]];
            unchecked {
                ++i;
            }
        }

        (candidateIds, counts) = _sortLeaderboard(candidateIds, counts);

        return (candidateIds, counts);
    }

    function getTopNLeaderboard(uint256 _electionId, uint256 _limit)
        external
        view
        returns (LeaderboardEntry[] memory)
    {
        uint256[] memory activeCandidates = candidacyNFT.getActiveCandidatesForElection(_electionId);

        uint256 length = activeCandidates.length;
        if (_limit < length) length = _limit;

        // Get counts and sort
        uint256[] memory candidateIds = new uint256[](activeCandidates.length);
        uint256[] memory counts = new uint256[](activeCandidates.length);

        NominationData storage data = nominationData[_electionId];

        for (uint256 i = 0; i < activeCandidates.length;) {
            candidateIds[i] = activeCandidates[i];
            counts[i] = data.nominationCount[activeCandidates[i]];
            unchecked {
                ++i;
            }
        }

        (candidateIds, counts) = _sortLeaderboard(candidateIds, counts);

        // Build rich entries
        LeaderboardEntry[] memory entries = new LeaderboardEntry[](length);

        for (uint256 i = 0; i < length;) {
            CandidacyNFT.Candidacy memory candidacy = candidacyNFT.getCandidacyInfo(candidateIds[i]);

            entries[i] = LeaderboardEntry({
                candidateId: candidateIds[i],
                nominationCount: counts[i],
                candidateAddress: candidacy.candidate,
                platformSummary: candidacy.platformSummary,
                isActive: candidacy.isActive
            });

            unchecked {
                ++i;
            }
        }

        return entries;
    }

    function getCurrentPhase(uint256 _electionId) external view returns (string memory) {
        Election memory e = elections[_electionId];
        if (block.timestamp < e.nominationStart) return "Pending";
        if (block.timestamp < e.nominationEnd) return "Nominating";
        if (e.isFinalized) return "Finalized";
        return "Ended";
    }

    function batchGetNominationCounts(uint256 _electionId, uint256[] calldata _candidateIds)
        external
        view
        returns (uint256[] memory)
    {
        uint256 length = _candidateIds.length;
        uint256[] memory counts = new uint256[](length);

        NominationData storage data = nominationData[_electionId];

        for (uint256 i = 0; i < length;) {
            counts[i] = data.nominationCount[_candidateIds[i]];
            unchecked {
                ++i;
            }
        }

        return counts;
    }

    function getActiveElections() external view returns (uint256[] memory) {
        return activeElectionIds;
    }

    /////////////////////////
    // INTERNAL FUNCTIONS //
    ////////////////////////

    function _executeFinalization(uint256 _electionId) internal {
        uint256[] memory activeCandidates = candidacyNFT.getActiveCandidatesForElection(_electionId);

        if (activeCandidates.length == 0) {
            revert NominationVoting__InsufficientCandidates();
        }

        uint256[] memory sortedCandidates = _sortCandidatesByNominations(_electionId, activeCandidates);

        NominationData storage data = nominationData[_electionId];
        uint256 topN = elections[_electionId].topN;
        uint256 minNominations = elections[_electionId].minimumNominations;
        uint256 qualifiedCount = 0;

        for (uint256 i = 0; i < sortedCandidates.length && qualifiedCount < topN; i++) {
            uint256 candidateId = sortedCandidates[i];

            if (data.nominationCount[candidateId] >= minNominations) {
                elections[_electionId].topCandidates.push(candidateId);
                qualifiedCount++;
            }
        }

        if (qualifiedCount == 0) {
            revert NominationVoting__InsufficientCandidates();
        }

        elections[_electionId].isFinalized = true;

        _removeFromActiveElections(_electionId);

        emit NominationsFinalized(_electionId, elections[_electionId].topCandidates, block.timestamp);
    }

    function _updateLeaderboardCache(uint256 _electionId) internal {
        Election storage election = elections[_electionId];

        uint256[] memory activeCandidates = candidacyNFT.getActiveCandidatesForElection(_electionId);
        uint256[] memory sortedCandidates = _sortCandidatesByNominations(_electionId, activeCandidates);

        // Store top 20 or all candidates, whichever is smaller
        uint256 cacheSize = sortedCandidates.length > 20 ? 20 : sortedCandidates.length;
        delete election.cachedLeaderboard;

        for (uint256 i = 0; i < cacheSize;) {
            election.cachedLeaderboard.push(sortedCandidates[i]);
            unchecked {
                ++i;
            }
        }

        election.lastLeaderboardUpdate = block.timestamp;

        emit LeaderboardCacheUpdated(_electionId, block.timestamp);
    }

    function _removeFromActiveElections(uint256 _electionId) internal {
        uint256 index = electionIdToIndex[_electionId];
        uint256 lastIndex = activeElectionIds.length - 1;

        if (index != lastIndex) {
            uint256 lastElectionId = activeElectionIds[lastIndex];
            activeElectionIds[index] = lastElectionId;
            electionIdToIndex[lastElectionId] = index;
        }

        activeElectionIds.pop();
        delete electionIdToIndex[_electionId];
    }

    function _isActiveCandidate(uint256 _candidateId, uint256[] memory _activeCandidates)
        internal
        pure
        returns (bool)
    {
        for (uint256 i = 0; i < _activeCandidates.length;) {
            if (_activeCandidates[i] == _candidateId) {
                return true;
            }
            unchecked {
                ++i;
            }
        }
        return false;
    }

    function _sortCandidatesByNominations(uint256 _electionId, uint256[] memory _candidates)
        internal
        view
        returns (uint256[] memory)
    {
        uint256 length = _candidates.length;
        uint256[] memory sorted = new uint256[](length);

        for (uint256 i = 0; i < length;) {
            sorted[i] = _candidates[i];
            unchecked {
                ++i;
            }
        }

        NominationData storage data = nominationData[_electionId];

        for (uint256 i = 0; i < length - 1; i++) {
            for (uint256 j = 0; j < length - i - 1; j++) {
                if (data.nominationCount[sorted[j]] < data.nominationCount[sorted[j + 1]]) {
                    uint256 temp = sorted[j];
                    sorted[j] = sorted[j + 1];
                    sorted[j + 1] = temp;
                }
            }
        }

        return sorted;
    }

    function _sortLeaderboard(uint256[] memory _ids, uint256[] memory _counts)
        internal
        pure
        returns (uint256[] memory, uint256[] memory)
    {
        uint256 length = _ids.length;

        for (uint256 i = 0; i < length - 1; i++) {
            for (uint256 j = 0; j < length - i - 1; j++) {
                if (_counts[j] < _counts[j + 1]) {
                    (_counts[j], _counts[j + 1]) = (_counts[j + 1], _counts[j]);
                    (_ids[j], _ids[j + 1]) = (_ids[j + 1], _ids[j]);
                }
            }
        }

        return (_ids, _counts);
    }
}
