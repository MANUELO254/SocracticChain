// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title CandidacyNFT
 * @author Emmanuel Nyamweya
 * @notice ERC-721 NFT representing candidacy for governance positions
 * @dev Each NFT = one candidacy declaration with immutable IPFS metadata
 * 
 * Security Model:
 * - Minting gated by IdentityRegistry (sybil resistance)
 * - Vetting contracts can disqualify via VETTING_ROLE
 * - Platform metadata is immutable once set
 * - Cooldown prevents spam minting
 */
contract CandidacyNFT is ERC721URIStorage, ReentrancyGuard, AccessControl {
    
    /////////////////////
    //  CUSTOM ERRORS //
    ///////////////////
    
    error CandidacyNFT__NotEligible();
    error CandidacyNFT__InvalidIPFSHash();
    error CandidacyNFT__CooldownActive();
    error CandidacyNFT__AlreadyActiveCandidacy();
    error CandidacyNFT__TokenDoesNotExist();
    error CandidacyNFT__NotVettingContract();
    error CandidacyNFT__AlreadyDisqualified();
    error CandidacyNFT__InvalidElectionId();
    error CandidacyNFT__ZeroAddress();
    error CandidacyNFT__SoulboundToken();
    
   /////////////////////////
   // TYPE DECLARATIONS //
   //////////////////////
    
    /**
     * @notice Candidacy metadata and state
     * @dev Packed into 3 storage slots for gas efficiency
     * Slot 1: candidate (20 bytes) + mintedAt (12 bytes)
     * Slot 2: electionId (32 bytes)
     * Slot 3: isActive (1 byte) + disqualifiedAt (12 bytes) + padding
     */
    struct Candidacy {
        address candidate;           
        uint96 mintedAt;            
        uint256 electionId;         
        bool isActive;              
        uint96 disqualifiedAt;      
        string platformIPFS;        
    }
    
    ///////////////////////
   //  STATE VARIABLES  //
   //////////////////////
    
    address public immutable identityRegistry;
    uint256 public immutable cooldownPeriod;
    
    bytes32 public constant VETTING_ROLE = keccak256("VETTING_ROLE");
    
    uint256 private _tokenIdCounter;
    
    mapping(uint256 => Candidacy) public candidacies;
    mapping(address => uint256) public activeCandidacyId;
    mapping(address => uint96) public lastMintTimestamp;
    mapping(uint256 => uint256[]) public electionCandidates;
    
    uint256[] private _allCandidacyIds;
    
    /////////////
    // EVENTS //
    ///////////
    
    event CandidacyDeclared(
        uint256 indexed tokenId,
        address indexed candidate,
        uint256 indexed electionId,
        string platformIPFS,
        uint256 timestamp
    );
    
    event CandidacyDisqualified(
        uint256 indexed tokenId,
        address indexed candidate,
        address indexed disqualifiedBy,
        uint256 timestamp
    );
    
    event VettingContractUpdated(
        address indexed vettingContract,
        bool hasRole
    );
    
  //////////////////
  // CONSTRUCTOR //
  ////////////////
    
    constructor(
        address _identityRegistry,
        uint256 _cooldownPeriod,
        string memory _name,
        string memory _symbol
    ) ERC721(_name, _symbol) {
        if (_identityRegistry == address(0)) revert CandidacyNFT__ZeroAddress();
        
        identityRegistry = _identityRegistry;
        cooldownPeriod = _cooldownPeriod;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }
    
/////////////////////////
// EXTERNAL FUNCTIONS //
///////////////////////
    
    /**
     * @notice Mint a candidacy NFT (declare intent to run)
     * @dev Security checks:
     *      1. Caller is verified via IdentityRegistry
     *      2. No active candidacy exists
     *      3. Cooldown period elapsed since last candidacy
     *      4. Valid IPFS hash provided
     * 
     * @param _electionId Which election this candidacy is for
     * @param _platformIPFS IPFS hash of candidate platform document
     * @return tokenId The newly minted NFT ID
     */
    function mintCandidacy(
        uint256 _electionId,
        string calldata _platformIPFS
    ) 
        external 
        nonReentrant 
        returns (uint256) 
    {
        address candidate = msg.sender;

        if (!_isEligible(candidate)) {
            revert CandidacyNFT__NotEligible();
        }

        if (_electionId == 0) {
            revert CandidacyNFT__InvalidElectionId();
        }

        uint256 existingCandidacy = activeCandidacyId[candidate];
        if (existingCandidacy != 0 && candidacies[existingCandidacy].isActive) {
            revert CandidacyNFT__AlreadyActiveCandidacy();
        }
        
        uint96 lastMint = lastMintTimestamp[candidate];
        if (lastMint != 0) {
            uint256 timeSinceLastMint = block.timestamp - uint256(lastMint);
            if (timeSinceLastMint < cooldownPeriod) {
                revert CandidacyNFT__CooldownActive();
            }
        }
        
        if (!_isValidIPFSHash(_platformIPFS)) {
            revert CandidacyNFT__InvalidIPFSHash();
        }
        
        uint256 tokenId = _tokenIdCounter++;
        
        uint96 currentTime = uint96(block.timestamp);
        
        candidacies[tokenId] = Candidacy({
            candidate: candidate,
            mintedAt: currentTime,
            electionId: _electionId,
            isActive: true,
            disqualifiedAt: 0,
            platformIPFS: _platformIPFS
        });
        
        activeCandidacyId[candidate] = tokenId;
        lastMintTimestamp[candidate] = currentTime;
        
        _allCandidacyIds.push(tokenId);
        electionCandidates[_electionId].push(tokenId);
    
        _safeMint(candidate, tokenId);
        _setTokenURI(tokenId, _platformIPFS);
        
        emit CandidacyDeclared(
            tokenId,
            candidate,
            _electionId,
            _platformIPFS,
            currentTime
        );
        
        return tokenId;
    }
    
    /**
     * @notice Disqualify a candidate (only callable by vetting contracts)
     * @dev This does NOT burn the NFT (preserves history), just marks inactive
     * 
     * @param _tokenId The candidacy NFT to disqualify
     */
    function disqualifyCandidate(uint256 _tokenId) 
        external 
        onlyRole(VETTING_ROLE) 
    {
        Candidacy storage candidacy = candidacies[_tokenId];
        
        if (candidacy.candidate == address(0)) {
            revert CandidacyNFT__TokenDoesNotExist();
        }
        
        if (!candidacy.isActive) {
            revert CandidacyNFT__AlreadyDisqualified();
        }
        
        candidacy.isActive = false;
        candidacy.disqualifiedAt = uint96(block.timestamp);
        
        activeCandidacyId[candidacy.candidate] = 0;
        
        emit CandidacyDisqualified(
            _tokenId,
            candidacy.candidate,
            msg.sender,
            block.timestamp
        );
    }
    
    /**
     * @notice Grant vetting role to a contract
     * @dev Only admin can call this
     * @param _vettingContract Address of vetting jury contract
     */
    function grantVettingRole(address _vettingContract) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        if (_vettingContract == address(0)) revert CandidacyNFT__ZeroAddress();
        
        _grantRole(VETTING_ROLE, _vettingContract);
        
        emit VettingContractUpdated(_vettingContract, true);
    }
    
    /**
     * @notice Revoke vetting role from a contract
     * @param _vettingContract Address to revoke from
     */
    function revokeVettingRole(address _vettingContract) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        _revokeRole(VETTING_ROLE, _vettingContract);
        
        emit VettingContractUpdated(_vettingContract, false);
    }
    
   //////////////////////
   //  VIEW FUNCTIONS //
   ////////////////////
    
    /**
     * @notice Get all candidacy IDs for an election
     * @param _electionId The election to query
     * @return Array of token IDs
     */
    function getCandidatesForElection(uint256 _electionId) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return electionCandidates[_electionId];
    }
    
    /**
     * @notice Get all ACTIVE candidacy IDs for an election
     * @dev Filters out disqualified candidates
     * @param _electionId The election to query
     * @return Array of active token IDs
     */
    function getActiveCandidatesForElection(uint256 _electionId) 
        external 
        view 
        returns (uint256[] memory) 
    {
        uint256[] memory allCandidates = electionCandidates[_electionId];
        
        uint256 activeCount = 0;
        uint256 length = allCandidates.length;
        
        for (uint256 i = 0; i < length;) {
            if (candidacies[allCandidates[i]].isActive) {
                unchecked { ++activeCount; }
            }
            unchecked { ++i; }
        }
        
        uint256[] memory activeCandidates = new uint256[](activeCount);
        uint256 index = 0;
        
        for (uint256 i = 0; i < length;) {
            uint256 tokenId = allCandidates[i];
            if (candidacies[tokenId].isActive) {
                activeCandidates[index] = tokenId;
                unchecked { ++index; }
            }
            unchecked { ++i; }
        }
        
        return activeCandidates;
    }
    
    /**
     * @notice Get detailed candidacy information
     * @param _tokenId Token to query
     * @return Full Candidacy struct
     */
    function getCandidacy(uint256 _tokenId) 
        external 
        view 
        returns (Candidacy memory) 
    {
        Candidacy memory candidacy = candidacies[_tokenId];
        
        if (candidacy.candidate == address(0)) {
            revert CandidacyNFT__TokenDoesNotExist();
        }
        
        return candidacy;
    }
    
    /**
     * @notice Check if an address has an active candidacy
     * @param _candidate Address to check
     * @return tokenId (0 if none), isActive
     */
    function getActiveCandidacyForAddress(address _candidate) 
        external 
        view 
        returns (uint256 tokenId, bool isActive) 
    {
        tokenId = activeCandidacyId[_candidate];
        
        if (tokenId != 0) {
            isActive = candidacies[tokenId].isActive;
        }
        
        return (tokenId, isActive);
    }
    
    /**
     * @notice Get total number of candidacies ever created
     * @return Total count
     */
    function totalCandidacies() external view returns (uint256) {
        return _tokenIdCounter;
    }
    
    /**
     * @notice Batch query candidacy status
     * @dev Useful for frontend to check multiple candidates
     * @param _tokenIds Array of token IDs to check
     * @return isActive Array of active status (parallel to input)
     */
    function batchGetCandidacyStatus(uint256[] calldata _tokenIds) 
        external 
        view 
        returns (bool[] memory isActive) 
    {
        uint256 length = _tokenIds.length;
        isActive = new bool[](length);
        
        for (uint256 i = 0; i < length;) {
            isActive[i] = candidacies[_tokenIds[i]].isActive;
            unchecked { ++i; }
        }
        
        return isActive;
    }
    
    /////////////////////////
    // INTERNAL FUNCTIONS //
    ////////////////////////
    
    /**
     * @notice Check if address is eligible to mint candidacy
     * @dev Calls external IdentityRegistry (trust boundary)
     * @param _candidate Address to check
     * @return true if eligible
     */
    function _isEligible(address _candidate) internal view returns (bool) {
        (bool success, bytes memory returnData) = identityRegistry.staticcall{gas: 50000}(
            abi.encodeWithSignature("isEligibleCandidate(address)", _candidate)
        );
        
        if (!success || returnData.length == 0) {
            return false;
        }
        
        return abi.decode(returnData, (bool));
    }
    
    /**
     * @notice Validate IPFS hash format
     * @dev Basic check: starts with "Qm" and is 46 chars (CIDv0) or "bafy" (CIDv1)
     * @param _ipfsHash The hash to validate
     * @return true if valid format
     */
    function _isValidIPFSHash(string calldata _ipfsHash) internal pure returns (bool) {
        bytes calldata hashBytes = bytes(_ipfsHash);
        uint256 length = hashBytes.length;
        
        if (length == 46) {
            return hashBytes[0] == 0x51 && hashBytes[1] == 0x6D; 
        }
        
        if (length >= 50 && length <= 100) {
            return hashBytes[0] == 0x62 && 
                   hashBytes[1] == 0x61 && 
                   hashBytes[2] == 0x66 && 
                   hashBytes[3] == 0x79; 
        }
        
        return false;
    }
    
    /**
     * @notice Override to prevent transfers (soulbound candidacy)
     * @dev Candidacies are tied to specific addresses, should not transfer
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        
        if (from != address(0) && to != address(0)) {
            revert CandidacyNFT__SoulboundToken();
        }
        
        return super._update(to, tokenId, auth);
    }
    
///////////////////
//   OVERRIDES  //
//////////////////
    
    /**
     * @dev Override tokenURI to resolve conflict between ERC721 and ERC721URIStorage
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
    
    /**
     * @dev See {IERC165-supportsInterface}
     */
    function supportsInterface(bytes4 interfaceId) 
        public 
        view 
        override(ERC721URIStorage, AccessControl) 
        returns (bool) 
    {
        return super.supportsInterface(interfaceId);
    }
}