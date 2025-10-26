//SPDX-License-Identifier: MIT

pragma solidity ^0.8.19;

import {Test, console2} from "forge-std/Test.sol";
import {WeightedLottery} from "src/WeightedLottery.sol";
import {IdentityRegistry} from "src/IdentityRegistry.sol";
import {VettingJury} from "src/VettingJury.sol";
import {NominationVoting} from "src/NominationVoting.sol";
import {CandidacyNFT} from "src/CandidacyNft.sol";
import {VRFCoordinatorV2_5Mock} from "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {MockPyth} from "../mocks/MockPyth.sol";

contract WeightedLotteryTest is Test {
    WeightedLottery public weightedLottery;
    IdentityRegistry public identityRegistry;
    VettingJury public vettingJury;
    NominationVoting public nominationVoting;
    CandidacyNFT public candidacyNFT;
    VRFCoordinatorV2_5Mock public vrfCoordinator;
    MockPyth public mockPyth;

    address public admin = makeAddr("admin");
    address public voter1 = makeAddr("voter1");
    address public voter2 = makeAddr("voter2");
    address public voter3 = makeAddr("voter3");

    uint256 public vrfSubscriptionId;
    bytes32 public vrfKeyHash = keccak256("keyHash");

    function setUp() public {
        vm.startPrank(admin);

        mockPyth = new MockPyth();
        vrfCoordinator = new VRFCoordinatorV2_5Mock(0.25 ether, 1e9, 4e15);
        vrfSubscriptionId = vrfCoordinator.createSubscription();

        identityRegistry = new IdentityRegistry(address(mockPyth), address(0), 15, 5000, 0.001 ether);

        candidacyNFT = new CandidacyNFT(address(identityRegistry), 3 days, "DDSP Candidacy", "CAND");

        nominationVoting = new NominationVoting(address(identityRegistry), address(candidacyNFT));

        vettingJury = new VettingJury(
            address(vrfCoordinator),
            vrfSubscriptionId,
            vrfKeyHash,
            address(identityRegistry),
            address(nominationVoting),
            address(candidacyNFT)
        );

        weightedLottery = new WeightedLottery(
            address(vrfCoordinator),
            vrfSubscriptionId,
            vrfKeyHash,
            address(identityRegistry),
            address(vettingJury),
            address(candidacyNFT)
        );

        vrfCoordinator.fundSubscription(vrfSubscriptionId, 3 ether);
        vrfCoordinator.addConsumer(vrfSubscriptionId, address(weightedLottery));

        vm.stopPrank();

        _registerVoter(voter1);
        _registerVoter(voter2);
        _registerVoter(voter3);
    }

    // ============================================
    // Vote Distribution Tests
    // ============================================

    function test_GetVoteDistribution_Success() public {
        uint256 electionId = _createElection();

        // Cast votes with different weights
        vm.startPrank(voter1);
        uint256[] memory candidates1 = new uint256[](2);
        candidates1[0] = 1;
        candidates1[1] = 2;
        weightedLottery.vote(electionId, candidates1);
        vm.stopPrank();

        vm.startPrank(voter2);
        uint256[] memory candidates2 = new uint256[](1);
        candidates2[0] = 1;
        weightedLottery.vote(electionId, candidates2);
        vm.stopPrank();

        // Get distribution
        WeightedLottery.VoteDistribution[] memory distribution = weightedLottery.getVoteDistribution(electionId);

        assertEq(distribution.length, 3);

        // Candidate 1 should have 2 votes
        assertEq(distribution[0].voteWeight, 2);
        assertEq(distribution[0].probabilityBasisPoints, 6666);

        // Candidate 2 should have 1 vote
        assertEq(distribution[1].voteWeight, 1);
        assertEq(distribution[1].probabilityBasisPoints, 3333);

        // Candidate 3 should have 0 votes
        assertEq(distribution[2].voteWeight, 0);
        assertEq(distribution[2].probabilityBasisPoints, 0);
    }

    function test_GetCandidateProbability_Success() public {
        uint256 electionId = _createElection();

        // Cast votes
        vm.startPrank(voter1);
        uint256[] memory candidates = new uint256[](1);
        candidates[0] = 1;
        weightedLottery.vote(electionId, candidates);
        vm.stopPrank();

        vm.startPrank(voter2);
        candidates[0] = 2;
        weightedLottery.vote(electionId, candidates);
        vm.stopPrank();

        vm.startPrank(voter3);
        candidates[0] = 1;
        weightedLottery.vote(electionId, candidates);
        vm.stopPrank();

        // Check candidate 1 probability (2/3)
        (uint256 weight, uint256 probabilityBP, uint256 probabilityPct) =
            weightedLottery.getCandidateProbability(electionId, 1);

        assertEq(weight, 2);
        assertEq(probabilityBP, 6666);
        assertEq(probabilityPct, 66);
    }

    function test_GetVoteDistribution_ReturnsEnrichedData() public {
        uint256 electionId = _createElection();

        vm.startPrank(voter1);
        uint256[] memory candidates = new uint256[](1);
        candidates[0] = 1;
        weightedLottery.vote(electionId, candidates);
        vm.stopPrank();

        WeightedLottery.VoteDistribution[] memory distribution = weightedLottery.getVoteDistribution(electionId);

        assertEq(distribution[0].candidateId, 1);
        assertTrue(distribution[0].candidateAddress != address(0));
        assertTrue(bytes(distribution[0].platformSummary).length > 0);
    }

    // ============================================
    // Weighted Selection Tests
    // ============================================

    function test_Vote_UpdatesTotalWeight() public {
        uint256 electionId = _createElection();

        // Get initial election state
        (,,,,,, uint256 totalVotes1, uint256 totalWeight1) = weightedLottery.getElection(electionId);

        assertEq(totalVotes1, 0);
        assertEq(totalWeight1, 0);

        // Cast vote for 2 candidates
        vm.startPrank(voter1);
        uint256[] memory candidates = new uint256[](2);
        candidates[0] = 1;
        candidates[1] = 2;
        weightedLottery.vote(electionId, candidates);
        vm.stopPrank();

        // Check updated state
        (,,,,,, uint256 totalVotes2, uint256 totalWeight2) = weightedLottery.getElection(electionId);

        assertEq(totalVotes2, 1);
        assertEq(totalWeight2, 2);
    }

    function test_WeightedSelection_CorrectProbabilities() public {
        uint256 electionId = _createElection();

        // Create highly skewed vote distribution
        for (uint256 i = 0; i < 9; i++) {
            address voter = makeAddr(string(abi.encodePacked("voter", i)));
            _registerVoter(voter);

            vm.startPrank(voter);
            uint256[] memory candidates = new uint256[](1);
            candidates[0] = 1;
            weightedLottery.vote(electionId, candidates);
            vm.stopPrank();
        }

        vm.startPrank(voter1);
        uint256[] memory newCandidates = new uint256[](1);
        newCandidates[0] = 2;
        weightedLottery.vote(electionId, newCandidates);
        vm.stopPrank();

        // Check probabilities
        (, uint256 prob1,) = weightedLottery.getCandidateProbability(electionId, 1);
        (, uint256 prob2,) = weightedLottery.getCandidateProbability(electionId, 2);

        assertEq(prob1, 9000); // 90%
        assertEq(prob2, 1000); // 10%
    }

    // ============================================
    // Helper Functions
    // ============================================

    function _registerVoter(address voter) internal {
        vm.deal(voter, 1 ether);

        vm.startPrank(voter);
        bytes memory proof = "";
        bytes[] memory pythUpdate = new bytes[](1);
        pythUpdate[0] = bytes("mock");
        identityRegistry.register{value: 0.001 ether + 1 wei}(20, proof, pythUpdate);
        vm.stopPrank();
    }

    function _createElection() internal returns (uint256) {
        vm.startPrank(admin);

        uint256[] memory vettedCandidates = new uint256[](3);
        vettedCandidates[0] = 1;
        vettedCandidates[1] = 2;
        vettedCandidates[2] = 3;

        uint256 electionId =
            weightedLottery.createElection(1, uint96(block.timestamp), uint96(block.timestamp + 5 days), false);

        vm.stopPrank();

        return electionId;
    }
}
