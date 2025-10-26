// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {LinkToken} from "../test/mocks/LinkToken.sol";
import {Script, console2} from "forge-std/Script.sol";
import {VRFCoordinatorV2_5Mock} from "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";
import {DevOpsTools} from "foundry-devops/src/DevOpsTools.sol";

import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {CandidacyNFT} from "../src/CandidacyNft.sol";
import {NominationVoting} from "../src/NominationVoting.sol";
import {VettingJury} from "../src/VettingJury.sol";
import {WeightedLottery} from "../src/WeightedLottery.sol";

import {HelperConfig, CodeConstants} from "./HelperConfig.s.sol";

/**
 * @title CreateSubscription
 * @notice Creates a VRF subscription for Chainlink services
 */
contract CreateSubscription is Script {
    function createSubscriptionUsingConfig() public returns (uint256, address) {
        HelperConfig helperConfig = new HelperConfig();
        HelperConfig.NetworkConfig memory config = helperConfig.getConfigByChainId(block.chainid);
        return createSubscription(config.vrf.vrfCoordinatorV2_5, config.vrf.account);
    }

    function createSubscription(address vrfCoordinatorV2_5, address account) public returns (uint256, address) {
        console2.log("Creating subscription on chainId:", block.chainid);
        vm.startBroadcast(account);
        uint256 subId = VRFCoordinatorV2_5Mock(vrfCoordinatorV2_5).createSubscription();
        vm.stopBroadcast();
        console2.log("Your subscription Id is:", subId);
        console2.log("Please update the subscriptionId in HelperConfig.s.sol if needed");
        return (subId, vrfCoordinatorV2_5);
    }

    function run() external returns (uint256, address) {
        return createSubscriptionUsingConfig();
    }
}

/**
 * @title FundSubscription
 * @notice Funds a VRF subscription with LINK tokens
 */
contract FundSubscription is CodeConstants, Script {
    uint96 public constant FUND_AMOUNT = 3 ether;

    function fundSubscriptionUsingConfig() public {
        HelperConfig helperConfig = new HelperConfig();
        HelperConfig.NetworkConfig memory config = helperConfig.getConfig();
        uint256 subId = config.vrf.subscriptionId;
        address vrfCoordinatorV2_5 = config.vrf.vrfCoordinatorV2_5;
        address link = config.vrf.link;
        address account = config.vrf.account;

        if (subId == 0) {
            CreateSubscription createSub = new CreateSubscription();
            (uint256 updatedSubId, address updatedVRFv2) = createSub.run();
            subId = updatedSubId;
            vrfCoordinatorV2_5 = updatedVRFv2;
            console2.log("New SubId Created!", subId);
            console2.log("VRF Address:", vrfCoordinatorV2_5);
            // Update config
            config.vrf.subscriptionId = subId;
            helperConfig.setConfig(block.chainid, config);
        }

        fundSubscription(vrfCoordinatorV2_5, subId, link, account);
    }

    function fundSubscription(address vrfCoordinatorV2_5, uint256 subId, address link, address account) public {
        console2.log("Funding subscription:", subId);
        console2.log("Using vrfCoordinator:", vrfCoordinatorV2_5);
        console2.log("On ChainID:", block.chainid);

        if (block.chainid == LOCAL_CHAIN_ID) {
            vm.startBroadcast(account);
            VRFCoordinatorV2_5Mock(vrfCoordinatorV2_5).fundSubscription(subId, FUND_AMOUNT);
            vm.stopBroadcast();
        } else {
            console2.log("LINK balance of account:", LinkToken(link).balanceOf(account));
            vm.startBroadcast(account);
            LinkToken(link).transferAndCall(vrfCoordinatorV2_5, FUND_AMOUNT, abi.encode(subId));
            vm.stopBroadcast();
        }
        console2.log("Funded subscription with LINK:", FUND_AMOUNT);
    }

    function run() external {
        fundSubscriptionUsingConfig();
    }
}

/**
 * @title AddConsumer
 * @notice Adds a single consumer contract to VRF subscription
 */
contract AddConsumer is Script {
    function addConsumer(address contractToAddToVrf, address vrfCoordinator, uint256 subId, address account) public {
        console2.log("Adding consumer contract:", contractToAddToVrf);
        console2.log("Using vrfCoordinator:", vrfCoordinator);
        console2.log("On ChainID:", block.chainid);
        vm.startBroadcast(account);
        VRFCoordinatorV2_5Mock(vrfCoordinator).addConsumer(subId, contractToAddToVrf);
        vm.stopBroadcast();
        console2.log("Added consumer to subscription");
    }

    function addConsumerUsingConfig(address mostRecentlyDeployed) public {
        HelperConfig helperConfig = new HelperConfig();
        HelperConfig.NetworkConfig memory config = helperConfig.getConfig();
        uint256 subId = config.vrf.subscriptionId;
        address vrfCoordinatorV2_5 = config.vrf.vrfCoordinatorV2_5;
        address account = config.vrf.account;
        addConsumer(mostRecentlyDeployed, vrfCoordinatorV2_5, subId, account);
    }

    function run() external {
        address vettingJury = DevOpsTools.get_most_recent_deployment("VettingJury", block.chainid);
        addConsumerUsingConfig(vettingJury);
    }
}

/**
 * @title AddMultipleConsumers
 * @notice Adds multiple consumer contracts (VettingJury and WeightedLottery) to VRF subscription
 */
contract AddMultipleConsumers is Script {
    function addConsumers(
        address vettingJury,
        address weightedLottery,
        address vrfCoordinator,
        uint256 subId,
        address account
    ) public {
        console2.log("Adding VettingJury consumer:", vettingJury);
        console2.log("Adding WeightedLottery consumer:", weightedLottery);
        console2.log("Using vrfCoordinator:", vrfCoordinator);
        console2.log("On ChainID:", block.chainid);

        vm.startBroadcast(account);
        VRFCoordinatorV2_5Mock(vrfCoordinator).addConsumer(subId, vettingJury);
        VRFCoordinatorV2_5Mock(vrfCoordinator).addConsumer(subId, weightedLottery);
        vm.stopBroadcast();

        console2.log("Successfully added both consumers to subscription");
    }

    function addConsumersUsingConfig(address vettingJury, address weightedLottery) public {
        HelperConfig helperConfig = new HelperConfig();
        HelperConfig.NetworkConfig memory config = helperConfig.getConfig();
        uint256 subId = config.vrf.subscriptionId;
        address vrfCoordinatorV2_5 = config.vrf.vrfCoordinatorV2_5;
        address account = config.vrf.account;
        addConsumers(vettingJury, weightedLottery, vrfCoordinatorV2_5, subId, account);
    }

    function run() external {
        address vettingJury = DevOpsTools.get_most_recent_deployment("VettingJury", block.chainid);
        address weightedLottery = DevOpsTools.get_most_recent_deployment("WeightedLottery", block.chainid);
        addConsumersUsingConfig(vettingJury, weightedLottery);
    }
}

/**
 * @title WhitelistTestUsers
 * @notice Whitelist test users in IdentityRegistry for local testing
 */
contract WhitelistTestUsers is Script {
    function whitelistUsers(address identityRegistry, address[] memory users, address account) public {
        console2.log("Whitelisting users in IdentityRegistry:", users.length);

        vm.startBroadcast(account);
        for (uint256 i = 0; i < users.length; i++) {
            IdentityRegistry(identityRegistry).setWhitelist(users[i], true);
            console2.log("Whitelisted:", users[i]);
        }
        vm.stopBroadcast();

        console2.log("Successfully whitelisted all test users");
    }

    function whitelistUsersUsingConfig(address identityRegistry, address[] memory users) public {
        HelperConfig helperConfig = new HelperConfig();
        HelperConfig.NetworkConfig memory config = helperConfig.getConfig();
        address account = config.vrf.account;
        whitelistUsers(identityRegistry, users, account);
    }

    function run() external {
        HelperConfig helperConfig = new HelperConfig();
        HelperConfig.NetworkConfig memory config = helperConfig.getConfig();
        address identityRegistry = DevOpsTools.get_most_recent_deployment("IdentityRegistry", block.chainid);

        address[] memory testUsers = new address[](5);
        testUsers[0] = config.vrf.account;
        testUsers[1] = address(0x1);
        testUsers[2] = address(0x2);
        testUsers[3] = address(0x3);
        testUsers[4] = address(0x4);

        whitelistUsersUsingConfig(identityRegistry, testUsers);
    }
}

/**
 * @title SetupAutomation
 * @notice Grant AUTOMATION_ROLE to Chainlink Automation forwarder addresses
 */
contract SetupAutomation is Script, CodeConstants {
    error SetupAutomation__InvalidNetwork();
    error SetupAutomation__InvalidForwarder(address forwarder);

    struct AutomationConfig {
        address registrar;
        address registry;
        uint256 checkGasLimit;
        uint256 performGasLimit;
        uint256 minUpkeepSpend; // In LINK wei (0.1 LINK = 1e17)
    }

    function getAutomationConfig(uint256 chainId) internal pure returns (AutomationConfig memory) {
        if (chainId == CodeConstants.OP_SEPOLIA_CHAIN_ID) {
            return AutomationConfig({
                registrar: 0x9e329384F4155a5c284FF91CeD9f2AEF589C81c9,
                registry: 0x8E82eE417f916Bd44E8Efa144222808E5Fa84611,
                checkGasLimit: 10_000_000,
                performGasLimit: 5_000_000,
                minUpkeepSpend: 100_000_000_000_000_000 // 0.1 LINK
            });
        } else if (chainId == CodeConstants.ETH_SEPOLIA_CHAIN_ID) {
            // Ethereum Sepolia example (update as needed)
            return AutomationConfig({
                registrar: 0xb0E49c5D0d05cbc241d68c05BC5BA1d1B7B72976,
                registry: 0x02777053d6764996e594c3E88AF1D58D5363a2e6,
                checkGasLimit: 10_000_000,
                performGasLimit: 5_000_000,
                minUpkeepSpend: 100_000_000_000_000_000
            });
        }
        revert SetupAutomation__InvalidNetwork();
    }

    /**
     * @notice Grant AUTOMATION_ROLE to forwarder(s) for specific contracts.
     * @param forwarders Array of forwarder addresses (one per Upkeep; order: NominationVoting, VettingJury, WeightedLottery).
     * @param contracts Array of contract addresses to grant to (aligns with forwarders).
     */
    function grantRolesToForwarders(address[] memory forwarders, address[] memory contracts, address account) public {
        if (forwarders.length != contracts.length || forwarders.length > 3) {
            revert SetupAutomation__InvalidForwarder(address(0)); // Mismatch error
        }

        bytes32 AUTOMATION_ROLE = keccak256("AUTOMATION_ROLE");

        vm.startBroadcast(account);

        for (uint256 i = 0; i < forwarders.length; i++) {
            if (forwarders[i] == address(0)) {
                revert SetupAutomation__InvalidForwarder(forwarders[i]);
            }

            address contractAddr = contracts[i];
            address forwarder = forwarders[i];

            if (contractAddr == DevOpsTools.get_most_recent_deployment("NominationVoting", block.chainid)) {
                NominationVoting(contractAddr).grantRole(AUTOMATION_ROLE, forwarder);
                console2.log("Granted AUTOMATION_ROLE to NominationVoting via forwarder:", forwarder);
            } else if (contractAddr == DevOpsTools.get_most_recent_deployment("VettingJury", block.chainid)) {
                VettingJury(contractAddr).grantRole(AUTOMATION_ROLE, forwarder);
                console2.log("Granted AUTOMATION_ROLE to VettingJury via forwarder:", forwarder);
            } else if (contractAddr == DevOpsTools.get_most_recent_deployment("WeightedLottery", block.chainid)) {
                WeightedLottery(contractAddr).grantRole(AUTOMATION_ROLE, forwarder);
                console2.log("Granted AUTOMATION_ROLE to WeightedLottery via forwarder:", forwarder);
            }
        }

        vm.stopBroadcast();
        console2.log(" All roles granted. Automation ready!");
    }

    function run() external view {
        uint256 chainId = block.chainid;
        AutomationConfig memory autoConfig = getAutomationConfig(chainId);

        console2.log("\n=== Chainlink Automation Setup for Chain ID:", chainId, "===");
        console2.log("Registrar:", autoConfig.registrar);
        console2.log("Registry:", autoConfig.registry);
        console2.log("Perform Gas Limit:", autoConfig.performGasLimit);
        console2.log("Min Upkeep Spend:", autoConfig.minUpkeepSpend / 1e18, "LINK");
        console2.log("\n UI Setup (automation.chain.link):");
        console2.log("   Trigger: Time-based | checkData: 0x");
        console2.log("   Gas Limit:", autoConfig.performGasLimit);
        console2.log("   Fund ", autoConfig.minUpkeepSpend / 1e18, "LINK per Upkeep");
        console2.log("\n Steps:");
        console2.log("  1. Register 3 Upkeeps (one per contract).");
        console2.log("  2. From UI, copy each Upkeep's Forwarder Address.");
        console2.log(
            "  3. Run: forge script ... --sig 'grantRolesToForwarders(address[],address[])' FORWARDERS CONTRACTS"
        );
        console2.log(
            "\nExample: grantRolesToForwarders([0xABC...,0xDEF...,0xGHI...], [nomAddr,vetAddr,lotAddr], account)\n"
        );
    }
}
