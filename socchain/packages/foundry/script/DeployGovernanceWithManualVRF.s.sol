// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console2} from "forge-std/Script.sol";
import {HelperConfig} from "./HelperConfig.s.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {CandidacyNFT} from "../src/CandidacyNft.sol";
import {NominationVoting} from "../src/NominationVoting.sol";
import {VettingJury} from "../src/VettingJury.sol";
import {WeightedLottery} from "../src/WeightedLottery.sol";

/**
 * @title DeployGovernanceWithManualVRF
 * @notice Deploys UPDATED contracts with all 6 critical fixes
 * @dev ✅ Compatible with fixed contracts (batch queries, vote distribution, juror reports)
 */
contract DeployGovernanceWithManualVRF is Script {
    struct DeployedContracts {
        IdentityRegistry identityRegistry;
        CandidacyNFT candidacyNFT;
        NominationVoting nominationVoting;
        VettingJury vettingJury;
        WeightedLottery weightedLottery;
    }

    function run() external returns (DeployedContracts memory, HelperConfig) {
        HelperConfig helperConfig = new HelperConfig();
        HelperConfig.NetworkConfig memory config = helperConfig.getConfig();

        console2.log("\n=== DEPLOYING FIXED GOVERNANCE CONTRACTS ===");
        console2.log(" All 6 Critical Frontend Issues Fixed:");
        console2.log("   1. Vetting jury evidence getters");
        console2.log("   2. Juror report batch queries");
        console2.log("   3. Candidate platform metadata");
        console2.log("   4. Optimized nomination leaderboard");
        console2.log("   5. Vote distribution with probabilities");
        console2.log("   6. Batch member profile queries");
        console2.log("");
        console2.log("Network:", config.networkName);
        console2.log("Chain ID:", block.chainid);
        console2.log("Deployer:", config.vrf.account);
        console2.log("VRF Coordinator:", config.vrf.vrfCoordinatorV2_5);
        console2.log("VRF Subscription ID:", config.vrf.subscriptionId);
        console2.log("LINK Token:", config.vrf.link);
        console2.log("Pyth Oracle:", config.governance.pythContract);
        console2.log("Passport Decoder:", config.governance.passportDecoder);
        console2.log("Minimum Passport Score:", config.governance.minimumPassportScore);
        console2.log("Minimum Stake USD ($):", config.governance.minimumStakeUSD / 100);
        console2.log("Minimum Stake ETH:", config.governance.minimumStake / 1e18);
        console2.log("Cooldown Period:", config.governance.cooldownPeriod);
        console2.log("");

        DeployedContracts memory deployed = _deployContracts(config);

        _logDeployment(deployed, config);
        _showManualSteps(deployed);
        _showNewFeatures();

        return (deployed, helperConfig);
    }

    function _deployContracts(HelperConfig.NetworkConfig memory config) internal returns (DeployedContracts memory) {
        vm.startBroadcast(config.vrf.account);

        // 1. Deploy IdentityRegistry (FIXED: Added batch queries)
        console2.log("1/5 Deploying IdentityRegistry (FIXED)...");
        IdentityRegistry identityRegistry = new IdentityRegistry(
            config.governance.pythContract,
            config.governance.passportDecoder,
            config.governance.minimumPassportScore,
            config.governance.minimumStakeUSD,
            config.governance.minimumStake
        );
        console2.log("     Deployed at:", address(identityRegistry));
        console2.log("      New: getBatchMemberProfiles()");
        console2.log("      New: getMembersPaginated()");

        // 2. Deploy CandidacyNFT (FIXED: Added metadata fields)
        console2.log("\n2/5 Deploying CandidacyNFT (FIXED)...");
        CandidacyNFT candidacyNFT =
            new CandidacyNFT(address(identityRegistry), config.governance.cooldownPeriod, "DDSP Candidacy", "CAND");
        console2.log("     Deployed at:", address(candidacyNFT));
        console2.log("      New: platformSummary and tags fields");
        console2.log("      New: getCandidateProfile()");
        console2.log("     New: getBatchCandidateProfiles()");

        // 3. Deploy NominationVoting (FIXED: Cached leaderboard)
        console2.log("\n3/5 Deploying NominationVoting (FIXED)...");
        NominationVoting nominationVoting = new NominationVoting(address(identityRegistry), address(candidacyNFT));
        console2.log("     Deployed at:", address(nominationVoting));
        console2.log("      New: Cached leaderboard (5min TTL)");
        console2.log("      New: getTopNLeaderboard()");
        console2.log("      New: LeaderboardEntry struct");

        // 4. Deploy VettingJury (FIXED: Report getters)
        console2.log("\n4/5 Deploying VettingJury (FIXED)...");
        VettingJury vettingJury = new VettingJury(
            config.vrf.vrfCoordinatorV2_5,
            config.vrf.subscriptionId,
            config.vrf.gasLane,
            address(identityRegistry),
            address(nominationVoting),
            address(candidacyNFT)
        );
        console2.log("     Deployed at:", address(vettingJury));
        console2.log("      New: getJurorReport()");
        console2.log("      New: getAllJurorReports()");
        console2.log("      New: getVettingResults()");
        console2.log("      New: findingsSummary field");

        // 5. Deploy WeightedLottery (FIXED: Vote distribution)
        console2.log("\n5/5 Deploying WeightedLottery (FIXED)...");
        WeightedLottery weightedLottery = new WeightedLottery(
            config.vrf.vrfCoordinatorV2_5,
            config.vrf.subscriptionId,
            config.vrf.gasLane,
            address(identityRegistry),
            address(vettingJury),
            address(candidacyNFT)
        );
        console2.log("     Deployed at:", address(weightedLottery));
        console2.log("      New: getVoteDistribution()");
        console2.log("      New: getCandidateProbability()");
        console2.log("      New: totalWeight tracking");

        // Grant necessary roles
        console2.log("\nGranting roles...");
        candidacyNFT.grantVettingRole(address(vettingJury));
        console2.log("     Granted VETTING_ROLE to VettingJury");

        vm.stopBroadcast();

        return DeployedContracts({
            identityRegistry: identityRegistry,
            candidacyNFT: candidacyNFT,
            nominationVoting: nominationVoting,
            vettingJury: vettingJury,
            weightedLottery: weightedLottery
        });
    }

    function _logDeployment(DeployedContracts memory deployed, HelperConfig.NetworkConfig memory config)
        internal
        view
    {
        console2.log("\n=== DEPLOYMENT SUMMARY ===");
        console2.log(" Network:", config.networkName);
        console2.log(" Chain ID:", block.chainid);
        console2.log(" Deployer:", config.vrf.account);

        console2.log("\n CONTRACT ADDRESSES:");
        console2.log("   IdentityRegistry:   ", address(deployed.identityRegistry));
        console2.log("   CandidacyNFT:       ", address(deployed.candidacyNFT));
        console2.log("   NominationVoting:   ", address(deployed.nominationVoting));
        console2.log("   VettingJury:        ", address(deployed.vettingJury));
        console2.log("   WeightedLottery:    ", address(deployed.weightedLottery));

        console2.log("\n CONFIGURATION:");
        console2.log("   VRF Coordinator:    ", config.vrf.vrfCoordinatorV2_5);
        console2.log("   VRF Subscription:   ", config.vrf.subscriptionId);
        console2.log("   LINK Token:         ", config.vrf.link);
        console2.log("   Pyth Oracle:        ", config.governance.pythContract);
        console2.log("   Passport Decoder:   ", config.governance.passportDecoder);
    }

    function _showManualSteps(DeployedContracts memory deployed) internal pure {
        console2.log("\n=== NEXT STEPS ===");

        console2.log("\n STEP 1: Add VRF Consumers");
        console2.log("   Go to: vrf.chain.link");
        console2.log("   Add these consumers to your subscription:");
        console2.log("      1. VettingJury:     ", address(deployed.vettingJury));
        console2.log("      2. WeightedLottery: ", address(deployed.weightedLottery));

        console2.log("\n STEP 2: Set up Chainlink Automation (Optional)");
        console2.log("   Go to: automation.chain.link");
        console2.log("   Create upkeeps for:");
        console2.log("      - NominationVoting  (auto-finalization)");
        console2.log("      - VettingJury       (phase transitions)");
        console2.log("      - WeightedLottery   (auto-draw)");

        console2.log("\n STEP 3: Test New Features");
        console2.log("   Try the new batch query functions:");
        console2.log("      - identityRegistry.getBatchMemberProfiles()");
        console2.log("      - candidacyNFT.getBatchCandidateProfiles()");
        console2.log("      - nominationVoting.getTopNLeaderboard()");
        console2.log("      - vettingJury.getAllJurorReports()");
        console2.log("      - weightedLottery.getVoteDistribution()");
    }

    function _showNewFeatures() internal pure {
        console2.log("\n=== NEW FEATURES IN FIXED CONTRACTS ===");

        console2.log("\n 1. IDENTITY REGISTRY:");
        console2.log("      Returns: passport, stake, attestations, eligibility flags");
        console2.log("      Paginated member list for large datasets");

        console2.log("\n 2. CANDIDACY NFT:");
        console2.log("    - mintCandidacy() now accepts:");

        console2.log("\n 3. NOMINATION VOTING:");
        console2.log("    - Cached leaderboard (refreshes every 5 minutes)");
        console2.log("      Includes: candidateId, count, address, summary");
        console2.log("    - refreshLeaderboardCache() (admin only)");

        console2.log("\n 4. VETTING JURY:");
        console2.log("    - revealVote() now accepts findingsSummary");
        console2.log("    - getJurorReport(sessionId, candidateId, juror)");
        console2.log("    - getAllJurorReports(sessionId, candidateId)");

        console2.log("\n 5. WEIGHTED LOTTERY:");
        console2.log("    - Automatic totalWeight tracking");
        console2.log("    - getCandidateProbability(candidateId)");
        console2.log("      Returns: weight, basisPoints, percentage");

        console2.log("\n=== END OF DEPLOYMENT ===\n");
    }
}

/**
 * @title QuickDeployWithExistingSubscription
 * @notice Deploy if you ALREADY have a subscription configured
 */
contract QuickDeployWithExistingSubscription is Script {
    function run() external returns (DeployGovernanceWithManualVRF.DeployedContracts memory, HelperConfig) {
        console2.log("\n=== QUICK DEPLOY MODE ===");
        console2.log("   Assumes you have already:");
        console2.log("   1. Created VRF subscription");
        console2.log("   2. Funded it with LINK");
        console2.log("   3. Updated HelperConfig with correct subscriptionId\n");

        DeployGovernanceWithManualVRF deployer = new DeployGovernanceWithManualVRF();
        return deployer.run();
    }
}
