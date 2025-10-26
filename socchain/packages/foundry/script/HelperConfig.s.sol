// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {LinkToken} from "../test/mocks/LinkToken.sol";
import {Script, console2} from "forge-std/Script.sol";
import {VRFCoordinatorV2_5Mock} from "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";

abstract contract CodeConstants {
    uint96 public constant MOCK_BASE_FEE = 0.25 ether;
    uint96 public constant MOCK_GAS_PRICE_LINK = 1e9;
    int256 public constant MOCK_WEI_PER_UNIT_LINK = 4e15;

    address public constant FOUNDRY_DEFAULT_SENDER = 0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38;

    uint256 public constant ETH_SEPOLIA_CHAIN_ID = 11155111;
    uint256 public constant ETH_MAINNET_CHAIN_ID = 1;
    uint256 public constant OP_SEPOLIA_CHAIN_ID = 11155420;
    uint256 public constant LOCAL_CHAIN_ID = 31337;

    // Gitcoin Passport Decoder Addresses (Official)
    // Note: Gitcoin primarily supports Optimism, Arbitrum, Linea for on-chain Passport
    // For Ethereum Sepolia/Mainnet, you may need to use Gitcoin API off-chain verification
    // Or deploy to a supported chain like Optimism Sepolia
    address public constant GITCOIN_DECODER_OPTIMISM_SEPOLIA = 0xe53C60F8069C2f0c3a84F9B3DB5cf56f3100ba56;

    // For Ethereum Sepolia: Gitcoin doesn't have native decoder
    // Options:
    // 1. Use address(0) for bypass mode (testing)
    // 2. Deploy your own oracle
    // 3. Use off-chain API verification
    address public constant GITCOIN_DECODER_ETH_SEPOLIA = address(0); // Not available
    address public constant GITCOIN_DECODER_ETH_MAINNET = address(0); // Not available
}

contract ProjectDefaults {
    // Governance defaults
    uint256 public constant DEFAULT_MIN_PASSPORT_SCORE = 15;
    uint256 public constant DEFAULT_MIN_STAKE = 0.05 ether;
    uint256 public constant DEFAULT_COOLDOWN_PERIOD = 3 days;
    uint256 public constant DEFAULT_CANDIDATE_TENURE = 90 days;
    uint256 public constant DEFAULT_JUROR_TENURE = 180 days;
    uint256 public constant DEFAULT_JUROR_PARTICIPATION = 5;
    uint256 public constant DEFAULT_REQUIRED_ATTESTATIONS = 3;

    // Voting defaults
    uint256 public constant DEFAULT_NOMINATION_DURATION = 7 days;
    uint256 public constant DEFAULT_VETTING_COMMIT_DURATION = 3 days;
    uint256 public constant DEFAULT_VETTING_REVEAL_DURATION = 2 days;
    uint256 public constant DEFAULT_LOTTERY_VOTING_DURATION = 5 days;
    uint256 public constant DEFAULT_TOP_N_CANDIDATES = 10;
    uint256 public constant DEFAULT_MINIMUM_NOMINATIONS = 10;
    uint256 public constant DEFAULT_JURY_SIZE = 11;
    uint256 public constant DEFAULT_JUROR_STAKE_AMOUNT = 0.01 ether;
}

contract HelperConfig is CodeConstants, ProjectDefaults, Script {
    error HelperConfig__InvalidChainId();

    // Split structs to reduce locals/stack depth
    struct VRFConfig {
        uint256 subscriptionId;
        bytes32 gasLane;
        uint32 callbackGasLimit;
        address vrfCoordinatorV2_5;
        address link;
        address account;
    }

    struct GovernanceConfig {
        address pythContract; // New: Pyth oracle address
        address passportDecoder;
        uint256 minimumPassportScore;
        uint256 minimumStakeUSD; // New: Minimum stake in USD cents (e.g., 5000 = $50)
        uint256 minimumStake;
        uint256 cooldownPeriod;
        uint256 candidateTenure;
        uint256 jurorTenure;
        uint256 jurorParticipation;
        uint256 requiredAttestations;
    }

    struct VotingConfig {
        uint256 nominationDuration;
        uint256 vettingCommitDuration;
        uint256 vettingRevealDuration;
        uint256 lotteryVotingDuration;
        uint256 topNCandidates;
        uint256 minimumNominations;
        uint256 jurySize;
        uint256 jurorStakeAmount;
    }

    struct NetworkConfig {
        string networkName;
        VRFConfig vrf;
        GovernanceConfig governance;
        VotingConfig voting;
    }

    NetworkConfig public localNetworkConfig;
    mapping(uint256 chainId => NetworkConfig) public networkConfigs;

    constructor() {
        networkConfigs[ETH_SEPOLIA_CHAIN_ID] = getSepoliaEthConfig();
        networkConfigs[ETH_MAINNET_CHAIN_ID] = getMainnetEthConfig();
        networkConfigs[OP_SEPOLIA_CHAIN_ID] = getOptimismSepoliaConfig();
    }

    function getConfig() public returns (NetworkConfig memory) {
        return getConfigByChainId(block.chainid);
    }

    function setConfig(uint256 chainId, NetworkConfig memory networkConfig) public {
        networkConfigs[chainId] = networkConfig;
    }

    function getConfigByChainId(uint256 chainId) public returns (NetworkConfig memory) {
        if (networkConfigs[chainId].vrf.vrfCoordinatorV2_5 != address(0)) {
            return networkConfigs[chainId];
        } else if (chainId == LOCAL_CHAIN_ID) {
            return getOrCreateAnvilEthConfig();
        } else {
            revert HelperConfig__InvalidChainId();
        }
    }

    function getMainnetEthConfig() public pure returns (NetworkConfig memory) {
        return NetworkConfig({
            networkName: "Ethereum Mainnet",
            vrf: VRFConfig({
                subscriptionId: 0,
                gasLane: 0x9fe0eebf5e446e3c998ec9bb19951541aee00bb90ea201ae456421a2ded86805,
                callbackGasLimit: 500000,
                vrfCoordinatorV2_5: 0x271682DEB8C4E0901D1a1550aD2e64D568E69909,
                link: 0x514910771AF9Ca656af840dff83E8264EcF986CA,
                account: 0x643315C9Be056cDEA171F4e7b2222a4ddaB9F88D
            }),
            governance: GovernanceConfig({
                // ⚠️ IMPORTANT: Gitcoin Passport doesn't have native decoder on Ethereum Mainnet
                // Options:
                // 1. Use bypass mode: address(0) - for testing only
                // 2. Deploy to Optimism/Arbitrum instead (recommended)
                // 3. Implement custom oracle using Gitcoin API off-chain
                pythContract: 0xff1a0f4744e8582DF1aE09D5611b887B6a12925C, // Pyth oracle on ETH Mainnet
                passportDecoder: GITCOIN_DECODER_ETH_MAINNET, // address(0) - bypass mode
                minimumPassportScore: 20,
                minimumStakeUSD: 10000, // $100 in cents
                minimumStake: 0.01 ether,
                cooldownPeriod: 300, // 5 minutes for demo
                candidateTenure: 90 days,
                jurorTenure: 180 days,
                jurorParticipation: 5,
                requiredAttestations: 3
            }),
            voting: VotingConfig({
                nominationDuration: 7 days,
                vettingCommitDuration: 3 days,
                vettingRevealDuration: 2 days,
                lotteryVotingDuration: 5 days,
                topNCandidates: 10,
                minimumNominations: 10,
                jurySize: 11,
                jurorStakeAmount: 0.01 ether
            })
        });
    }

    function getSepoliaEthConfig() public pure returns (NetworkConfig memory) {
        return NetworkConfig({
            networkName: "Sepolia Testnet",
            vrf: VRFConfig({
                subscriptionId: 0,
                gasLane: 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae,
                callbackGasLimit: 500000,
                vrfCoordinatorV2_5: 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B,
                link: 0x779877A7B0D9E8603169DdbD7836e478b4624789,
                account: 0x643315C9Be056cDEA171F4e7b2222a4ddaB9F88D
            }),
            governance: GovernanceConfig({
                // ⚠️ IMPORTANT: Gitcoin Passport doesn't have native decoder on Ethereum Sepolia
                // Gitcoin supports: Optimism, Optimism Sepolia, Arbitrum, Linea, Scroll, etc.
                //
                // RECOMMENDED APPROACHES:
                // 1. TESTING: Use address(0) for bypass mode (current setting)
                // 2. PRODUCTION: Deploy to Optimism Sepolia instead of Ethereum Sepolia
                //    - Change deploy command to use Optimism Sepolia RPC
                //    - Use GITCOIN_DECODER_OPTIMISM_SEPOLIA address
                // 3. CUSTOM ORACLE: Build your own oracle that queries Gitcoin API
                pythContract: 0xDd24F84d36BF92C65F92307595335bdFab5Bbd21, // Pyth on ETH Sepolia
                passportDecoder: GITCOIN_DECODER_ETH_SEPOLIA, // address(0) - bypass mode for testing
                minimumPassportScore: 15,
                minimumStakeUSD: 5000, // $50 in cents
                minimumStake: 0.001 ether,
                cooldownPeriod: 300, // 5 minutes for demo
                candidateTenure: 7 days,
                jurorTenure: 14 days,
                jurorParticipation: 2,
                requiredAttestations: 2
            }),
            voting: VotingConfig({
                nominationDuration: 2 days,
                vettingCommitDuration: 1 days,
                vettingRevealDuration: 1 days,
                lotteryVotingDuration: 2 days,
                topNCandidates: 5,
                minimumNominations: 3,
                jurySize: 5,
                jurorStakeAmount: 0.001 ether
            })
        });
    }

    /**
     * @notice Get Optimism Sepolia config (RECOMMENDED for Gitcoin integration)
     * @dev Use this instead of Ethereum Sepolia for production with Gitcoin Passport
     */
    function getOptimismSepoliaConfig() public pure returns (NetworkConfig memory) {
        return NetworkConfig({
            networkName: "Optimism Sepolia Testnet",
            vrf: VRFConfig({
                subscriptionId: 10976871483152199173826666502359385038778269447292574984490821538488220394222,
                gasLane: 0xc3d5bc4d5600fa71f7a50b9ad841f14f24f9ca4236fd00bdb5fda56b052b28a4, 
                callbackGasLimit: 2500000, 
                vrfCoordinatorV2_5: 0x02667f44a6a44E4BDddCF80e724512Ad3426B17d, 
                link: 0xE4aB69C077896252FAFBD49EFD26B5D171A32410, 
                account: 0x9fDBBe3bB33882c4289189BC301017078430a934 
            }),
            governance: GovernanceConfig({
                pythContract: 0xDd24F84d36BF92C65F92307595335bdFab5Bbd21,
                passportDecoder: GITCOIN_DECODER_OPTIMISM_SEPOLIA,
                minimumPassportScore: 15,
                minimumStakeUSD: 5000,
                minimumStake: 0.001 ether,
                cooldownPeriod: 300, // 5 minutes for demo
                candidateTenure: 7 days,
                jurorTenure: 14 days,
                jurorParticipation: 2,
                requiredAttestations: 2
            }),
            voting: VotingConfig({
                nominationDuration: 2 days,
                vettingCommitDuration: 1 days,
                vettingRevealDuration: 1 days,
                lotteryVotingDuration: 2 days,
                topNCandidates: 5,
                minimumNominations: 3,
                jurySize: 5,
                jurorStakeAmount: 0.001 ether
            })
        });
    }

    function getOrCreateAnvilEthConfig() public returns (NetworkConfig memory) {
        if (localNetworkConfig.vrf.vrfCoordinatorV2_5 != address(0)) {
            return localNetworkConfig;
        }

        console2.log(unicode"⚠️ You have deployed mock contracts!");
        console2.log("Make sure this was intentional");
        console2.log(unicode"⚠️ Gitcoin Passport verification in BYPASS MODE (address(0))");
        console2.log("All registrations will succeed without real Gitcoin verification");

        vm.startBroadcast();

        VRFCoordinatorV2_5Mock vrfCoordinatorV2_5Mock =
            new VRFCoordinatorV2_5Mock(MOCK_BASE_FEE, MOCK_GAS_PRICE_LINK, MOCK_WEI_PER_UNIT_LINK);
        LinkToken link = new LinkToken();
        uint256 subscriptionId = vrfCoordinatorV2_5Mock.createSubscription();

        vm.stopBroadcast();

        localNetworkConfig = NetworkConfig({
            networkName: "Anvil Localhost",
            vrf: VRFConfig({
                subscriptionId: subscriptionId,
                gasLane: 0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c,
                callbackGasLimit: 500000,
                vrfCoordinatorV2_5: address(vrfCoordinatorV2_5Mock),
                link: address(link),
                account: FOUNDRY_DEFAULT_SENDER
            }),
            governance: GovernanceConfig({
                // Local testing: Always use bypass mode
                pythContract: address(0), // Bypass for local testing
                passportDecoder: address(0),
                minimumPassportScore: 10,
                minimumStakeUSD: 5000, // $50 in cents
                minimumStake: 0.0001 ether,
                cooldownPeriod: 300, // 5 minutes for demo
                candidateTenure: 1 hours,
                jurorTenure: 2 hours,
                jurorParticipation: 1,
                requiredAttestations: 1
            }),
            voting: VotingConfig({
                nominationDuration: 30 minutes,
                vettingCommitDuration: 15 minutes,
                vettingRevealDuration: 15 minutes,
                lotteryVotingDuration: 30 minutes,
                topNCandidates: 3,
                minimumNominations: 1,
                jurySize: 3,
                jurorStakeAmount: 0.0001 ether
            })
        });

        vm.deal(localNetworkConfig.vrf.account, 100 ether);

        return localNetworkConfig;
    }
}