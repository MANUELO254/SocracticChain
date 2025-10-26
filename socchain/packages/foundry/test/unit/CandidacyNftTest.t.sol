//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test, console2} from "forge-std/Test.sol";
import {CandidacyNFT} from "src/CandidacyNft.sol";
import {IdentityRegistry} from "src/IdentityRegistry.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {MockPyth} from "../mocks/MockPyth.sol";

contract CandidacyNFTTest is Test {
    CandidacyNFT public candidacyNFT;
    IdentityRegistry public identityRegistry;
    MockPyth public mockPyth;

    address public admin = makeAddr("admin");
    address public candidate1 = makeAddr("candidate1");
    address public candidate2 = makeAddr("candidate2");

    uint256 constant ELECTION_ID = 1;
    uint256 constant COOLDOWN_PERIOD = 3 days;

    function setUp() public {
        vm.startPrank(admin);

        mockPyth = new MockPyth();

        identityRegistry = new IdentityRegistry(address(mockPyth), address(0), 15, 5000, 0.001 ether);

        candidacyNFT = new CandidacyNFT(address(identityRegistry), COOLDOWN_PERIOD, "DDSP Candidacy", "CAND");

        vm.stopPrank();

        // Register and setup candidates
        _setupCandidate(candidate1);
        _setupCandidate(candidate2);
    }

    // ============================================
    // Minting Tests
    // ============================================

    function test_MintCandidacy_WithMetadata_Success() public {
        vm.startPrank(candidate1);

        string memory manifestoIPFS = "QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
        string memory summary = "Focus on economic reform and sustainability";
        string[] memory tags = new string[](3);
        tags[0] = "Economy";
        tags[1] = "Environment";
        tags[2] = "Technology";

        uint256 tokenId = candidacyNFT.mintCandidacy(ELECTION_ID, manifestoIPFS, summary, tags);

        vm.stopPrank();

        // Verify minting
        assertEq(candidacyNFT.ownerOf(tokenId), candidate1);
        assertEq(candidacyNFT.activeCandidacyId(candidate1), tokenId);

        // Verify metadata
        CandidacyNFT.Candidacy memory candidacy = candidacyNFT.getCandidacyInfo(tokenId);
        assertEq(candidacy.candidate, candidate1);
        assertEq(candidacy.electionId, ELECTION_ID);
        assertEq(candidacy.platformIPFS, manifestoIPFS);
        assertEq(candidacy.platformSummary, summary);
        assertEq(candidacy.tags.length, 3);
        assertEq(candidacy.tags[0], "Economy");
        assertTrue(candidacy.isActive);
    }

    function test_GetCandidateProfile_Success() public {
        // Mint candidacy first
        vm.startPrank(candidate1);

        string[] memory tags = new string[](2);
        tags[0] = "Economy";
        tags[1] = "Security";

        uint256 tokenId = candidacyNFT.mintCandidacy(ELECTION_ID, "QmTest", "Test summary", tags);

        vm.stopPrank();

        // Get enriched profile
        CandidacyNFT.CandidateProfile memory profile = candidacyNFT.getCandidateProfile(tokenId);

        assertEq(profile.tokenId, tokenId);
        assertEq(profile.candidate, candidate1);
        assertEq(profile.electionId, ELECTION_ID);
        assertEq(profile.platformSummary, "Test summary");
        assertTrue(profile.isActive);
        assertEq(profile.attestationCount, 2); // From setup
    }

    function test_GetBatchCandidateProfiles_Success() public {
        // Mint multiple candidacies
        vm.startPrank(candidate1);
        string[] memory tags1 = new string[](1);
        tags1[0] = "Economy";
        uint256 tokenId1 = candidacyNFT.mintCandidacy(ELECTION_ID, "QmTest1", "Summary 1", tags1);
        vm.stopPrank();

        vm.startPrank(candidate2);
        string[] memory tags2 = new string[](1);
        tags2[0] = "Security";
        uint256 tokenId2 = candidacyNFT.mintCandidacy(ELECTION_ID, "QmTest2", "Summary 2", tags2);
        vm.stopPrank();

        // Batch fetch
        uint256[] memory tokenIds = new uint256[](2);
        tokenIds[0] = tokenId1;
        tokenIds[1] = tokenId2;

        CandidacyNFT.CandidateProfile[] memory profiles = candidacyNFT.getBatchCandidateProfiles(tokenIds);

        assertEq(profiles.length, 2);
        assertEq(profiles[0].candidate, candidate1);
        assertEq(profiles[1].candidate, candidate2);
    }

    function test_RevertWhen_SummaryTooLong() public {
        vm.startPrank(candidate1);

        // Create a summary > 500 characters
        bytes memory longBytes = new bytes(501);
        for (uint256 i = 0; i < 501; i++) {
            longBytes[i] = "a";
        }
        string memory longSummary = string(longBytes);

        string[] memory tags = new string[](1);
        tags[0] = "Test";

        vm.expectRevert(CandidacyNFT.CandidacyNFT__InvalidTags.selector);
        candidacyNFT.mintCandidacy(ELECTION_ID, "QmTest", longSummary, tags);

        vm.stopPrank();
    }

    function test_RevertWhen_TooManyTags() public {
        vm.startPrank(candidate1);

        string[] memory tags = new string[](11); // Max is 10
        for (uint256 i = 0; i < 11; i++) {
            tags[i] = "Tag";
        }

        vm.expectRevert(CandidacyNFT.CandidacyNFT__InvalidTags.selector);
        candidacyNFT.mintCandidacy(ELECTION_ID, "QmTest", "Summary", tags);

        vm.stopPrank();
    }

    function test_MintCandidacy_HandlesBothIPFSFormats() public {
        vm.startPrank(candidate1);

        string[] memory tags = new string[](1);
        tags[0] = "Test";

        // Test with bare CID
        uint256 tokenId1 =
            candidacyNFT.mintCandidacy(ELECTION_ID, "QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", "Summary", tags);

        // Fast forward past cooldown
        vm.warp(block.timestamp + COOLDOWN_PERIOD + 1);

        // Test with ipfs:// prefix
        uint256 tokenId2 = candidacyNFT.mintCandidacy(
            ELECTION_ID + 1, "ipfs://QmYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY", "Summary 2", tags
        );

        vm.stopPrank();

        // Both should store bare CID
        assertEq(candidacyNFT.getIPFSCID(tokenId1), "QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
        assertEq(candidacyNFT.getIPFSCID(tokenId2), "QmYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY");
    }

    // ============================================
    // Helper Functions
    // ============================================

    function _setupCandidate(address candidate) internal {
        vm.deal(candidate, 1 ether);

        vm.startPrank(candidate);
        bytes memory proof = "";
        bytes[] memory pythUpdate = new bytes[](1);
        pythUpdate[0] = bytes("mock");
        identityRegistry.register{value: 0.001 ether + 1 wei}(20, proof, pythUpdate);
        vm.stopPrank();

        // Create attestations
        address attestor1 = makeAddr(string(abi.encodePacked("attestor1", candidate)));
        address attestor2 = makeAddr(string(abi.encodePacked("attestor2", candidate)));

        vm.deal(attestor1, 1 ether);
        vm.deal(attestor2, 1 ether);

        vm.startPrank(attestor1);
        identityRegistry.register{value: 0.001 ether + 1 wei}(20, proof, pythUpdate);
        identityRegistry.createAttestation(candidate, "Attestation 1");
        vm.stopPrank();

        vm.startPrank(attestor2);
        identityRegistry.register{value: 0.001 ether + 1 wei}(20, proof, pythUpdate);
        identityRegistry.createAttestation(candidate, "Attestation 2");
        vm.stopPrank();

        // Fast forward for tenure
        vm.warp(block.timestamp + 30 days + 1);
    }
}
