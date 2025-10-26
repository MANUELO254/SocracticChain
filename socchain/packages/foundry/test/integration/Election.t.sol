//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test, console2} from "forge-std/Test.sol";
import {IdentityRegistry} from "src/IdentityRegistry.sol";
import {CandidacyNFT} from "src/CandidacyNft.sol";
import {NominationVoting} from "src/NominationVoting.sol";
import {VettingJury} from "src/VettingJury.sol";
import {WeightedLottery} from "src/WeightedLottery.sol";
import {VRFCoordinatorV2_5Mock} from "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {MockPyth} from "../mocks/MockPyth.sol";

contract FullElectionFlowTest is Test {
    IdentityRegistry public identityRegistry;
    CandidacyNFT public candidacyNFT;
    NominationVoting public nominationVoting;
    VettingJury public vettingJury;
    WeightedLottery public weightedLottery;
    VRFCoordinatorV2_5Mock public vrfCoordinator;
    MockPyth public mockPyth;

    address public admin = makeAddr("admin");

    function setUp() public {
        vm.startPrank(admin);

        mockPyth = new MockPyth();
        vrfCoordinator = new VRFCoordinatorV2_5Mock(0.25 ether, 1e9, 4e15);
        uint256 vrfSubId = vrfCoordinator.createSubscription();
        bytes32 vrfKeyHash = keccak256("key");

        identityRegistry = new IdentityRegistry(address(mockPyth), address(0), 15, 5000, 0.001 ether);

        candidacyNFT = new CandidacyNFT(address(identityRegistry), 3 days, "DDSP Candidacy", "CAND");

        nominationVoting = new NominationVoting(address(identityRegistry), address(candidacyNFT));

        vettingJury = new VettingJury(
            address(vrfCoordinator),
            vrfSubId,
            vrfKeyHash,
            address(identityRegistry),
            address(nominationVoting),
            address(candidacyNFT)
        );

        weightedLottery = new WeightedLottery(
            address(vrfCoordinator),
            vrfSubId,
            vrfKeyHash,
            address(identityRegistry),
            address(vettingJury),
            address(candidacyNFT)
        );

        vrfCoordinator.fundSubscription(vrfSubId, 10 ether);
        vrfCoordinator.addConsumer(vrfSubId, address(vettingJury));
        vrfCoordinator.addConsumer(vrfSubId, address(weightedLottery));

        candidacyNFT.grantVettingRole(address(vettingJury));

        vm.stopPrank();
    }

    function test_FullElectionFlow() public {
        console2.log("=== FULL ELECTION FLOW TEST ===");

        // Phase 0: Registration
        console2.log("\n[Phase 0: Member Registration]");
        address[] memory voters = new address[](5);
        for (uint256 i = 0; i < 5; i++) {
            voters[i] = makeAddr(string(abi.encodePacked("voter", i)));
            _registerMember(voters[i]);
            console2.log("Registered:", voters[i]);
        }

        // Phase 1: Candidacy Declaration
        console2.log("\n[Phase 1: Candidacy Declaration]");
        _setupCandidate(voters[0]);
        _setupCandidate(voters[1]);
        _setupCandidate(voters[2]);

        uint256 tokenId1 = _declareCandidate(voters[0], 1);
        uint256 tokenId2 = _declareCandidate(voters[1], 1);
        uint256 tokenId3 = _declareCandidate(voters[2], 1);

        console2.log("Candidate 1 minted NFT:", tokenId1);
        console2.log("Candidate 2 minted NFT:", tokenId2);
        console2.log("Candidate 3 minted NFT:", tokenId3);

        // Phase 2: Nomination Voting
        console2.log("\n[Phase 2: Nomination Voting]");
        uint256 electionId = _createNominationElection();

        vm.startPrank(voters[3]);
        uint256[] memory noms1 = new uint256[](2);
        noms1[0] = tokenId1;
        noms1[1] = tokenId2;
        nominationVoting.nominate(electionId, noms1);
        vm.stopPrank();
        console2.log("Voter 3 nominated candidates 1 & 2");

        vm.startPrank(voters[4]);
        uint256[] memory noms2 = new uint256[](1);
        noms2[0] = tokenId1;
        nominationVoting.nominate(electionId, noms2);
        vm.stopPrank();
        console2.log("Voter 4 nominated candidate 1");

        // Check leaderboard
        (uint256[] memory topIds, uint256[] memory counts) = nominationVoting.getNominationLeaderboard(electionId);
        console2.log("Leaderboard candidate 1 votes:", counts[0]);
        console2.log("Leaderboard candidate 2 votes:", counts[1]);

        console2.log("\n=== TEST PASSED ===");
    }

    function _registerMember(address member) internal {
        vm.deal(member, 1 ether);
        vm.startPrank(member);
        bytes memory proof = "";
        bytes[] memory pythUpdate = new bytes[](1);
        pythUpdate[0] = bytes("mock");
        identityRegistry.register{value: 0.001 ether + 1 wei}(20, proof, pythUpdate);
        vm.stopPrank();
    }

    function _setupCandidate(address candidate) internal {
        address attestor1 = makeAddr(string(abi.encodePacked("attestor1", candidate)));
        address attestor2 = makeAddr(string(abi.encodePacked("attestor2", candidate)));

        _registerMember(attestor1);
        _registerMember(attestor2);

        vm.prank(attestor1);
        identityRegistry.createAttestation(candidate, "Attestation 1");

        vm.prank(attestor2);
        identityRegistry.createAttestation(candidate, "Attestation 2");

        vm.warp(block.timestamp + 30 days + 1);
    }

    function _declareCandidate(address candidate, uint256 electionId) internal returns (uint256) {
        vm.startPrank(candidate);

        string[] memory tags = new string[](2);
        tags[0] = "Economy";
        tags[1] = "Security";

        uint256 tokenId =
            candidacyNFT.mintCandidacy(electionId, "QmTestManifesto", "Platform summary for testing", tags);

        vm.stopPrank();

        return tokenId;
    }

    function _createNominationElection() internal returns (uint256) {
        vm.startPrank(admin);

        uint256 electionId =
            nominationVoting.createElection(uint96(block.timestamp), uint96(block.timestamp + 7 days), 10, 1, false);

        vm.stopPrank();

        return electionId;
    }
}
