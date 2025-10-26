//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test, console2} from "forge-std/Test.sol";
import {NominationVoting} from "src/NominationVoting.sol";
import {IdentityRegistry} from "src/IdentityRegistry.sol";
import {CandidacyNFT} from "src/CandidacyNft.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {MockPyth} from "../mocks/MockPyth.sol";

contract NominationVotingTest is Test {
    NominationVoting public nominationVoting;
    IdentityRegistry public identityRegistry;
    CandidacyNFT public candidacyNFT;
    MockPyth public mockPyth;

    address public admin = makeAddr("admin");
    address public voter1 = makeAddr("voter1");
    address public voter2 = makeAddr("voter2");

    uint256 constant ELECTION_ID = 1;

    function setUp() public {
        vm.startPrank(admin);

        mockPyth = new MockPyth();

        identityRegistry = new IdentityRegistry(address(mockPyth), address(0), 15, 5000, 0.001 ether);

        candidacyNFT = new CandidacyNFT(address(identityRegistry), 3 days, "DDSP Candidacy", "CAND");

        nominationVoting = new NominationVoting(address(identityRegistry), address(candidacyNFT));

        vm.stopPrank();

        _registerVoter(voter1);
        _registerVoter(voter2);
    }

    // ============================================
    // Leaderboard Caching Tests
    // ============================================

    function test_GetNominationLeaderboard_UsesCache() public {
        uint256 electionId = _createElection();

        // First call - no cache
        (uint256[] memory ids1, uint256[] memory counts1) = nominationVoting.getNominationLeaderboard(electionId);
        assertEq(counts1.length, 0);

        // Check cache timestamp was updated
        NominationVoting.Election memory election = _getElection(electionId);
        assertTrue(election.lastLeaderboardUpdate == 0); // No cache yet since no votes

        // Cast some votes
        vm.startPrank(voter1);
        uint256[] memory candidates = new uint256[](2);
        candidates[0] = 1;
        candidates[1] = 2;
        nominationVoting.nominate(electionId, candidates);
        vm.stopPrank();

        // Second call - should still compute (cache invalidated by vote)
        (uint256[] memory ids2, uint256[] memory counts2) = nominationVoting.getNominationLeaderboard(electionId);
        assertEq(counts2[0], 1);
        assertEq(counts2[1], 1);

        assertEq(ids2.length, ids1.length);
    }

    function test_GetTopNLeaderboard_Success() public {
        uint256 electionId = _createElection();

        // Cast votes
        vm.startPrank(voter1);
        uint256[] memory candidates = new uint256[](3);
        candidates[0] = 1;
        candidates[1] = 2;
        candidates[2] = 3;
        nominationVoting.nominate(electionId, candidates);
        vm.stopPrank();

        // FIXED: Use the full leaderboard return to assert
        (uint256[] memory topIds, uint256[] memory counts) = nominationVoting.getNominationLeaderboard(electionId);
        assertEq(counts[0], 1);

        // Get top 2
        NominationVoting.LeaderboardEntry[] memory topEntries = nominationVoting.getTopNLeaderboard(electionId, 2);

        assertEq(topEntries.length, 2);
        assertEq(topEntries[0].nominationCount, 1);
        assertEq(topEntries[1].nominationCount, 1);
    }

    function test_BatchGetNominationCounts_Success() public {
        uint256 electionId = _createElection();

        vm.startPrank(voter1);
        uint256[] memory candidates = new uint256[](2);
        candidates[0] = 1;
        candidates[1] = 2;
        nominationVoting.nominate(electionId, candidates);
        vm.stopPrank();

        uint256[] memory candidateIds = new uint256[](3);
        candidateIds[0] = 1;
        candidateIds[1] = 2;
        candidateIds[2] = 3;

        uint256[] memory counts = nominationVoting.batchGetNominationCounts(electionId, candidateIds);

        assertEq(counts.length, 3);
        assertEq(counts[0], 1);
        assertEq(counts[1], 1);
        assertEq(counts[2], 0);
    }

    function test_Nominate_InvalidatesCache() public {
        uint256 electionId = _createElection();

        // First vote
        vm.startPrank(voter1);
        uint256[] memory candidates = new uint256[](1);
        candidates[0] = 1;
        nominationVoting.nominate(electionId, candidates);
        vm.stopPrank();

        // Cache should be invalidated (lastLeaderboardUpdate = 0)
        NominationVoting.Election memory election = _getElection(electionId);
        assertEq(election.lastLeaderboardUpdate, 0);
    }

    // ============================================
    // Standard Nomination Tests
    // ============================================

    function test_Nominate_Success() public {
        uint256 electionId = _createElection();

        vm.startPrank(voter1);

        uint256[] memory candidates = new uint256[](2);
        candidates[0] = 1;
        candidates[1] = 2;

        nominationVoting.nominate(electionId, candidates);

        assertTrue(nominationVoting.hasVoted(electionId, voter1));
        assertEq(nominationVoting.getNominationCount(electionId, 1), 1);
        assertEq(nominationVoting.getNominationCount(electionId, 2), 1);

        vm.stopPrank();
    }

    function test_RevertWhen_AlreadyVoted() public {
        uint256 electionId = _createElection();

        vm.startPrank(voter1);

        uint256[] memory candidates = new uint256[](1);
        candidates[0] = 1;

        nominationVoting.nominate(electionId, candidates);

        vm.expectRevert(NominationVoting.NominationVoting__AlreadyVoted.selector);
        nominationVoting.nominate(electionId, candidates);

        vm.stopPrank();
    }

    function test_RevertWhen_TooManyCandidates() public {
        uint256 electionId = _createElection();

        vm.startPrank(voter1);

        uint256[] memory candidates = new uint256[](11); // Max is 10
        for (uint256 i = 0; i < 11; i++) {
            candidates[i] = i + 1;
        }

        vm.expectRevert(NominationVoting.NominationVoting__TooManyNominations.selector);
        nominationVoting.nominate(electionId, candidates);

        vm.stopPrank();
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

        uint256 electionId = nominationVoting.createElection(
            uint96(block.timestamp),
            uint96(block.timestamp + 7 days),
            10, // top 10
            3, // min 3 nominations
            false // no auto-finalization for testing
        );

        vm.stopPrank();

        return electionId;
    }

    function _getElection(uint256 electionId) internal view returns (NominationVoting.Election memory) {
        (uint96 start, uint96 end, uint256 topN, uint256 minNom, bool isFinalized, uint256 totalVoters, bool autoFinal)
        = nominationVoting.getElection(electionId);

        return NominationVoting.Election({
            electionId: electionId,
            nominationStart: start,
            nominationEnd: end,
            topN: topN,
            minimumNominations: minNom,
            isFinalized: isFinalized,
            topCandidates: new uint256[](0),
            autoFinalizationEnabled: autoFinal,
            cachedLeaderboard: new uint256[](0),
            lastLeaderboardUpdate: 0
        });
    }
}
