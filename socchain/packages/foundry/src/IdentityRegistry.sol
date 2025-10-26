//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {PythStructs} from "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

/**
 * @title IdentityRegistry
 * @author Emmanuel Nyamweya
 * @notice Sybil-resistant identity verification for DDSP governance
 * @dev FIXED: Added batch member queries for efficient frontend loading
 */
contract IdentityRegistry is AccessControl, ReentrancyGuard {
    /////////////////////
    //  CUSTOM ERRORS //
    ///////////////////

    error IdentityRegistry__InsufficientPassportScore();
    error IdentityRegistry__InsufficientStake();
    error IdentityRegistry__NotRegistered();
    error IdentityRegistry__AlreadyRegistered();
    error IdentityRegistry__InsufficientTenure();
    error IdentityRegistry__ZeroAddress();
    error IdentityRegistry__InvalidAttestor();
    error IdentityRegistry__SelfAttestation();
    error IdentityRegistry__PassportVerificationFailed();
    error IdentityRegistry__ScoreUpdateTooRecent();
    error IdentityRegistry__InvalidThreshold();
    error IdentityRegistry__PythPriceStale();
    error IdentityRegistry__PythPriceInvalid();

    /////////////////////////
    // TYPE DECLARATIONS //
    //////////////////////

    struct Identity {
        address member;
        uint96 registeredAt;
        uint96 lastActivityAt;
        uint64 passportScore;
        uint96 lastScoreUpdate;
        uint256 participationCount;
        uint256 stakeAmount;
        bool isWhitelisted;
        bool isBanned;
    }

    struct Attestation {
        address attestor;
        address attestee;
        uint96 timestamp;
        string evidence;
        bool isActive;
    }

    struct MemberProfile {
        address member;
        uint64 passportScore;
        uint256 stakeAmount;
        uint96 registeredAt;
        uint256 participationCount;
        uint256 attestationCount;
        bool isEligibleVoter;
        bool isEligibleCandidate;
        bool isEligibleJuror;
    }

    /////////////////////////
    //  STATE VARIABLES   //
    ////////////////////////

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    IPyth public immutable pyth;
    bytes32 public constant ETH_USD_PRICE_ID = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    uint256 public constant PYTH_PRICE_STALENESS_THRESHOLD = 60;

    address public passportDecoder;
    uint256 public minimumPassportScore;
    uint256 public scoreUpdateCooldown;
    uint256 public minimumStakeUSD;
    uint256 public minimumStakeETH;
    uint256 public candidateTenure;
    uint256 public jurorTenure;
    uint256 public jurorParticipation;
    uint256 public requiredAttestations;

    mapping(address => Identity) public identities;
    mapping(address => mapping(address => bool)) public hasAttested;
    mapping(address => Attestation[]) public attestationsReceived;
    mapping(address => uint256) public activeAttestationCount;

    address[] private _allMembers;
    mapping(address => bool) private _isMember;

    uint256 public totalMembers;
    uint256 public totalAttestations;

    /////////////
    // EVENTS //
    ///////////

    event MemberRegistered(
        address indexed member, uint256 passportScore, uint256 stakeAmount, uint256 stakeUSD, uint256 timestamp
    );
    event PassportScoreUpdated(address indexed member, uint256 oldScore, uint256 newScore, uint256 timestamp);
    event StakeIncreased(address indexed member, uint256 amount, uint256 newTotal, uint256 newTotalUSD);
    event StakeWithdrawn(address indexed member, uint256 amount, uint256 remaining);
    event AttestationCreated(address indexed attestor, address indexed attestee, uint256 timestamp, string evidence);
    event AttestationRevoked(address indexed attestor, address indexed attestee, uint256 timestamp);
    event ActivityRecorded(address indexed member, uint256 timestamp);
    event MemberWhitelisted(address indexed member, bool status);
    event MemberBanned(address indexed member, bool status);
    event ThresholdUpdated(string parameter, uint256 oldValue, uint256 newValue);
    event PythPriceUsed(address indexed member, uint256 ethPrice, uint256 stakeUSD, uint256 timestamp);

    //////////////////
    // CONSTRUCTOR //
    ////////////////

    constructor(
        address _pythContract,
        address _passportDecoder,
        uint256 _minimumPassportScore,
        uint256 _minimumStakeUSD,
        uint256 _minimumStakeETH
    ) {
        if (_pythContract == address(0)) revert IdentityRegistry__ZeroAddress();
        //if (_passportDecoder == address(0)) revert IdentityRegistry__ZeroAddress();

        pyth = IPyth(_pythContract);
        passportDecoder = _passportDecoder;
        minimumPassportScore = _minimumPassportScore;
        minimumStakeUSD = _minimumStakeUSD;
        minimumStakeETH = _minimumStakeETH;

        scoreUpdateCooldown = 1 days;
        candidateTenure = 30 days;
        jurorTenure = 180 days;
        jurorParticipation = 3;
        requiredAttestations = 2;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    /////////////////////////
    // EXTERNAL FUNCTIONS //
    ///////////////////////

    function register(uint256 _passportScore, bytes calldata _proof, bytes[] calldata _pythPriceUpdate)
        external
        payable
        nonReentrant
    {
        address member = msg.sender;

        if (_isMember[member]) revert IdentityRegistry__AlreadyRegistered();
        if (_passportScore < minimumPassportScore) revert IdentityRegistry__InsufficientPassportScore();
        if (!_verifyPassportProof(member, _passportScore, _proof)) {
            revert IdentityRegistry__PassportVerificationFailed();
        }

        uint256 stakeUSD = _validateStakeWithPyth(_pythPriceUpdate);

        uint96 currentTime = uint96(block.timestamp);

        identities[member] = Identity({
            member: member,
            registeredAt: currentTime,
            lastActivityAt: currentTime,
            passportScore: uint64(_passportScore),
            lastScoreUpdate: currentTime,
            participationCount: 0,
            stakeAmount: msg.value,
            isWhitelisted: false,
            isBanned: false
        });

        _isMember[member] = true;
        _allMembers.push(member);
        totalMembers++;

        emit MemberRegistered(member, _passportScore, msg.value, stakeUSD, currentTime);
    }

    function updatePassportScore(address _member, uint256 _newScore, bytes calldata _proof) external {
        if (!_isMember[_member]) revert IdentityRegistry__NotRegistered();

        Identity storage identity = identities[_member];

        uint256 timeSinceUpdate = block.timestamp - uint256(identity.lastScoreUpdate);
        if (timeSinceUpdate < scoreUpdateCooldown) revert IdentityRegistry__ScoreUpdateTooRecent();
        if (!_verifyPassportProof(_member, _newScore, _proof)) revert IdentityRegistry__PassportVerificationFailed();

        uint256 oldScore = identity.passportScore;
        identity.passportScore = uint64(_newScore);
        identity.lastScoreUpdate = uint96(block.timestamp);

        emit PassportScoreUpdated(_member, oldScore, _newScore, block.timestamp);
    }

    function increaseStake(bytes[] calldata _pythPriceUpdate) external payable nonReentrant {
        if (!_isMember[msg.sender]) revert IdentityRegistry__NotRegistered();
        if (msg.value == 0) revert IdentityRegistry__InsufficientStake();

        Identity storage identity = identities[msg.sender];
        identity.stakeAmount += msg.value;

        uint256 totalUSD = _calculateStakeUSD(identity.stakeAmount, _pythPriceUpdate);

        emit StakeIncreased(msg.sender, msg.value, identity.stakeAmount, totalUSD);
    }

    function withdrawStake(uint256 _amount, bytes[] calldata _pythPriceUpdate) external nonReentrant {
        Identity storage identity = identities[msg.sender];

        if (identity.stakeAmount < _amount) revert IdentityRegistry__InsufficientStake();

        uint256 remaining = identity.stakeAmount - _amount;

        uint256 remainingUSD = _calculateStakeUSD(remaining, _pythPriceUpdate);
        if (remainingUSD < minimumStakeUSD * 1e16) revert IdentityRegistry__InsufficientStake();

        identity.stakeAmount = remaining;

        (bool success,) = msg.sender.call{value: _amount}("");
        require(success, "Transfer failed");

        emit StakeWithdrawn(msg.sender, _amount, remaining);
    }

    function createAttestation(address _attestee, string calldata _evidence) external {
        address attestor = msg.sender;

        if (!_isMember[attestor]) revert IdentityRegistry__NotRegistered();
        if (!_isMember[_attestee]) revert IdentityRegistry__NotRegistered();
        if (attestor == _attestee) revert IdentityRegistry__SelfAttestation();
        if (hasAttested[attestor][_attestee]) revert IdentityRegistry__InvalidAttestor();
        if (!isEligibleVoter(attestor)) revert IdentityRegistry__InvalidAttestor();

        Attestation memory attestation = Attestation({
            attestor: attestor,
            attestee: _attestee,
            timestamp: uint96(block.timestamp),
            evidence: _evidence,
            isActive: true
        });

        attestationsReceived[_attestee].push(attestation);
        hasAttested[attestor][_attestee] = true;
        activeAttestationCount[_attestee]++;
        totalAttestations++;

        emit AttestationCreated(attestor, _attestee, block.timestamp, _evidence);
    }

    function revokeAttestation(address _attestee) external {
        if (!hasAttested[msg.sender][_attestee]) revert IdentityRegistry__InvalidAttestor();

        Attestation[] storage attestations = attestationsReceived[_attestee];
        for (uint256 i = 0; i < attestations.length;) {
            if (attestations[i].attestor == msg.sender && attestations[i].isActive) {
                attestations[i].isActive = false;
                activeAttestationCount[_attestee]--;
                break;
            }
            unchecked {
                ++i;
            }
        }

        hasAttested[msg.sender][_attestee] = false;

        emit AttestationRevoked(msg.sender, _attestee, block.timestamp);
    }

    function recordActivity(address _member) external {
        if (!_isMember[_member]) revert IdentityRegistry__NotRegistered();

        Identity storage identity = identities[_member];
        identity.lastActivityAt = uint96(block.timestamp);
        identity.participationCount++;

        emit ActivityRecorded(_member, block.timestamp);
    }

    //////////////////////
    //  ADMIN FUNCTIONS //
    //////////////////////

    function setWhitelist(address _member, bool _status) external onlyRole(ADMIN_ROLE) {
        if (_member == address(0)) revert IdentityRegistry__ZeroAddress();

        if (_status && !_isMember[_member]) {
            identities[_member] = Identity({
                member: _member,
                registeredAt: uint96(block.timestamp),
                lastActivityAt: uint96(block.timestamp),
                passportScore: uint64(minimumPassportScore),
                lastScoreUpdate: uint96(block.timestamp),
                participationCount: 0,
                stakeAmount: 0,
                isWhitelisted: true,
                isBanned: false
            });

            _isMember[_member] = true;
            _allMembers.push(_member);
            totalMembers++;
        } else {
            identities[_member].isWhitelisted = _status;
        }

        emit MemberWhitelisted(_member, _status);
    }

    function setBanned(address _member, bool _status) external onlyRole(ADMIN_ROLE) {
        if (!_isMember[_member]) revert IdentityRegistry__NotRegistered();

        identities[_member].isBanned = _status;

        emit MemberBanned(_member, _status);
    }

    function updateThresholds(
        uint256 _minimumPassportScore,
        uint256 _minimumStakeUSD,
        uint256 _minimumStakeETH,
        uint256 _candidateTenure,
        uint256 _jurorTenure,
        uint256 _jurorParticipation,
        uint256 _requiredAttestations
    ) external onlyRole(ADMIN_ROLE) {
        if (_minimumPassportScore == 0 || _minimumStakeUSD == 0 || _minimumStakeETH == 0) {
            revert IdentityRegistry__InvalidThreshold();
        }

        emit ThresholdUpdated("minimumPassportScore", minimumPassportScore, _minimumPassportScore);
        emit ThresholdUpdated("minimumStakeUSD", minimumStakeUSD, _minimumStakeUSD);
        emit ThresholdUpdated("minimumStakeETH", minimumStakeETH, _minimumStakeETH);
        emit ThresholdUpdated("candidateTenure", candidateTenure, _candidateTenure);
        emit ThresholdUpdated("jurorTenure", jurorTenure, _jurorTenure);
        emit ThresholdUpdated("jurorParticipation", jurorParticipation, _jurorParticipation);
        emit ThresholdUpdated("requiredAttestations", requiredAttestations, _requiredAttestations);

        minimumPassportScore = _minimumPassportScore;
        minimumStakeUSD = _minimumStakeUSD;
        minimumStakeETH = _minimumStakeETH;
        candidateTenure = _candidateTenure;
        jurorTenure = _jurorTenure;
        jurorParticipation = _jurorParticipation;
        requiredAttestations = _requiredAttestations;
    }

    function updatePassportDecoder(address _newDecoder) external onlyRole(ADMIN_ROLE) {
        if (_newDecoder == address(0)) revert IdentityRegistry__ZeroAddress();
        passportDecoder = _newDecoder;
    }

    //////////////////////
    //  VIEW FUNCTIONS //
    ////////////////////

    function isEligibleCandidate(address _candidate) external view returns (bool) {
        if (!_isMember[_candidate]) return false;

        Identity memory identity = identities[_candidate];

        if (identity.isBanned) return false;
        if (identity.isWhitelisted) return true;
        if (identity.passportScore < minimumPassportScore) return false;
        if (identity.stakeAmount < minimumStakeETH) return false;

        uint256 membershipDuration = block.timestamp - uint256(identity.registeredAt);
        if (membershipDuration < candidateTenure) return false;
        if (activeAttestationCount[_candidate] < requiredAttestations) return false;

        return true;
    }

    function isEligibleVoter(address _voter) public view returns (bool) {
        if (!_isMember[_voter]) return false;

        Identity memory identity = identities[_voter];

        if (identity.isBanned) return false;
        if (identity.isWhitelisted) return true;
        if (identity.passportScore < minimumPassportScore) return false;
        if (identity.stakeAmount < minimumStakeETH) return false;

        return true;
    }

    function isEligibleJuror(address _juror) external view returns (bool) {
        if (!isEligibleVoter(_juror)) return false;

        Identity memory identity = identities[_juror];

        if (identity.isWhitelisted) return true;

        uint256 membershipDuration = block.timestamp - uint256(identity.registeredAt);
        if (membershipDuration < jurorTenure) return false;
        if (identity.participationCount < jurorParticipation) return false;

        return true;
    }

    function getStakeInUSD(address _member, bytes[] calldata _pythPriceUpdate) external returns (uint256) {
        if (!_isMember[_member]) revert IdentityRegistry__NotRegistered();

        Identity memory identity = identities[_member];
        return _calculateStakeUSD(identity.stakeAmount, _pythPriceUpdate);
    }

    function getStakeInUSDView(address _member) external view returns (uint256) {
        if (!_isMember[_member]) revert IdentityRegistry__NotRegistered();

        Identity memory identity = identities[_member];

        try pyth.getPriceNoOlderThan(ETH_USD_PRICE_ID, PYTH_PRICE_STALENESS_THRESHOLD) returns (
            PythStructs.Price memory ethPrice
        ) {
            if (ethPrice.price <= 0) return 0;

            return (identity.stakeAmount * uint256(uint64(ethPrice.price))) / 1e16;
        } catch {
            return 0;
        }
    }

    function getIdentity(address _member) external view returns (Identity memory) {
        if (!_isMember[_member]) revert IdentityRegistry__NotRegistered();
        return identities[_member];
    }

    function getAttestations(address _member) external view returns (Attestation[] memory) {
        return attestationsReceived[_member];
    }

    function getActiveAttestationCount(address _member) external view returns (uint256) {
        return activeAttestationCount[_member];
    }

    function getAllMembers() external view returns (address[] memory) {
        return _allMembers;
    }

    function batchCheckEligibility(address[] calldata _voters) external view returns (bool[] memory) {
        uint256 length = _voters.length;
        bool[] memory eligibility = new bool[](length);

        for (uint256 i = 0; i < length;) {
            eligibility[i] = isEligibleVoter(_voters[i]);
            unchecked {
                ++i;
            }
        }

        return eligibility;
    }

    function getBatchMemberProfiles(address[] calldata _members) external view returns (MemberProfile[] memory) {
        uint256 length = _members.length;
        MemberProfile[] memory profiles = new MemberProfile[](length);

        for (uint256 i = 0; i < length;) {
            address member = _members[i];

            if (!_isMember[member]) {
                unchecked {
                    ++i;
                }
                continue;
            }

            Identity memory identity = identities[member];

            profiles[i] = MemberProfile({
                member: member,
                passportScore: identity.passportScore,
                stakeAmount: identity.stakeAmount,
                registeredAt: identity.registeredAt,
                participationCount: identity.participationCount,
                attestationCount: activeAttestationCount[member],
                isEligibleVoter: _checkVoterEligibility(identity),
                isEligibleCandidate: _checkCandidateEligibility(identity, member),
                isEligibleJuror: _checkJurorEligibility(identity)
            });

            unchecked {
                ++i;
            }
        }

        return profiles;
    }

    // Update: Get paginated members (offset + limit)
    function getMembersPaginated(uint256 _offset, uint256 _limit)
        external
        view
        returns (address[] memory members, uint256 total)
    {
        total = _allMembers.length;

        if (_offset >= total) {
            return (new address[](0), total);
        }

        uint256 end = _offset + _limit;
        if (end > total) {
            end = total;
        }

        uint256 resultLength = end - _offset;
        members = new address[](resultLength);

        for (uint256 i = 0; i < resultLength;) {
            members[i] = _allMembers[_offset + i];
            unchecked {
                ++i;
            }
        }

        return (members, total);
    }

    /////////////////////////
    // INTERNAL FUNCTIONS //
    ////////////////////////

    function _verifyPassportProof(address _member, uint256 _score, bytes calldata _proof)
        internal
        view
        returns (bool)
    {
        if (passportDecoder == address(0)) {
            return _score >= minimumPassportScore;
        }

        (bool success, bytes memory returnData) = passportDecoder.staticcall{gas: 100000}(
            abi.encodeWithSignature("verifyScore(address,uint256,bytes)", _member, _score, _proof)
        );

        if (!success || returnData.length == 0) return false;

        return abi.decode(returnData, (bool));
    }

    function _validateStakeWithPyth(bytes[] calldata _pythPriceUpdate) internal returns (uint256 stakeUSD) {
        uint256 updateFee = pyth.getUpdateFee(_pythPriceUpdate);

        if (msg.value <= updateFee) revert IdentityRegistry__InsufficientStake();

        pyth.updatePriceFeeds{value: updateFee}(_pythPriceUpdate);

        PythStructs.Price memory ethPrice = pyth.getPriceNoOlderThan(ETH_USD_PRICE_ID, PYTH_PRICE_STALENESS_THRESHOLD);

        if (ethPrice.price <= 0) revert IdentityRegistry__PythPriceInvalid();

        uint256 actualStake = msg.value - updateFee;

        stakeUSD = (actualStake * uint256(uint64(ethPrice.price))) / 1e16;

        if (stakeUSD < minimumStakeUSD * 1e16) revert IdentityRegistry__InsufficientStake();

        if (actualStake < minimumStakeETH) revert IdentityRegistry__InsufficientStake();

        emit PythPriceUsed(msg.sender, uint256(uint64(ethPrice.price)), stakeUSD, block.timestamp);

        return stakeUSD;
    }

    function _calculateStakeUSD(uint256 _stakeAmount, bytes[] calldata _pythPriceUpdate) internal returns (uint256) {
        if (_pythPriceUpdate.length > 0) {
            uint256 updateFee = pyth.getUpdateFee(_pythPriceUpdate);
            pyth.updatePriceFeeds{value: updateFee}(_pythPriceUpdate);
        }

        PythStructs.Price memory ethPrice = pyth.getPriceNoOlderThan(ETH_USD_PRICE_ID, PYTH_PRICE_STALENESS_THRESHOLD);

        if (ethPrice.price <= 0) revert IdentityRegistry__PythPriceInvalid();

        return (_stakeAmount * uint256(uint64(ethPrice.price))) / 1e16;
    }

    // NEW: Internal eligibility helpers for batch queries
    function _checkVoterEligibility(Identity memory identity) internal view returns (bool) {
        if (identity.isBanned) return false;
        if (identity.isWhitelisted) return true;
        if (identity.passportScore < minimumPassportScore) return false;
        if (identity.stakeAmount < minimumStakeETH) return false;
        return true;
    }

    function _checkCandidateEligibility(Identity memory identity, address _candidate) internal view returns (bool) {
        if (identity.isBanned) return false;
        if (identity.isWhitelisted) return true;
        if (identity.passportScore < minimumPassportScore) return false;
        if (identity.stakeAmount < minimumStakeETH) return false;

        uint256 membershipDuration = block.timestamp - uint256(identity.registeredAt);
        if (membershipDuration < candidateTenure) return false;
        if (activeAttestationCount[_candidate] < requiredAttestations) return false;

        return true;
    }

    function _checkJurorEligibility(Identity memory identity) internal view returns (bool) {
        if (!_checkVoterEligibility(identity)) return false;
        if (identity.isWhitelisted) return true;

        uint256 membershipDuration = block.timestamp - uint256(identity.registeredAt);
        if (membershipDuration < jurorTenure) return false;
        if (identity.participationCount < jurorParticipation) return false;

        return true;
    }
}
