// SPDX-License-Identifier: MIT
// File: test/unit/IdentityRegistry.t.sol
pragma solidity ^0.8.19;

import {Test, console2} from "forge-std/Test.sol";
import {IdentityRegistry} from "src/IdentityRegistry.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {MockPyth} from "../mocks/MockPyth.sol";

contract IdentityRegistryTest is Test {
    IdentityRegistry public identityRegistry;
    MockPyth public mockPyth;

    address public admin = makeAddr("admin");
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");

    uint256 constant MIN_PASSPORT_SCORE = 15;
    uint256 constant MIN_STAKE_USD = 5000; // $50 in cents
    uint256 constant MIN_STAKE_ETH = 0.001 ether;

    function setUp() public {
        vm.startPrank(admin);

        mockPyth = new MockPyth();

        identityRegistry = new IdentityRegistry(
            address(mockPyth),
            address(0), // Bypass passport decoder for testing
            MIN_PASSPORT_SCORE,
            MIN_STAKE_USD,
            MIN_STAKE_ETH
        );

        vm.stopPrank();
    }

    // ============================================
    // Registration Tests
    // ============================================

    function test_Register_Success() public {
        vm.deal(user1, 1 ether);

        vm.startPrank(user1);

        bytes memory proof = "";
        bytes[] memory pythUpdate = new bytes[](1);
        pythUpdate[0] = bytes("mock");

        identityRegistry.register{value: MIN_STAKE_ETH + 1 wei}(MIN_PASSPORT_SCORE, proof, pythUpdate);

        vm.stopPrank();

        IdentityRegistry.Identity memory identity = identityRegistry.getIdentity(user1);

        assertEq(identity.member, user1);
        assertEq(identity.passportScore, MIN_PASSPORT_SCORE);
        assertTrue(identityRegistry.isEligibleVoter(user1));
    }

    function test_RevertWhen_InsufficientPassportScore() public {
        vm.deal(user1, 1 ether);

        vm.startPrank(user1);

        bytes memory proof = "";
        bytes[] memory pythUpdate = new bytes[](1);
        pythUpdate[0] = bytes("mock");

        vm.expectRevert(IdentityRegistry.IdentityRegistry__InsufficientPassportScore.selector);
        identityRegistry.register{value: MIN_STAKE_ETH + 1 wei}(
            MIN_PASSPORT_SCORE - 1, // Below minimum
            proof,
            pythUpdate
        );

        vm.stopPrank();
    }

    function test_RevertWhen_InsufficientStake() public {
        vm.deal(user1, 1 ether);

        vm.startPrank(user1);

        bytes memory proof = "";
        bytes[] memory pythUpdate = new bytes[](1);
        pythUpdate[0] = bytes("mock");

        vm.expectRevert(IdentityRegistry.IdentityRegistry__InsufficientStake.selector);
        identityRegistry.register{value: MIN_STAKE_ETH / 2}( // Below minimum
        MIN_PASSPORT_SCORE, proof, pythUpdate);

        vm.stopPrank();
    }

    function test_RevertWhen_AlreadyRegistered() public {
        vm.deal(user1, 2 ether);

        vm.startPrank(user1);

        bytes memory proof = "";
        bytes[] memory pythUpdate = new bytes[](1);
        pythUpdate[0] = bytes("mock");

        // First registration
        identityRegistry.register{value: MIN_STAKE_ETH + 1 wei}(MIN_PASSPORT_SCORE, proof, pythUpdate);

        // Second registration should fail
        vm.expectRevert(IdentityRegistry.IdentityRegistry__AlreadyRegistered.selector);
        identityRegistry.register{value: MIN_STAKE_ETH + 1 wei}(MIN_PASSPORT_SCORE, proof, pythUpdate);

        vm.stopPrank();
    }

    // ============================================
    // Attestation Tests
    // ============================================

    function test_CreateAttestation_Success() public {
        // Register both users first
        _registerUser(user1);
        _registerUser(user2);

        vm.startPrank(user1);

        identityRegistry.createAttestation(user2, "Trustworthy community member");

        vm.stopPrank();

        assertEq(identityRegistry.getActiveAttestationCount(user2), 1);
        assertTrue(identityRegistry.hasAttested(user1, user2));
    }

    function test_RevertWhen_SelfAttestation() public {
        _registerUser(user1);

        vm.startPrank(user1);

        vm.expectRevert(IdentityRegistry.IdentityRegistry__SelfAttestation.selector);
        identityRegistry.createAttestation(user1, "Attesting myself");

        vm.stopPrank();
    }

    function test_RevertWhen_DuplicateAttestation() public {
        _registerUser(user1);
        _registerUser(user2);

        vm.startPrank(user1);

        identityRegistry.createAttestation(user2, "First attestation");

        vm.expectRevert(IdentityRegistry.IdentityRegistry__InvalidAttestor.selector);
        identityRegistry.createAttestation(user2, "Second attestation");

        vm.stopPrank();
    }

    function test_RevokeAttestation_Success() public {
        _registerUser(user1);
        _registerUser(user2);

        vm.startPrank(user1);

        identityRegistry.createAttestation(user2, "Initial attestation");
        assertEq(identityRegistry.getActiveAttestationCount(user2), 1);

        identityRegistry.revokeAttestation(user2);
        assertEq(identityRegistry.getActiveAttestationCount(user2), 0);

        vm.stopPrank();
    }

    // ============================================
    // Batch Query Tests
    // ============================================

    function test_GetBatchMemberProfiles_Success() public {
        _registerUser(user1);
        _registerUser(user2);

        address[] memory members = new address[](2);
        members[0] = user1;
        members[1] = user2;

        IdentityRegistry.MemberProfile[] memory profiles = identityRegistry.getBatchMemberProfiles(members);

        assertEq(profiles.length, 2);
        assertEq(profiles[0].member, user1);
        assertEq(profiles[1].member, user2);
        assertTrue(profiles[0].isEligibleVoter);
        assertTrue(profiles[1].isEligibleVoter);
    }

    function test_GetMembersPaginated_Success() public {
        // Register multiple users
        for (uint256 i = 0; i < 5; i++) {
            address user = makeAddr(string(abi.encodePacked("user", i)));
            _registerUser(user);
        }

        (address[] memory members, uint256 total) = identityRegistry.getMembersPaginated(0, 3);

        assertEq(members.length, 3);
        assertEq(total, 5);
    }

    // ============================================
    // Eligibility Tests
    // ============================================

    function test_IsEligibleCandidate_Success() public {
        _registerUser(user1);
        _registerUser(user2);

        // Create required attestations
        vm.startPrank(user2);
        identityRegistry.createAttestation(user1, "Attestation 1");
        vm.stopPrank();

        address user3 = makeAddr("user3");
        _registerUser(user3);

        vm.startPrank(user3);
        identityRegistry.createAttestation(user1, "Attestation 2");
        vm.stopPrank();

        // Fast forward time for tenure requirement
        vm.warp(block.timestamp + 30 days + 1);

        assertTrue(identityRegistry.isEligibleCandidate(user1));
    }

    function test_IsEligibleJuror_Success() public {
        _registerUser(user1);

        // Record participation
        vm.startPrank(admin);
        identityRegistry.recordActivity(user1);
        identityRegistry.recordActivity(user1);
        identityRegistry.recordActivity(user1);
        vm.stopPrank();

        // Fast forward time for tenure requirement
        vm.warp(block.timestamp + 180 days + 1);

        assertTrue(identityRegistry.isEligibleJuror(user1));
    }

    // ============================================
    // Helper Functions
    // ============================================

    function _registerUser(address user) internal {
        vm.deal(user, 1 ether);

        vm.startPrank(user);

        bytes memory proof = "";
        bytes[] memory pythUpdate = new bytes[](1);
        pythUpdate[0] = bytes("mock");

        identityRegistry.register{value: MIN_STAKE_ETH + 1 wei}(MIN_PASSPORT_SCORE, proof, pythUpdate);

        vm.stopPrank();
    }
}

// ============================================
// File: test/unit/CandidacyNFT.t.sol
// ============================================

// ============================================
// File: test/unit/VettingJury.t.sol
// ============================================

// ============================================
// File: test/unit/NominationVoting.t.sol
// ============================================

// ============================================
// File: test/unit/WeightedLottery.t.sol
// ============================================

// ============================================
// File: test/mocks/MockPyth.sol
// ============================================

// ============================================
// File: test/integration/FullElectionFlow.t.sol
// ============================================
