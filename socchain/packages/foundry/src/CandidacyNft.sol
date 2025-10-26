// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {IdentityRegistry} from "./IdentityRegistry.sol";

/**
 * @title CandidacyNFT
 * @author Emmanuel Nyamweya
 * @notice ERC-721 NFT representing candidacy for governance positions
 * @dev FIXED: Added structured metadata for rich platform display
 */
contract CandidacyNFT is ERC721URIStorage, ReentrancyGuard, AccessControl {
    /////////////////////
    //  CUSTOM ERRORS  //
    /////////////////////

    error CandidacyNFT__NotEligible();
    error CandidacyNFT__InvalidIPFSHash();
    error CandidacyNFT__CooldownActive();
    error CandidacyNFT__AlreadyActiveCandidacy();
    error CandidacyNFT__TokenDoesNotExist();
    error CandidacyNFT__AlreadyDisqualified();
    error CandidacyNFT__InvalidElectionId();
    error CandidacyNFT__ZeroAddress();
    error CandidacyNFT__InvalidTags();

    /////////////////////////
    // TYPE DECLARATIONS   //
    /////////////////////////

    struct Candidacy {
        address candidate;
        uint96 mintedAt;
        uint256 electionId;
        bool isActive;
        uint96 disqualifiedAt;
        string platformIPFS;
        string platformSummary; //Short summary (500 chars)
        string[] tags; //Platform tags/categories
    }

    // Enriched candidate info for frontend display
    struct CandidateProfile {
        uint256 tokenId;
        address candidate;
        uint256 electionId;
        bool isActive;
        string platformIPFS;
        string platformSummary;
        string[] tags;
        uint96 mintedAt;
        uint256 attestationCount;
    }

    ///////////////////////
    //  STATE VARIABLES  //
    ///////////////////////

    IdentityRegistry public immutable identityRegistry;
    uint256 public immutable cooldownPeriod;

    bytes32 public constant VETTING_ROLE = keccak256("VETTING_ROLE");

    uint256 private _tokenIdCounter;

    mapping(uint256 => Candidacy) public candidacies;
    mapping(address => uint256) public activeCandidacyId;
    mapping(address => uint96) public lastMintTimestamp;
    mapping(uint256 => uint256[]) public electionCandidates;

    uint256[] private _allCandidacyIds;

    /////////////
    // EVENTS  //
    /////////////

    event CandidacyDeclared(
        uint256 indexed tokenId,
        address indexed candidate,
        uint256 indexed electionId,
        string platformIPFS,
        string platformSummary,
        string[] tags,
        uint256 timestamp
    );

    event CandidacyDisqualified(
        uint256 indexed tokenId, address indexed candidate, address indexed disqualifiedBy, uint256 timestamp
    );

    event VettingContractUpdated(address indexed vettingContract, bool hasRole);

    //////////////////
    // CONSTRUCTOR  //
    //////////////////

    constructor(address _identityRegistry, uint256 _cooldownPeriod, string memory _name, string memory _symbol)
        ERC721(_name, _symbol)
    {
        if (_identityRegistry == address(0)) revert CandidacyNFT__ZeroAddress();

        identityRegistry = IdentityRegistry(_identityRegistry);
        cooldownPeriod = _cooldownPeriod;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /////////////////////////
    // EXTERNAL FUNCTIONS  //
    /////////////////////////

    /**
     * @notice Mint a candidacy NFT for an election with metadata
     * @param _electionId The election ID the candidate is running for
     * @param _platformIPFS IPFS CID containing full candidate manifesto
     * @param _platformSummary Short summary (max 500 chars) for quick display
     * @param _tags Array of category tags (e.g., ["Economy", "Security"])
     */
    function mintCandidacy(
        uint256 _electionId,
        string calldata _platformIPFS,
        string calldata _platformSummary,
        string[] calldata _tags
    ) external nonReentrant returns (uint256) {
        address candidate = msg.sender;

        if (!identityRegistry.isEligibleCandidate(candidate)) {
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

        // Validate inputs
        string memory cid = _extractCID(_platformIPFS);
        if (!_isValidIPFSCID(cid)) {
            revert CandidacyNFT__InvalidIPFSHash();
        }

        if (bytes(_platformSummary).length > 500) {
            revert CandidacyNFT__InvalidTags();
        }

        if (_tags.length > 10) {
            revert CandidacyNFT__InvalidTags();
        }

        uint256 tokenId = _tokenIdCounter++;
        uint96 currentTime = uint96(block.timestamp);

        candidacies[tokenId] = Candidacy({
            candidate: candidate,
            mintedAt: currentTime,
            electionId: _electionId,
            isActive: true,
            disqualifiedAt: 0,
            platformIPFS: cid,
            platformSummary: _platformSummary,
            tags: _tags
        });

        activeCandidacyId[candidate] = tokenId;
        lastMintTimestamp[candidate] = currentTime;

        _allCandidacyIds.push(tokenId);
        electionCandidates[_electionId].push(tokenId);

        _safeMint(candidate, tokenId);
        _setTokenURI(tokenId, string.concat("ipfs://", cid));

        emit CandidacyDeclared(tokenId, candidate, _electionId, cid, _platformSummary, _tags, currentTime);

        return tokenId;
    }

    function disqualifyCandidate(uint256 _tokenId) external onlyRole(VETTING_ROLE) {
        Candidacy storage candidacy = candidacies[_tokenId];

        if (candidacy.candidate == address(0)) revert CandidacyNFT__TokenDoesNotExist();
        if (!candidacy.isActive) revert CandidacyNFT__AlreadyDisqualified();

        candidacy.isActive = false;
        candidacy.disqualifiedAt = uint96(block.timestamp);
        activeCandidacyId[candidacy.candidate] = 0;

        emit CandidacyDisqualified(_tokenId, candidacy.candidate, msg.sender, block.timestamp);
    }

    function grantVettingRole(address _vettingContract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_vettingContract == address(0)) revert CandidacyNFT__ZeroAddress();

        _grantRole(VETTING_ROLE, _vettingContract);
        emit VettingContractUpdated(_vettingContract, true);
    }

    function revokeVettingRole(address _vettingContract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(VETTING_ROLE, _vettingContract);
        emit VettingContractUpdated(_vettingContract, false);
    }

    //////////////////////
    //  VIEW FUNCTIONS  //
    //////////////////////

    function getCandidatesForElection(uint256 _electionId) external view returns (uint256[] memory) {
        return electionCandidates[_electionId];
    }

    function getActiveCandidatesForElection(uint256 _electionId) external view returns (uint256[] memory) {
        uint256[] memory allCandidates = electionCandidates[_electionId];
        uint256 activeCount = 0;
        uint256 length = allCandidates.length;

        for (uint256 i = 0; i < length;) {
            if (candidacies[allCandidates[i]].isActive) {
                unchecked {
                    ++activeCount;
                }
            }
            unchecked {
                ++i;
            }
        }

        uint256[] memory activeCandidates = new uint256[](activeCount);
        uint256 index = 0;

        for (uint256 i = 0; i < length;) {
            uint256 tokenId = allCandidates[i];
            if (candidacies[tokenId].isActive) {
                activeCandidates[index] = tokenId;
                unchecked {
                    ++index;
                }
            }
            unchecked {
                ++i;
            }
        }

        return activeCandidates;
    }

    function getCandidacyInfo(uint256 _tokenId) external view returns (Candidacy memory) {
        return candidacies[_tokenId];
    }

    function getCandidacy(uint256 _tokenId) external view returns (Candidacy memory) {
        return candidacies[_tokenId];
    }

    //  Get a more detailed candidate profile with attestation count
    function getCandidateProfile(uint256 _tokenId) external view returns (CandidateProfile memory) {
        Candidacy memory candidacy = candidacies[_tokenId];

        uint256 attestationCount = identityRegistry.getActiveAttestationCount(candidacy.candidate);

        return CandidateProfile({
            tokenId: _tokenId,
            candidate: candidacy.candidate,
            electionId: candidacy.electionId,
            isActive: candidacy.isActive,
            platformIPFS: candidacy.platformIPFS,
            platformSummary: candidacy.platformSummary,
            tags: candidacy.tags,
            mintedAt: candidacy.mintedAt,
            attestationCount: attestationCount
        });
    }

    // Batch get candidate profiles for efficient frontend loading
    function getBatchCandidateProfiles(uint256[] calldata _tokenIds)
        external
        view
        returns (CandidateProfile[] memory)
    {
        uint256 length = _tokenIds.length;
        CandidateProfile[] memory profiles = new CandidateProfile[](length);

        for (uint256 i = 0; i < length;) {
            uint256 tokenId = _tokenIds[i];
            Candidacy memory candidacy = candidacies[tokenId];

            uint256 attestationCount = identityRegistry.getActiveAttestationCount(candidacy.candidate);

            profiles[i] = CandidateProfile({
                tokenId: tokenId,
                candidate: candidacy.candidate,
                electionId: candidacy.electionId,
                isActive: candidacy.isActive,
                platformIPFS: candidacy.platformIPFS,
                platformSummary: candidacy.platformSummary,
                tags: candidacy.tags,
                mintedAt: candidacy.mintedAt,
                attestationCount: attestationCount
            });

            unchecked {
                ++i;
            }
        }

        return profiles;
    }

    function getIPFSURI(uint256 _tokenId) external view returns (string memory) {
        return tokenURI(_tokenId);
    }

    function getIPFSCID(uint256 _tokenId) external view returns (string memory) {
        return candidacies[_tokenId].platformIPFS;
    }

    /////////////////////////
    // INTERNAL FUNCTIONS  //
    /////////////////////////

    function _extractCID(string memory _input) internal pure returns (string memory) {
        bytes memory inputBytes = bytes(_input);

        if (
            inputBytes.length > 7 && inputBytes[0] == "i" && inputBytes[1] == "p" && inputBytes[2] == "f"
                && inputBytes[3] == "s" && inputBytes[4] == ":" && inputBytes[5] == "/" && inputBytes[6] == "/"
        ) {
            return _substring(_input, 7, inputBytes.length);
        }

        return _input;
    }

    function _isValidIPFSCID(string memory _cid) internal pure returns (bool) {
        bytes memory cidBytes = bytes(_cid);
        uint256 len = cidBytes.length;

        if (len == 46 && cidBytes[0] == "Q" && cidBytes[1] == "m") {
            return true;
        }

        if (len >= 46 && len <= 60) {
            if (
                cidBytes[0] == "b" && cidBytes[1] == "a" && cidBytes[2] == "f"
                    && (cidBytes[3] == "y" || cidBytes[3] == "k")
            ) {
                return true;
            }
        }

        return false;
    }

    function _substring(string memory _str, uint256 _startIndex, uint256 _endIndex)
        internal
        pure
        returns (string memory)
    {
        bytes memory strBytes = bytes(_str);
        bytes memory result = new bytes(_endIndex - _startIndex);

        for (uint256 i = _startIndex; i < _endIndex; i++) {
            result[i - _startIndex] = strBytes[i];
        }

        return string(result);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
