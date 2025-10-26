// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

import {IdentityRegistry} from "./IdentityRegistry.sol";
import {VettingJury} from "./VettingJury.sol";
import {CandidacyNFT} from "./CandidacyNft.sol";

/**
 * @title WeightedLottery
 * @author Emmanuel Nyamweya
 * @notice Phase 4: Weighted random selection from vetted candidates
 * @dev FIXED: Added vote distribution and probability calculations
 */
contract WeightedLottery is VRFConsumerBaseV2Plus, AccessControl, ReentrancyGuard, AutomationCompatibleInterface {
    /////////////////////
    //  CUSTOM ERRORS  //
    /////////////////////
    error WeightedLottery__NotEligible();
    error WeightedLottery__AlreadyVoted();
    error WeightedLottery__InvalidCandidate();
    error WeightedLottery__VotingNotActive();
    error WeightedLottery__VotingNotEnded();
    error WeightedLottery__AlreadyFinalized();
    error WeightedLottery__NoVotesCast();
    error WeightedLottery__ZeroAddress();
    error WeightedLottery__NoCandidates();
    error WeightedLottery__DrawAlreadyRequested();

    /////////////////////////
    // TYPE DECLARATIONS   //
    /////////////////////////
    struct Election {
        uint256 electionId;
        uint256 vettingSessionId;
        uint256[] candidateIds;
        uint96 votingStart;
        uint96 votingEnd;
        bool isFinalized;
        uint256 winner;
        uint256 winningRandomNumber;
        uint256 totalVotes;
        uint256 totalWeight;
        bool autoDrawEnabled;
        bool drawRequested;
    }

    // Vote distribution entry
    struct VoteDistribution {
        uint256 candidateId;
        address candidateAddress;
        string platformSummary;
        uint256 voteWeight;
        uint256 probabilityBasisPoints; // Out of 10000 (e.g., 2500 = 25%)
    }

    /////////////////////////
    //  STATE VARIABLES    //
    /////////////////////////
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant AUTOMATION_ROLE = keccak256("AUTOMATION_ROLE");

    IdentityRegistry public immutable i_identityRegistry;
    VettingJury public immutable i_vettingJury;
    CandidacyNFT public immutable i_candidacyNFT;

    uint256 public immutable i_vrfSubscriptionId;
    bytes32 public immutable i_vrfKeyHash;
    uint32 public constant VRF_CALLBACK_GAS_LIMIT = 300000;
    uint16 public constant VRF_REQUEST_CONFIRMATIONS = 3;
    uint32 public constant VRF_NUM_WORDS = 1;

    uint256 public s_electionCounter;

    mapping(uint256 => Election) private s_elections;
    mapping(uint256 => mapping(uint256 => uint256)) public s_voteWeights;
    mapping(uint256 => mapping(address => bool)) public s_hasVoted;
    mapping(uint256 => mapping(address => uint256[])) private s_voterChoices;
    mapping(uint256 => uint256) private s_pendingVRFRequests;

    uint256[] private s_activeElectionIds;
    mapping(uint256 => uint256) private s_electionIdToIndex;

    /////////////
    //  EVENTS  //
    /////////////
    event ElectionCreated(
        uint256 indexed electionId,
        uint256 indexed vettingSessionId,
        uint256[] candidateIds,
        uint96 votingStart,
        uint96 votingEnd,
        bool autoDrawEnabled
    );
    event VoteCast(uint256 indexed electionId, address indexed voter, uint256[] candidateIds, uint256 timestamp);
    event WinnerDrawRequested(uint256 indexed electionId, uint256 requestId);
    event WinnerSelected(
        uint256 indexed electionId,
        uint256 indexed winnerId,
        address indexed winner,
        uint256 randomNumber,
        uint256 timestamp
    );
    event AutoDrawTriggered(uint256 indexed electionId, uint256 timestamp);

    //////////////////
    // CONSTRUCTOR  //
    //////////////////
    constructor(
        address _vrfCoordinator,
        uint256 _vrfSubscriptionId,
        bytes32 _vrfKeyHash,
        address _identityRegistry,
        address _vettingJury,
        address _candidacyNFT
    ) VRFConsumerBaseV2Plus(_vrfCoordinator) {
        if (_identityRegistry == address(0) || _vettingJury == address(0) || _candidacyNFT == address(0)) {
            revert WeightedLottery__ZeroAddress();
        }

        i_vrfSubscriptionId = _vrfSubscriptionId;
        i_vrfKeyHash = _vrfKeyHash;
        i_identityRegistry = IdentityRegistry(_identityRegistry);
        i_vettingJury = VettingJury(_vettingJury);
        i_candidacyNFT = CandidacyNFT(_candidacyNFT);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(AUTOMATION_ROLE, msg.sender);
    }

    /////////////////////////
    // EXTERNAL FUNCTIONS  //
    /////////////////////////
    function createElection(uint256 _vettingSessionId, uint96 _votingStart, uint96 _votingEnd, bool _autoDrawEnabled)
        external
        onlyRole(ADMIN_ROLE)
        returns (uint256)
    {
        if (_votingEnd <= _votingStart) revert WeightedLottery__VotingNotActive();

        uint256[] memory vettedCandidates = i_vettingJury.getVettedCandidates(_vettingSessionId);
        if (vettedCandidates.length == 0) revert WeightedLottery__NoCandidates();

        uint256 electionId = ++s_electionCounter;

        s_elections[electionId] = Election({
            electionId: electionId,
            vettingSessionId: _vettingSessionId,
            candidateIds: vettedCandidates,
            votingStart: _votingStart,
            votingEnd: _votingEnd,
            isFinalized: false,
            winner: 0,
            winningRandomNumber: 0,
            totalVotes: 0,
            totalWeight: 0,
            autoDrawEnabled: _autoDrawEnabled,
            drawRequested: false
        });

        if (_autoDrawEnabled) {
            s_activeElectionIds.push(electionId);
            s_electionIdToIndex[electionId] = s_activeElectionIds.length - 1;
        }

        emit ElectionCreated(
            electionId, _vettingSessionId, vettedCandidates, _votingStart, _votingEnd, _autoDrawEnabled
        );
        return electionId;
    }

    function vote(uint256 _electionId, uint256[] calldata _candidateIds) external nonReentrant {
        if (!i_identityRegistry.isEligibleVoter(msg.sender)) revert WeightedLottery__NotEligible();

        Election storage election = s_elections[_electionId];
        if (block.timestamp < election.votingStart || block.timestamp >= election.votingEnd) {
            revert WeightedLottery__VotingNotActive();
        }

        if (s_hasVoted[_electionId][msg.sender]) revert WeightedLottery__AlreadyVoted();
        if (_candidateIds.length == 0 || _candidateIds.length > election.candidateIds.length) {
            revert WeightedLottery__InvalidCandidate();
        }

        for (uint256 i = 0; i < _candidateIds.length;) {
            if (!_isVettedCandidate(_electionId, _candidateIds[i])) revert WeightedLottery__InvalidCandidate();
            s_voteWeights[_electionId][_candidateIds[i]]++;
            election.totalWeight++;
            unchecked {
                ++i;
            }
        }

        s_hasVoted[_electionId][msg.sender] = true;
        s_voterChoices[_electionId][msg.sender] = _candidateIds;
        election.totalVotes++;
        i_identityRegistry.recordActivity(msg.sender);

        emit VoteCast(_electionId, msg.sender, _candidateIds, block.timestamp);
    }

    function requestWinnerDraw(uint256 _electionId) public onlyRole(ADMIN_ROLE) returns (uint256) {
        Election storage election = s_elections[_electionId];

        if (block.timestamp < election.votingEnd) revert WeightedLottery__VotingNotEnded();
        if (election.isFinalized) revert WeightedLottery__AlreadyFinalized();
        if (election.totalVotes == 0) revert WeightedLottery__NoVotesCast();
        if (election.drawRequested) revert WeightedLottery__DrawAlreadyRequested();

        election.drawRequested = true;

        uint256 requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: i_vrfKeyHash,
                subId: i_vrfSubscriptionId,
                requestConfirmations: VRF_REQUEST_CONFIRMATIONS,
                callbackGasLimit: VRF_CALLBACK_GAS_LIMIT,
                numWords: VRF_NUM_WORDS,
                extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: false}))
            })
        );

        s_pendingVRFRequests[requestId] = _electionId;
        emit WinnerDrawRequested(_electionId, requestId);
        return requestId;
    }

    //////////////////////////
    // CHAINLINK AUTOMATION //
    //////////////////////////
    function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory performData) {
        uint256[] memory readyIds = new uint256[](s_activeElectionIds.length);
        uint256 count;

        for (uint256 i = 0; i < s_activeElectionIds.length;) {
            uint256 electionId = s_activeElectionIds[i];
            Election memory election = s_elections[electionId];
            if (
                election.autoDrawEnabled && !election.isFinalized && !election.drawRequested
                    && election.votingEnd <= block.timestamp && election.totalVotes > 0
            ) {
                readyIds[count++] = electionId;
            }
            unchecked {
                ++i;
            }
        }

        if (count > 0) {
            bytes memory encoded = abi.encode(readyIds, count);
            return (true, encoded);
        }
        return (false, bytes(""));
    }

    function performUpkeep(bytes calldata performData) external override onlyRole(AUTOMATION_ROLE) {
        (uint256[] memory readyIds, uint256 count) = abi.decode(performData, (uint256[], uint256));
        for (uint256 i = 0; i < count;) {
            uint256 electionId = readyIds[i];
            Election storage election = s_elections[electionId];
            if (
                election.autoDrawEnabled && !election.isFinalized && !election.drawRequested
                    && election.votingEnd <= block.timestamp && election.totalVotes > 0
            ) {
                requestWinnerDraw(electionId);
                emit AutoDrawTriggered(electionId, block.timestamp);
                _removeFromActiveElections(electionId);
            }
            unchecked {
                ++i;
            }
        }
    }

    //////////////////////
    //  VIEW FUNCTIONS //
    //////////////////////

    function getElection(uint256 _electionId)
        external
        view
        returns (
            uint256 vettingSessionId,
            uint256[] memory candidateIds,
            uint96 votingStart,
            uint96 votingEnd,
            bool isFinalized,
            uint256 winner,
            uint256 totalVotes,
            uint256 totalWeight
        )
    {
        Election memory election = s_elections[_electionId];
        return (
            election.vettingSessionId,
            election.candidateIds,
            election.votingStart,
            election.votingEnd,
            election.isFinalized,
            election.winner,
            election.totalVotes,
            election.totalWeight
        );
    }

    // Getting vote distribution with probabilities
    function getVoteDistribution(uint256 _electionId) external view returns (VoteDistribution[] memory) {
        Election storage election = s_elections[_electionId];
        uint256 length = election.candidateIds.length;
        uint256 totalWeight = election.totalWeight;

        VoteDistribution[] memory distribution = new VoteDistribution[](length);

        for (uint256 i = 0; i < length;) {
            uint256 candidateId = election.candidateIds[i];
            uint256 weight = s_voteWeights[_electionId][candidateId];

            CandidacyNFT.Candidacy memory candidacy = i_candidacyNFT.getCandidacyInfo(candidateId);

            // Calculate probability in basis points (out of 10000)
            uint256 probability = totalWeight > 0 ? (weight * 10000 / totalWeight) : 0;

            distribution[i] = VoteDistribution({
                candidateId: candidateId,
                candidateAddress: candidacy.candidate,
                platformSummary: candidacy.platformSummary,
                voteWeight: weight,
                probabilityBasisPoints: probability
            });

            unchecked {
                ++i;
            }
        }

        return distribution;
    }

    // Get single candidate probability
    function getCandidateProbability(uint256 _electionId, uint256 _candidateId)
        external
        view
        returns (uint256 weight, uint256 probabilityBasisPoints, uint256 probabilityPercentage)
    {
        Election storage election = s_elections[_electionId];

        weight = s_voteWeights[_electionId][_candidateId];
        uint256 totalWeight = election.totalWeight;

        if (totalWeight == 0) {
            return (0, 0, 0);
        }

        probabilityBasisPoints = (weight * 10000) / totalWeight;
        probabilityPercentage = (weight * 100) / totalWeight;

        return (weight, probabilityBasisPoints, probabilityPercentage);
    }

    function getVoterChoices(uint256 _electionId, address _voter) external view returns (uint256[] memory) {
        return s_voterChoices[_electionId][_voter];
    }

    ////////////////////////
    // INTERNAL FUNCTIONS //
    ////////////////////////
    function fulfillRandomWords(uint256 _requestId, uint256[] calldata _randomWords) internal override {
        uint256 electionId = s_pendingVRFRequests[_requestId];
        Election storage election = s_elections[electionId];
        if (election.isFinalized) return;

        uint256 randomNumber = _randomWords[0];
        uint256 winnerId = _selectWinnerFromWeights(electionId, randomNumber);

        election.winner = winnerId;
        election.winningRandomNumber = randomNumber;
        election.isFinalized = true;

        CandidacyNFT.Candidacy memory winnerCandidacy = i_candidacyNFT.getCandidacyInfo(winnerId);
        emit WinnerSelected(electionId, winnerId, winnerCandidacy.candidate, randomNumber, block.timestamp);
    }

    function _selectWinnerFromWeights(uint256 _electionId, uint256 _randomNumber) internal view returns (uint256) {
        Election memory election = s_elections[_electionId];
        uint256[] memory candidates = election.candidateIds;
        uint256 totalWeight = election.totalWeight;

        uint256 selection = _randomNumber % totalWeight;
        uint256 cumulative;

        for (uint256 i = 0; i < candidates.length;) {
            cumulative += s_voteWeights[_electionId][candidates[i]];
            if (selection < cumulative) return candidates[i];
            unchecked {
                ++i;
            }
        }
        return candidates[candidates.length - 1];
    }

    function _isVettedCandidate(uint256 _electionId, uint256 _candidateId) internal view returns (bool) {
        uint256[] memory candidates = s_elections[_electionId].candidateIds;
        for (uint256 i = 0; i < candidates.length;) {
            if (candidates[i] == _candidateId) return true;
            unchecked {
                ++i;
            }
        }
        return false;
    }

    function _removeFromActiveElections(uint256 _electionId) internal {
        uint256 index = s_electionIdToIndex[_electionId];
        uint256 lastId = s_activeElectionIds[s_activeElectionIds.length - 1];
        s_activeElectionIds[index] = lastId;
        s_electionIdToIndex[lastId] = index;
        s_activeElectionIds.pop();
        delete s_electionIdToIndex[_electionId];
    }
}
