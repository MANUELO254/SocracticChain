//SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;


import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IdentityRegistry
 * @author Emmanuel Nyamweya
 * @notice Sybil-resistant identity verification for DDSP governance
 * @dev Multi-layered verification: Gitcoin Passport + on-chain activity + attestations
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
    
   /////////////////////////
   //  STATE VARIABLES   //
   ////////////////////////
    
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    
    address public passportDecoder;
    uint256 public minimumPassportScore;
    uint256 public scoreUpdateCooldown;
    uint256 public minimumStake;
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
    
    event MemberRegistered(address indexed member, uint256 passportScore, uint256 stakeAmount, uint256 timestamp);
    event PassportScoreUpdated(address indexed member, uint256 oldScore, uint256 newScore, uint256 timestamp);
    event StakeIncreased(address indexed member, uint256 amount, uint256 newTotal);
    event StakeWithdrawn(address indexed member, uint256 amount, uint256 remaining);
    event AttestationCreated(address indexed attestor, address indexed attestee, uint256 timestamp, string evidence);
    event AttestationRevoked(address indexed attestor, address indexed attestee, uint256 timestamp);
    event ActivityRecorded(address indexed member, uint256 timestamp);
    event MemberWhitelisted(address indexed member, bool status);
    event MemberBanned(address indexed member, bool status);
    event ThresholdUpdated(string parameter, uint256 oldValue, uint256 newValue);
    
  //////////////////
  // CONSTRUCTOR //
  ////////////////
    
    constructor(
        address _passportDecoder,
        uint256 _minimumPassportScore,
        uint256 _minimumStake
    ) {
        if (_passportDecoder == address(0)) revert IdentityRegistry__ZeroAddress();
        
        passportDecoder = _passportDecoder;
        minimumPassportScore = _minimumPassportScore;
        minimumStake = _minimumStake;
        
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
    
    /**
     * @notice Register as a verified member with Passport proof and stake
     */
    function register(uint256 _passportScore, bytes calldata _proof) external payable nonReentrant {
        address member = msg.sender;
        
        if (_isMember[member]) revert IdentityRegistry__AlreadyRegistered();
        if (_passportScore < minimumPassportScore) revert IdentityRegistry__InsufficientPassportScore();
        if (msg.value < minimumStake) revert IdentityRegistry__InsufficientStake();
        if (!_verifyPassportProof(member, _passportScore, _proof)) revert IdentityRegistry__PassportVerificationFailed();
        
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
        
        emit MemberRegistered(member, _passportScore, msg.value, currentTime);
    }
    
    /**
     * @notice Update cached Passport score with cooldown protection
     */
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
    
    function increaseStake() external payable {
        if (!_isMember[msg.sender]) revert IdentityRegistry__NotRegistered();
        if (msg.value == 0) revert IdentityRegistry__InsufficientStake();
        
        Identity storage identity = identities[msg.sender];
        identity.stakeAmount += msg.value;
        
        emit StakeIncreased(msg.sender, msg.value, identity.stakeAmount);
    }
    
    /**
     * @notice Withdraw stake (cannot go below minimum)
     */
    function withdrawStake(uint256 _amount) external nonReentrant {
        Identity storage identity = identities[msg.sender];
        
        if (identity.stakeAmount < _amount) revert IdentityRegistry__InsufficientStake();
        
        uint256 remaining = identity.stakeAmount - _amount;
        if (remaining < minimumStake) revert IdentityRegistry__InsufficientStake();
        
        identity.stakeAmount = remaining;
        
        (bool success, ) = msg.sender.call{value: _amount}("");
        require(success, "Transfer failed");
        
        emit StakeWithdrawn(msg.sender, _amount, remaining);
    }
    
    /**
     * @notice Create social graph attestation for another member
     */
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
            unchecked { ++i; }
        }
        
        hasAttested[msg.sender][_attestee] = false;
        
        emit AttestationRevoked(msg.sender, _attestee, block.timestamp);
    }
    
    /**
     * @notice Record governance participation (called by DDSP contracts)
     */
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
    
    /**
     * @notice Manual whitelist for testing/emergency (bypasses verification)
     */
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
        uint256 _minimumStake,
        uint256 _candidateTenure,
        uint256 _jurorTenure,
        uint256 _jurorParticipation,
        uint256 _requiredAttestations
    ) external onlyRole(ADMIN_ROLE) {
        if (_minimumPassportScore == 0 || _minimumStake == 0) revert IdentityRegistry__InvalidThreshold();
        
        emit ThresholdUpdated("minimumPassportScore", minimumPassportScore, _minimumPassportScore);
        emit ThresholdUpdated("minimumStake", minimumStake, _minimumStake);
        emit ThresholdUpdated("candidateTenure", candidateTenure, _candidateTenure);
        emit ThresholdUpdated("jurorTenure", jurorTenure, _jurorTenure);
        emit ThresholdUpdated("jurorParticipation", jurorParticipation, _jurorParticipation);
        emit ThresholdUpdated("requiredAttestations", requiredAttestations, _requiredAttestations);
        
        minimumPassportScore = _minimumPassportScore;
        minimumStake = _minimumStake;
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
    
    /**
     * @notice Check candidacy eligibility (called by CandidacyNFT)
     * @dev Requires: registered, not banned, passport score, stake, tenure, attestations
     */
    function isEligibleCandidate(address _candidate) external view returns (bool) {
        if (!_isMember[_candidate]) return false;
        
        Identity memory identity = identities[_candidate];
        
        if (identity.isBanned) return false;
        if (identity.isWhitelisted) return true;
        if (identity.passportScore < minimumPassportScore) return false;
        if (identity.stakeAmount < minimumStake) return false;
        
        uint256 membershipDuration = block.timestamp - uint256(identity.registeredAt);
        if (membershipDuration < candidateTenure) return false;
        if (activeAttestationCount[_candidate] < requiredAttestations) return false;
        
        return true;
    }
    
    /**
     * @notice Check voter eligibility (called by voting contracts)
     * @dev Requires: registered, not banned, passport score, stake
     */
    function isEligibleVoter(address _voter) public view returns (bool) {
        if (!_isMember[_voter]) return false;
        
        Identity memory identity = identities[_voter];
        
        if (identity.isBanned) return false;
        if (identity.isWhitelisted) return true;
        if (identity.passportScore < minimumPassportScore) return false;
        if (identity.stakeAmount < minimumStake) return false;
        
        return true;
    }
    
    /**
     * @notice Check juror eligibility (called by VettingJury)
     * @dev Requires: voter requirements + longer tenure + participation history
     */
    function isEligibleJuror(address _juror) external view returns (bool) {
        if (!isEligibleVoter(_juror)) return false;
        
        Identity memory identity = identities[_juror];
        
        if (identity.isWhitelisted) return true;
        
        uint256 membershipDuration = block.timestamp - uint256(identity.registeredAt);
        if (membershipDuration < jurorTenure) return false;
        if (identity.participationCount < jurorParticipation) return false;
        
        return true;
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
            unchecked { ++i; }
        }
        
        return eligibility;
    }
    
    /////////////////////////
    // INTERNAL FUNCTIONS //
    ////////////////////////
    
    /**
     * @notice Verify Gitcoin Passport score proof via oracle
     */
    function _verifyPassportProof(
        address _member,
        uint256 _score,
        bytes calldata _proof
    ) internal view returns (bool) {
        if (passportDecoder == address(0)) {
            return _score >= minimumPassportScore;
        }
        
        (bool success, bytes memory returnData) = passportDecoder.staticcall{gas: 100000}(
            abi.encodeWithSignature("verifyScore(address,uint256,bytes)", _member, _score, _proof)
        );
        
        if (!success || returnData.length == 0) return false;
        
        return abi.decode(returnData, (bool));
    }
}