//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test, console2} from "forge-std/Test.sol";
import {VettingJury} from "src/VettingJury.sol";
import {IdentityRegistry} from "src/IdentityRegistry.sol";
import {NominationVoting} from "src/NominationVoting.sol";
import {CandidacyNFT} from "src/CandidacyNft.sol";
import {VRFCoordinatorV2_5Mock} from "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {MockPyth} from "../mocks/MockPyth.sol";

contract VettingJuryTest is Test {
    VettingJury public vettingJury;
    IdentityRegistry public identityRegistry;
    NominationVoting public nominationVoting;
    CandidacyNFT public candidacyNFT;
    VRFCoordinatorV2_5Mock public vrfCoordinator;
    MockPyth public mockPyth;

    address public admin = makeAddr("admin");
    address public juror1 = makeAddr("juror1");
    address public juror2 = makeAddr("juror2");
    address public juror3 = makeAddr("juror3");

    uint256 public vrfSubscriptionId;
    bytes32 public vrfKeyHash = keccak256("keyHash");

    uint256 constant SESSION_ID = 1;
    uint256 constant ELECTION_ID = 1;

    function setUp() public {
        vm.startPrank(admin);

        // Deploy mocks
        mockPyth = new MockPyth();
        vrfCoordinator = new VRFCoordinatorV2_5Mock(0.25 ether, 1e9, 4e15);
        vrfSubscriptionId = vrfCoordinator.createSubscription();

        // Deploy contracts
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

        // Fund VRF subscription
        vrfCoordinator.fundSubscription(vrfSubscriptionId, 3 ether);
        vrfCoordinator.addConsumer(vrfSubscriptionId, address(vettingJury));

        candidacyNFT.grantVettingRole(address(vettingJury));

        vm.stopPrank();

        // Setup jurors
        _setupJuror(juror1);
        _setupJuror(juror2);
        _setupJuror(juror3);
    }

    // ============================================
    // Commit/Reveal Tests
    // ============================================

    function test_CommitAndReveal_WithFindings_Success() public {
        uint256 sessionId = _createAndSelectJury();
        uint256 candidateId = 1; // Mock candidate

        // COMMIT PHASE
        vm.startPrank(juror1);

        bool approve = true;
        string memory secret = "mySecret123";
        bytes32 commitHash = keccak256(abi.encodePacked(approve, secret, juror1));

        vettingJury.commitVote(sessionId, candidateId, commitHash);

        assertTrue(vettingJury.hasCommitted(sessionId, candidateId, juror1));
        assertFalse(vettingJury.hasRevealed(sessionId, candidateId, juror1));

        vm.stopPrank();

        // Move to reveal phase
        vm.warp(block.timestamp + 1 days + 1);

        // REVEAL PHASE
        vm.startPrank(juror1);

        string memory evidenceIPFS = "QmEvidenceXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
        string memory findings = "Candidate meets all requirements. Verified credentials and community standing.";

        vettingJury.revealVote(sessionId, candidateId, approve, evidenceIPFS, findings, secret);

        assertTrue(vettingJury.hasRevealed(sessionId, candidateId, juror1));

        vm.stopPrank();

        // Verify reveal data
        VettingJury.VoteReveal memory reveal = vettingJury.getJurorReport(sessionId, candidateId, juror1);
        assertEq(reveal.approve, true);
        assertEq(reveal.evidenceIPFS, evidenceIPFS);
        assertEq(reveal.findingsSummary, findings);
        assertTrue(reveal.revealedAt > 0);
    }

    function test_GetJurorReport_Success() public {
        uint256 sessionId = _createAndSelectJury();
        uint256 candidateId = 1;

        // Commit and reveal
        _commitAndRevealVote(juror1, sessionId, candidateId, true, "Evidence1", "Findings1");

        // Get juror report
        VettingJury.VoteReveal memory report = vettingJury.getJurorReport(sessionId, candidateId, juror1);

        assertEq(report.approve, true);
        assertEq(report.evidenceIPFS, "Evidence1");
        assertEq(report.findingsSummary, "Findings1");
    }

    function test_GetAllJurorReports_Success() public {
        uint256 sessionId = _createAndSelectJury();
        uint256 candidateId = 1;

        // Multiple jurors commit and reveal
        _commitAndRevealVote(juror1, sessionId, candidateId, true, "Evidence1", "Approve");
        _commitAndRevealVote(juror2, sessionId, candidateId, false, "Evidence2", "Reject");
        _commitAndRevealVote(juror3, sessionId, candidateId, true, "Evidence3", "Approve");

        // Get all reports
        VettingJury.JurorReport[] memory reports = vettingJury.getAllJurorReports(sessionId, candidateId);

        assertEq(reports.length, 3);
        assertEq(reports[0].juror, juror1);
        assertEq(reports[1].juror, juror2);
        assertEq(reports[2].juror, juror3);
        assertEq(reports[0].approve, true);
        assertEq(reports[1].approve, false);
        assertEq(reports[2].approve, true);
        assertTrue(reports[0].hasRevealed);
    }

    function test_GetVettingResults_Success() public {
        uint256 sessionId = _createAndSelectJury();
        uint256 candidateId = 1;

        // 2 approvals, 1 rejection
        _commitAndRevealVote(juror1, sessionId, candidateId, true, "E1", "A");
        _commitAndRevealVote(juror2, sessionId, candidateId, false, "E2", "R");
        _commitAndRevealVote(juror3, sessionId, candidateId, true, "E3", "A");

        (uint256 approvals, uint256 rejections, uint256 totalReveals, uint256 approvalPercentage) =
            vettingJury.getVettingResults(sessionId, candidateId);

        assertEq(approvals, 2);
        assertEq(rejections, 1);
        assertEq(totalReveals, 3);
        assertEq(approvalPercentage, 66); // 2/3 = 66%
    }

    function test_GetDetailedVettingResults_Success() public {
        uint256 sessionId = _createAndSelectJury();
        uint256 candidateId = 1;

        // Simulate votes: 2 approvals, 1 rejection
        _commitAndRevealVote(juror1, sessionId, candidateId, true, "QmApprove1", "Strong verification");
        _commitAndRevealVote(juror2, sessionId, candidateId, true, "QmApprove2", "Clean history");
        _commitAndRevealVote(juror3, sessionId, candidateId, false, "QmReject1", "Minor discrepancies");

        VettingJury.DetailedVettingResults memory info = vettingJury.getDetailedVettingResults(sessionId, candidateId);

        assertEq(info.candidateId, candidateId);
        assertEq(info.approvals, 2);
        assertEq(info.rejections, 1);
        assertEq(info.totalReveals, 3);
        assertEq(info.approvalPercentage, 66);
        assertTrue(info.approvalPercentage >= 60);

        assertEq(info.evidenceIPFSLinks.length, 3);
        assertEq(info.findingsSummaries.length, 3);
        assertEq(info.jurorAddresses.length, 3);
        assertEq(info.jurorApprovals.length, 3);

        assertEq(
            keccak256(abi.encodePacked(info.findingsSummaries[0])), keccak256(abi.encodePacked("Strong verification"))
        );
        assertFalse(info.jurorApprovals[2]); // Last is rejection
    }

    function test_RevertWhen_WrongSecret() public {
        uint256 sessionId = _createAndSelectJury();
        uint256 candidateId = 1;

        vm.startPrank(juror1);

        string memory secret = "correctSecret";
        bytes32 commitHash = keccak256(abi.encodePacked(true, secret, juror1));

        vettingJury.commitVote(sessionId, candidateId, commitHash);

        vm.warp(block.timestamp + 1 days + 1);

        // Try to reveal with wrong secret
        vm.expectRevert(VettingJury.VettingJury__InvalidReveal.selector);
        vettingJury.revealVote(sessionId, candidateId, true, "Evidence", "Findings", "wrongSecret");

        vm.stopPrank();
    }

    // ============================================
    // Helper Functions
    // ============================================

    function _setupJuror(address juror) internal {
        vm.deal(juror, 1 ether);

        vm.startPrank(juror);
        bytes memory proof = "";
        bytes[] memory pythUpdate = new bytes[](1);
        pythUpdate[0] = bytes("mock");
        identityRegistry.register{value: 0.001 ether + 1 wei}(20, proof, pythUpdate);
        vm.stopPrank();

        // Record participation
        vm.startPrank(admin);
        identityRegistry.recordActivity(juror);
        identityRegistry.recordActivity(juror);
        identityRegistry.recordActivity(juror);
        vm.stopPrank();

        // Fast forward for tenure
        vm.warp(block.timestamp + 180 days + 1);
    }

    function _createAndSelectJury() internal returns (uint256) {
        vm.startPrank(admin);

        uint256[] memory mockCandidates = new uint256[](1);
        mockCandidates[0] = 1;

        uint256 sessionId = vettingJury.createVettingSession(
            ELECTION_ID,
            3, // 3 jurors
            1 days, // commit duration
            1 days, // reveal duration
            0.01 ether,
            false // no auto-transition for testing
        );

        uint256 requestId = vettingJury.requestJurySelection(sessionId);

        // Fulfill VRF request
        vrfCoordinator.fulfillRandomWords(requestId, address(vettingJury));

        vm.stopPrank();

        return sessionId;
    }

    function _commitAndRevealVote(
        address juror,
        uint256 sessionId,
        uint256 candidateId,
        bool approve,
        string memory evidence,
        string memory findings
    ) internal {
        vm.startPrank(juror);

        string memory secret = string(abi.encodePacked("secret_", juror));
        bytes32 commitHash = keccak256(abi.encodePacked(approve, secret, juror));

        vettingJury.commitVote(sessionId, candidateId, commitHash);

        vm.stopPrank();

        // Move to reveal phase
        vm.warp(block.timestamp + 1 days + 1);

        vm.startPrank(juror);

        vettingJury.revealVote(sessionId, candidateId, approve, evidence, findings, secret);

        vm.stopPrank();
    }
}
