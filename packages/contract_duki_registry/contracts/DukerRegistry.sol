// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {OAppUpgradeable, Origin, MessagingFee, MessagingReceipt} from "@layerzerolabs/oapp-evm-upgradeable/contracts/oapp/OAppUpgradeable.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";

import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {IDukerRegistryEvents} from "./interfaces/IDukerRegistryEvents.sol";
import {IDukerRegistryErrors} from "./interfaces/IDukerRegistryErrors.sol";
import {DukerRegistryTokenId} from "./libraries/DukerRegistryTokenId.sol";
import {DukerNameValidator} from "./libraries/DukerNameValidator.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal interface for DukigenRegistry — used to validate agents + route payments.
interface IDukigenRegistry {
    function isRegistered(uint256 agentId) external view returns (bool);
    function payTo(uint256 agentId, uint256 amount, uint16 userPreferDukiBps, address payer, address stableCoinAddress)
        external;
}

/// @title DukerRegistry
/// @notice Cross-chain universal identity layer for all Duker dApps (UUPS-upgradeable).
//
//          Identity model (using "." separator):
//            displayName = "alice"              (user-chosen, unique per origin chain)
//            username    = "alice.30184"         (globally unique, stored as identity)
//            tokenId     = 30184<<224 | seq     (on-chain unique ID)
//
//          The NFT is SOULBOUND (non-transferable). Users can:
//            - mintUsername()    → create identity on this chain (origin)
//            - replicateTo()    → mint same identity on another chain
//            - burn()           → deactivate identity on this chain
//
//          The same identity can exist on MULTIPLE chains simultaneously.
//          Dot and at-sign are forbidden in displayName — reserved as delimiters.
contract DukerRegistry is OAppUpgradeable, ERC721Upgradeable, UUPSUpgradeable, IDukerRegistryEvents, IDukerRegistryErrors {
    using Strings for uint256;
    using OptionsBuilder for bytes;

    // ── Constants ───────────────────────────────────────────────────────────

    /// @dev LZ gas for _lzReceive on destination (identity mint)
    uint128 public constant DST_GAS_LIMIT = 200_000;

    // ── State ───────────────────────────────────────────────────────────────

    /// @notice This chain's LayerZero Endpoint ID
    uint32 public localChainEid;

    /// @notice Auto-incrementing local sequence (lower 224 bits of tokenId)
    uint224 private _nextLocalSeq;

    /// @notice Global event sequence counter (monotonic)
    uint64 private _evtSeq;

    /// @notice tokenId → username (e.g. "alice.30184")
    mapping(uint256 => string) private _usernames;

    /// @notice tokenId → dukigenAgentId → preferred DUKI bps (0–10000)
    ///         Per-agent preference — each user can set a different split for each agent.
    ///         Chain-local, NOT replicated cross-chain.
    mapping(uint256 => mapping(uint256 => uint16)) private _preferDukiBps;

    /// @notice displayName → tokenId (uniqueness per origin chain, only checked at mint)
    mapping(string => uint256) public nameToId;

    /// @notice address → tokenId (O(1) reverse lookup; 0 = no token)
    mapping(address => uint256) public ownerToTokenId;

    /// @notice Pending replica claims (keccak256(toAddress, tokenId) → true).
    ///         When replicateTo() targets a different address, the replica
    ///         is stored here and must be claimed by the recipient.
    struct PendingReplica {
        address toAddress;
        uint256 tokenId;
        string username;
    }
    mapping(bytes32 => PendingReplica) public pendingReplicas;

    // ── DukigenRegistry integration ─────────────────────────────────────────

    /// @notice DukigenRegistry contract (validates agents + routes payments)
    IDukigenRegistry public dukigenRegistry;

    /// @notice DukerRegistry's own agent ID in DukigenRegistry.
    ///         Set by owner after registering DukerRegistry as a Dukigen agent.
    uint256 public selfAgentId;

    /// @notice Precomputed chain suffix for username concatenation (e.g. ".30184").
    ///         Set once in initialize — avoids Strings.toString() on every mint.
    string private _chainSuffix;

    /// @dev Storage gap for future upgrades (50 slots)
    uint256[50] private __gap;

    // ── Constructor (disables initializers on implementation) ────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _lzEndpoint) OAppUpgradeable(_lzEndpoint) {
        _disableInitializers();
    }

    // ── Initializer (proxy calls this once) ─────────────────────────────────

    /// @notice Initialize the contract (called once via proxy).
    /// @param _name           ERC721 token name
    /// @param _symbol         ERC721 token symbol
    /// @param _delegate       Owner / LZ delegate address
    /// @param _localChainEid  This chain's LayerZero Endpoint ID
    /// @param _dukigenRegistry DukigenRegistry contract address
    function initialize(
        string memory _name,
        string memory _symbol,
        address _delegate,
        uint32 _localChainEid,
        address _dukigenRegistry
    ) external initializer {
        __ERC721_init(_name, _symbol);
        __Ownable_init(_delegate);
        __OApp_init(_delegate);

        localChainEid = _localChainEid;
        dukigenRegistry = IDukigenRegistry(_dukigenRegistry);
        _chainSuffix = string.concat(".", uint256(_localChainEid).toString());
    }

    /// @dev Required by UUPS — only the owner can authorize upgrades.
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ══════════════════════════════════════════════════════════════════════════
    //  SOULBOUND — block all transfers
    // ══════════════════════════════════════════════════════════════════════════

    /// @dev Override ERC721 _update to make tokens non-transferable (soulbound).
    ///      Only allows mint (from == 0) and burn (to == 0).
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert SoulboundToken();
        return super._update(to, tokenId, auth);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  MINT — create identity on THIS chain (origin)
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Mint a unique username identity NFT on this chain.
    ///         displayName must be unique on this chain. Dot and at-sign are forbidden.
    ///         username = displayName.originChainEid (e.g., "alice.30184")
    ///
    ///         Optional payment: if experienceAmount > 0, routes payment through
    ///         DukigenRegistry.payTo(selfAgentId, ...) so the user experiences the DUKI split.
    ///
    /// @param displayName        Desired display name (e.g., "alice")
    /// @param preferDukiBps_     Preferred DUKI bps for DukerRegistry agent (0 = agent default)
    /// @param experienceAmount   Stablecoin amount to pay (0 = free mint)
    /// @param stableCoinAddress  ERC-20 stablecoin address (required, must not be address(0))
    function mintUsername(
        string calldata displayName,
        uint16 preferDukiBps_,
        uint256 experienceAmount,
        address stableCoinAddress
    ) external {
        if (ownerToTokenId[msg.sender] != 0) revert AlreadyHasIdentity();
        if (stableCoinAddress == address(0)) revert ZeroAddress();
        // selfAgentId must be configured before minting is allowed
        if (selfAgentId == 0) revert InvalidDukigenAgent(0);

        DukerNameValidator.validate(displayName);
        if (nameToId[displayName] != 0) revert NameTaken(displayName);

        uint224 seq = ++_nextLocalSeq;
        uint256 tokenId = DukerRegistryTokenId.make(localChainEid, seq);

        // Concatenate username: "alice" + ".30184" (suffix precomputed in constructor)
        string memory username = string.concat(displayName, _chainSuffix);

        _mint(msg.sender, tokenId);

        nameToId[displayName] = tokenId;
        ownerToTokenId[msg.sender] = tokenId;
        _usernames[tokenId] = username;

        // Store per-agent preference for DukerRegistry's own agent
        _preferDukiBps[tokenId][selfAgentId] = preferDukiBps_;

        // Optional payment — route through DukigenRegistry.payTo()
        if (experienceAmount > 0) {
            dukigenRegistry.payTo(selfAgentId, experienceAmount, preferDukiBps_, msg.sender, stableCoinAddress);
        }

        _emitEvent(
            tokenId,
            DukerEventType.USER_MINTED,
            msg.sender,
            username,
            abi.encode(
                UserMintedData({
                    preferDukiBps: preferDukiBps_,
                    dukigenTokenId: selfAgentId,
                    experienceAmount: experienceAmount,
                    stableCoinAddress: stableCoinAddress
                })
            )
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  REPLICATE — mint same identity on another chain (user-triggered)
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Replicate your identity to the same address on another chain.
    ///         Safest default — prevents identity injection attacks.
    /// @param dstEid Destination chain (any LZ-supported chain)
    function replicateTo(uint32 dstEid) external payable {
        _replicateTo(dstEid, bytes32(uint256(uint160(msg.sender))));
    }

    /// @notice Replicate your identity to a specific address on another chain.
    ///         Use this for smart contract wallets or non-EVM destinations.
    /// @param dstEid     Destination chain
    /// @param toAddress  Recipient address on destination (bytes32-encoded)
    function replicateTo(uint32 dstEid, bytes32 toAddress) external payable {
        _replicateTo(dstEid, toAddress);
    }

    /// @notice Quote the LZ fee for replicating (same address).
    function quoteReplicate(uint32 dstEid) external view returns (MessagingFee memory) {
        return _quoteReplicate(dstEid, bytes32(uint256(uint160(msg.sender))));
    }

    /// @notice Quote the LZ fee for replicating (custom address).
    function quoteReplicate(uint32 dstEid, bytes32 toAddress) external view returns (MessagingFee memory) {
        return _quoteReplicate(dstEid, toAddress);
    }

    /// @dev Shared implementation for both replicateTo overloads.
    function _replicateTo(uint32 dstEid, bytes32 toAddress) internal {
        uint256 tokenId = ownerToTokenId[msg.sender];
        if (tokenId == 0) revert NoIdentity();

        bytes32 senderBytes = bytes32(uint256(uint160(msg.sender)));
        bytes memory payload = _buildReplicatePayload(senderBytes, toAddress, tokenId);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(DST_GAS_LIMIT, 0);

        _lzSend(dstEid, payload, options, MessagingFee(msg.value, 0), payable(msg.sender));

        string memory username = _usernames[tokenId];
        _emitEvent(
            tokenId,
            DukerEventType.IDENTITY_REPLICATE_SENT,
            msg.sender,
            username,
            abi.encode(IdentityReplicateSentData({dstChainEid: dstEid}))
        );
    }

    /// @dev Shared implementation for both quoteReplicate overloads.
    function _quoteReplicate(uint32 dstEid, bytes32 toAddress) internal view returns (MessagingFee memory) {
        uint256 tokenId = ownerToTokenId[msg.sender];
        if (tokenId == 0) revert NoIdentity();

        bytes32 senderBytes = bytes32(uint256(uint160(msg.sender)));
        bytes memory payload = _buildReplicatePayload(senderBytes, toAddress, tokenId);
        bytes memory options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(DST_GAS_LIMIT, 0);

        return _quote(dstEid, payload, options, false);
    }

    /// @dev Encode identity payload for cross-chain replication.
    ///      Sends the pre-concatenated username (e.g. "alice.30184").
    function _buildReplicatePayload(bytes32 sender, bytes32 toAddress, uint256 tokenId)
        internal
        view
        returns (bytes memory)
    {
        return abi.encode(sender, toAddress, tokenId, _usernames[tokenId]);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  RECEIVE — handle replicated identity from another chain
    // ══════════════════════════════════════════════════════════════════════════

    /// @dev Called by LayerZero when a replicated identity arrives.
    ///      If sender == recipient → auto-mint (safe, same person).
    ///      If sender != recipient → store as pending claim (prevents injection).
    function _lzReceive(
        Origin calldata,
        /*_origin*/
        bytes32,
        /*_guid*/
        bytes calldata _message,
        address,
        /*_executor*/
        bytes calldata /*_extraData*/
    )
        internal
        override
    {
        (bytes32 senderBytes, bytes32 toAddressBytes, uint256 tokenId, string memory username) =
            abi.decode(_message, (bytes32, bytes32, uint256, string));

        address toAddress = address(uint160(uint256(toAddressBytes)));

        // Reject if token already exists on this chain
        if (_ownerOf(tokenId) != address(0)) {
            _emitEvent(
                tokenId,
                DukerEventType.IDENTITY_REPLICATE_RECEIVED_REJECTED,
                toAddress,
                username,
                abi.encode(ReplicaRejectedData({reason: RejectReason.ALREADY_REPLICATED}))
            );
            return;
        }

        // Reject if recipient already has an identity (one address = one identity)
        if (ownerToTokenId[toAddress] != 0) {
            _emitEvent(
                tokenId,
                DukerEventType.IDENTITY_REPLICATE_RECEIVED_REJECTED,
                toAddress,
                username,
                abi.encode(ReplicaRejectedData({reason: RejectReason.ALREADY_HAS_IDENTITY}))
            );
            return;
        }

        if (senderBytes == toAddressBytes) {
            // Same person → auto-mint instantly
            _mintReplica(toAddress, tokenId, username);
        } else {
            // Different address → store as pending, recipient must claim
            bytes32 key = keccak256(abi.encodePacked(toAddress, tokenId));
            pendingReplicas[key] = PendingReplica(toAddress, tokenId, username);

            _emitEvent(tokenId, DukerEventType.IDENTITY_REPLICATE_RECEIVED_PENDING, toAddress, username, "");
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  CLAIM — accept a pending replica sent to your address
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Accept a pending replica that was sent to your address.
    function claimReplica(uint256 tokenId) external {
        bytes32 key = keccak256(abi.encodePacked(msg.sender, tokenId));
        PendingReplica memory pending = pendingReplicas[key];
        if (pending.toAddress == address(0)) revert NoPendingReplica(tokenId);
        if (ownerToTokenId[msg.sender] != 0) revert AlreadyHasIdentity();

        delete pendingReplicas[key];
        _mintReplica(msg.sender, tokenId, pending.username);
    }

    /// @notice Reject a pending replica (anyone can clean up their own pending).
    function rejectReplica(uint256 tokenId) external {
        bytes32 key = keccak256(abi.encodePacked(msg.sender, tokenId));
        PendingReplica storage pending = pendingReplicas[key];
        if (pending.toAddress == address(0)) revert NoPendingReplica(tokenId);
        string memory username = pending.username;
        delete pendingReplicas[key];

        _emitEvent(
            tokenId,
            DukerEventType.IDENTITY_REPLICATE_RECEIVED_REJECTED,
            msg.sender,
            username,
            abi.encode(ReplicaRejectedData({reason: RejectReason.USER_REJECTED}))
        );
    }

    /// @dev Shared mint logic for replicas (used by auto-mint and claim).
    function _mintReplica(address toAddress, uint256 tokenId, string memory username) internal {
        _mint(toAddress, tokenId);
        ownerToTokenId[toAddress] = tokenId;

        _usernames[tokenId] = username;

        _emitEvent(tokenId, DukerEventType.IDENTITY_REPLICATE_RECEIVED_CLAIMED, toAddress, username, "");
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  PREFERENCES — update per-agent DUKI bps preferences
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Set your preferred DUKI bps for a specific Dukigen agent.
    ///         Chain-local, NOT replicated cross-chain.
    /// @param dukigenAgentId   DukigenRegistry agent token ID to set preference for
    /// @param preferDukiBps_   Preferred DUKI distribution bps (0–10000, 0 = use agent default)
    function setPreference(uint256 dukigenAgentId, uint16 preferDukiBps_) external {
        uint256 tokenId = ownerToTokenId[msg.sender];
        if (tokenId == 0) revert NoIdentity();
        // Validate agent exists in DukigenRegistry
        if (address(dukigenRegistry) != address(0)) {
            if (!dukigenRegistry.isRegistered(dukigenAgentId)) revert InvalidDukigenAgent(dukigenAgentId);
        }

        _preferDukiBps[tokenId][dukigenAgentId] = preferDukiBps_;

        string memory username = _usernames[tokenId];
        _emitEvent(
            tokenId,
            DukerEventType.IDENTITY_PREFERENCES_SET,
            msg.sender,
            username,
            abi.encode(PreferencesSetData({dukigenAgentId: dukigenAgentId, preferDukiBps: preferDukiBps_}))
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  BURN — deactivate identity on THIS chain
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Burn your identity NFT on this chain.
    ///         The identity can still exist on other chains.
    function burn() external {
        uint256 tokenId = ownerToTokenId[msg.sender];
        if (tokenId == 0) revert NoIdentity();

        string memory username = _usernames[tokenId];

        delete ownerToTokenId[msg.sender];
        _burn(tokenId);

        _emitEvent(
            tokenId,
            DukerEventType.IDENTITY_BURNED,
            msg.sender,
            username,
            abi.encode(IdentityBurnedData({chainEid: localChainEid}))
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  PUBLIC VIEW
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Returns the username for a tokenId.
    function getUsername(uint256 tokenId) external view returns (string memory) {
        return _usernames[tokenId];
    }

    /// @notice Returns the username (e.g. "alice.30184") for the given owner, or "" if none.
    function usernameOf(address owner) external view returns (string memory) {
        uint256 tokenId = ownerToTokenId[owner];
        if (tokenId == 0) return "";
        return _usernames[tokenId];
    }

    /// @notice Returns the user's preferred DUKI bps for a specific agent.
    /// @param owner           Wallet address
    /// @param dukigenAgentId  DukigenRegistry agent token ID
    /// @return preferDukiBps  Preferred DUKI bps (0 = use agent default)
    function preferenceOf(address owner, uint256 dukigenAgentId) external view returns (uint16) {
        uint256 tokenId = ownerToTokenId[owner];
        if (tokenId == 0) return 0;
        return _preferDukiBps[tokenId][dukigenAgentId];
    }

    /// @notice Extract origin chain EID from a tokenId (upper 32 bits).
    function originChainOf(uint256 tokenId) external pure returns (uint32) {
        return DukerRegistryTokenId.originChainOf(tokenId);
    }

    /// @notice Extract local sequence from a tokenId (lower 224 bits).
    function sequenceOf(uint256 tokenId) external pure returns (uint224) {
        return DukerRegistryTokenId.sequenceOf(tokenId);
    }

    /// @notice Returns the tokenId for the given owner, or 0 if none.
    function tokenOfOwner(address owner) external view returns (uint256) {
        return ownerToTokenId[owner];
    }

    /// @notice Current global event sequence number.
    function worldEvtSeq() external view returns (uint64) {
        return _evtSeq;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  OWNER ADMIN
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Set DukerRegistry's own agent ID in DukigenRegistry.
    ///         Must be called after registering DukerRegistry as a Dukigen agent.
    function setSelfAgentId(uint256 _selfAgentId) external onlyOwner {
        selfAgentId = _selfAgentId;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  INTERNAL
    // ══════════════════════════════════════════════════════════════════════════

    /// @dev Emit the unified DukerEvent with auto-incrementing evtSeq.
    function _emitEvent(
        uint256 tokenId,
        DukerEventType eventType,
        address ego,
        string memory username,
        bytes memory eventData
    ) internal {
        uint64 seq = ++_evtSeq;
        emit DukerEvent(tokenId, seq, eventType, ego, username, uint64(block.timestamp), eventData);
    }
}
