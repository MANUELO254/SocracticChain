// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IIdentityRegistry {
    function isEligibleVoter(address _voter) external view returns (bool);
    function recordActivity(address _member) external;
}

interface ICandidacyNFT {
    function getActiveCandidatesForElection(uint256 _electionId) external view returns (uint256[] memory);
    function getCandidacy(uint256 _tokenId) external view returns (
        address candidate,
        uint96 mintedAt,
        uint256 electionId,
        bool isActive,
        uint96 disqualifiedAt,
        string memory platformIPFS
    );
}

/**
 * @title NominationVoting
 * @author Emmanuel Nyamweya
 * @notice Phase 1: Community nominates candidates via approval voting
 * @dev Top N most-nominated candidates advance to vetting phase
 */
contract NominationVoting is AccessControl, ReentrancyGuard {
    
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
    }
    
    struct NominationData {
        mapping(uint256 => uint256) nominationCount;  // candidateId => count
        mapping(address => bool) hasVoted;
        mapping(address => uint256[]) voterNominations;  // voter => candidateIds
        uint256 totalVoters;
    }
    
   /////////////////////////
   //  STATE VARIABLES   //
   ////////////////////////
    
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    IIdentityRegistry public immutable identityRegistry;
    ICandidacyNFT public immutable candidacyNFT;
    
    uint256 public electionCounter;
    uint256 public constant MAX_NOMINATIONS_PER_VOTER = 10;
    
    mapping(uint256 => Election) public elections;
    mapping(uint256 => NominationData) private nominationData;
    
    /////////////
    // EVENTS //
    ///////////
    
    event ElectionCreated(uint256 indexed electionId, uint96 nominationStart, uint96 nominationEnd, uint256 topN, uint256 minimumNominations);
    event NominationCast(uint256 indexed electionId, address indexed voter, uint256[] candidates, uint256 timestamp);
    event NominationsFinalized(uint256 indexed electionId, uint256[] topCandidates, uint256 timestamp);
    event ElectionParametersUpdated(uint256 indexed electionId, uint96 newEnd, uint256 newTopN);
    
  //////////////////
  // CONSTRUCTOR //
  ////////////////
    
    constructor(address _identityRegistry, address _candidacyNFT) {
        if (_identityRegistry == address(0) || _candidacyNFT == address(0)) {
            revert NominationVoting__ZeroAddress();
        }
        
        identityRegistry = IIdentityRegistry(_identityRegistry);
        candidacyNFT = ICandidacyNFT(_candidacyNFT);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }
    
/////////////////////////
// EXTERNAL FUNCTIONS //
///////////////////////
    
    /**
     * @notice Create new nomination election
     */
    function createElection(
        uint96 _nominationStart,
        uint96 _nominationEnd,
        uint256 _topN,
        uint256 _minimumNominations
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
            topCandidates: new uint256[](0)
        });
        
        emit ElectionCreated(electionId, _nominationStart, _nominationEnd, _topN, _minimumNominations);
        
        return electionId;
    }
    
    /**
     * @notice Cast nomination votes (approval voting - can nominate multiple)
     * @param _electionId Election to vote in
     * @param _candidateIds Array of candidate NFT IDs to nominate
     */
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
            
            unchecked { ++i; }
        }
        
        data.hasVoted[msg.sender] = true;
        data.voterNominations[msg.sender] = _candidateIds;
        data.totalVoters++;
        
        identityRegistry.recordActivity(msg.sender);
        
        emit NominationCast(_electionId, msg.sender, _candidateIds, block.timestamp);
    }
    
    /**
     * @notice Finalize nominations and determine top N candidates
     * @param _electionId Election to finalize
     */
    function finalizeNominations(uint256 _electionId) external nonReentrant {
        Election storage election = elections[_electionId];
        
        if (block.timestamp < election.nominationEnd) {
            revert NominationVoting__NominationPeriodEnded();
        }
        
        if (election.isFinalized) {
            revert NominationVoting__AlreadyFinalized();
        }
        
        uint256[] memory activeCandidates = candidacyNFT.getActiveCandidatesForElection(_electionId);
        
        if (activeCandidates.length == 0) {
            revert NominationVoting__InsufficientCandidates();
        }
        
        uint256[] memory sortedCandidates = _sortCandidatesByNominations(_electionId, activeCandidates);
        
        NominationData storage data = nominationData[_electionId];
        uint256 topN = election.topN;
        uint256 minNominations = election.minimumNominations;
        uint256 qualifiedCount = 0;
        
        for (uint256 i = 0; i < sortedCandidates.length && qualifiedCount < topN; i++) {
            uint256 candidateId = sortedCandidates[i];
            
            if (data.nominationCount[candidateId] >= minNominations) {
                election.topCandidates.push(candidateId);
                qualifiedCount++;
            }
        }
        
        if (qualifiedCount == 0) {
            revert NominationVoting__InsufficientCandidates();
        }
        
        election.isFinalized = true;
        
        emit NominationsFinalized(_electionId, election.topCandidates, block.timestamp);
    }
    
   //////////////////////
   //  ADMIN FUNCTIONS //
   //////////////////////
    
    /**
     * @notice Update election parameters (only before finalization)
     */
    function updateElectionParameters(
        uint256 _electionId,
        uint96 _newNominationEnd,
        uint256 _newTopN
    ) external onlyRole(ADMIN_ROLE) {
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
    
   //////////////////////
   //  VIEW FUNCTIONS //
   ////////////////////
    
    /**
     * @notice Get nomination count for a candidate
     */
    function getNominationCount(uint256 _electionId, uint256 _candidateId) external view returns (uint256) {
        return nominationData[_electionId].nominationCount[_candidateId];
    }
    
    /**
     * @notice Check if address has voted in election
     */
    function hasVoted(uint256 _electionId, address _voter) external view returns (bool) {
        return nominationData[_electionId].hasVoted[_voter];
    }
    
    /**
     * @notice Get voter's nominations
     */
    function getVoterNominations(uint256 _electionId, address _voter) external view returns (uint256[] memory) {
        return nominationData[_electionId].voterNominations[_voter];
    }
    
    /**
     * @notice Get total voters in election
     */
    function getTotalVoters(uint256 _electionId) external view returns (uint256) {
        return nominationData[_electionId].totalVoters;
    }
    
    /**
     * @notice Get top N candidates after finalization
     */
    function getTopCandidates(uint256 _electionId) external view returns (uint256[] memory) {
        if (!elections[_electionId].isFinalized) {
            revert NominationVoting__NotFinalized();
        }
        
        return elections[_electionId].topCandidates;
    }
    
    /**
     * @notice Get election details
     */
    function getElection(uint256 _electionId) external view returns (
        uint96 nominationStart,
        uint96 nominationEnd,
        uint256 topN,
        uint256 minimumNominations,
        bool isFinalized,
        uint256 totalVoters
    ) {
        Election memory election = elections[_electionId];
        return (
            election.nominationStart,
            election.nominationEnd,
            election.topN,
            election.minimumNominations,
            election.isFinalized,
            nominationData[_electionId].totalVoters
        );
    }
    
    /**
     * @notice Get nomination leaderboard (sorted by count)
     * @dev Expensive operation - use for off-chain queries only
     */
    function getNominationLeaderboard(uint256 _electionId) external view returns (
        uint256[] memory candidateIds,
        uint256[] memory counts
    ) {
        uint256[] memory activeCandidates = candidacyNFT.getActiveCandidatesForElection(_electionId);
        uint256 length = activeCandidates.length;
        
        candidateIds = new uint256[](length);
        counts = new uint256[](length);
        
        NominationData storage data = nominationData[_electionId];
        
        for (uint256 i = 0; i < length;) {
            candidateIds[i] = activeCandidates[i];
            counts[i] = data.nominationCount[activeCandidates[i]];
            unchecked { ++i; }
        }
        
        (candidateIds, counts) = _sortLeaderboard(candidateIds, counts);
        
        return (candidateIds, counts);
    }
    
    /**
     * @notice Batch get nomination counts
     */
    function batchGetNominationCounts(
        uint256 _electionId,
        uint256[] calldata _candidateIds
    ) external view returns (uint256[] memory) {
        uint256 length = _candidateIds.length;
        uint256[] memory counts = new uint256[](length);
        
        NominationData storage data = nominationData[_electionId];
        
        for (uint256 i = 0; i < length;) {
            counts[i] = data.nominationCount[_candidateIds[i]];
            unchecked { ++i; }
        }
        
        return counts;
    }
    
    /////////////////////////
    // INTERNAL FUNCTIONS //
    ////////////////////////
    
    /**
     * @notice Check if candidate is in active list
     */
    function _isActiveCandidate(uint256 _candidateId, uint256[] memory _activeCandidates) internal pure returns (bool) {
        for (uint256 i = 0; i < _activeCandidates.length;) {
            if (_activeCandidates[i] == _candidateId) {
                return true;
            }
            unchecked { ++i; }
        }
        return false;
    }
    
    /**
     * @notice Sort candidates by nomination count (descending)
     */
    function _sortCandidatesByNominations(
        uint256 _electionId,
        uint256[] memory _candidates
    ) internal view returns (uint256[] memory) {
        uint256 length = _candidates.length;
        uint256[] memory sorted = new uint256[](length);
        
        for (uint256 i = 0; i < length;) {
            sorted[i] = _candidates[i];
            unchecked { ++i; }
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
    
    /**
     * @notice Sort leaderboard arrays in parallel
     */
    function _sortLeaderboard(
        uint256[] memory _ids,
        uint256[] memory _counts
    ) internal pure returns (uint256[] memory, uint256[] memory) {
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