// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { OApp, Origin, MessagingFee, MessagingReceipt } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { OptionsBuilder } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";


import { IDukerRegistryEvents } from "./interfaces/IDukerRegistryEvents.sol";
import { IDukerRegistryErrors } from "./interfaces/IDukerRegistryErrors.sol";
import { DukerRegistryTokenId } from "./libraries/DukerRegistryTokenId.sol";
import { DukerNameValidator } from "./libraries/DukerNameValidator.sol";

/// @title DukerRegistry
/// @notice Cross-chain universal identity layer for all Duker dApps.
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
contract DukerRegistry is OApp, ERC721, IDukerRegistryEvents, IDukerRegistryErrors {
    using Strings for uint256;
    using OptionsBuilder for bytes;

    // ── Constants ───────────────────────────────────────────────────────────

    /// @dev LZ gas for _lzReceive on destination (identity mint)
    uint128 public constant DST_GAS_LIMIT = 200_000;

    // ── State ───────────────────────────────────────────────────────────────

    /// @notice This chain's LayerZero Endpoint ID (immutable)
    uint32 public immutable localChainEid;

    /// @notice Auto-incrementing local sequence (lower 224 bits of tokenId)
    uint224 private _nextLocalSeq;

    /// @notice Global event sequence counter (monotonic)
    uint64 private _evtSeq;

    /// @notice tokenId → username (e.g. "alice.30184")
    mapping(uint256 => string) private _usernames;

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

    // ── Constructor ─────────────────────────────────────────────────────────

    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _delegate,
        uint32 _localChainEid
    ) OApp(_lzEndpoint, _delegate) ERC721(_name, _symbol) Ownable(_delegate) {
        localChainEid = _localChainEid;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SOULBOUND — block all transfers
    // ══════════════════════════════════════════════════════════════════════════

    /// @dev Override ERC721 _update to make tokens non-transferable (soulbound).
    ///      Only allows mint (from == 0) and burn (to == 0).
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert SoulboundToken();
        return super._update(to, tokenId, auth);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  MINT — create identity on THIS chain (origin)
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Mint a unique username identity NFT on this chain.
    //          displayName must be unique on this chain. Dot and at-sign are forbidden.
    //          username = displayName.originChainEid (e.g., "alice.30184")
    /// @param displayName Desired display name (e.g., "alice").
    function mintUsername(string calldata displayName) external {
        if (ownerToTokenId[msg.sender] != 0) revert AlreadyHasIdentity();
        DukerNameValidator.validate(displayName);
        if (nameToId[displayName] != 0) revert NameTaken(displayName);

        uint224 seq = ++_nextLocalSeq;
        uint256 tokenId = DukerRegistryTokenId.make(localChainEid, seq);

        // Concatenate username: "alice" + "." + "30184"
        string memory username = string.concat(displayName, ".", uint256(localChainEid).toString());

        _mint(msg.sender, tokenId);

        nameToId[displayName] = tokenId;
        ownerToTokenId[msg.sender] = tokenId;

        _usernames[tokenId] = username;

        _emitEvent(tokenId, DukerEventType.USER_MINTED, msg.sender, username, "");
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
        _emitEvent(tokenId, DukerEventType.IDENTITY_REPLICATE_SENT, msg.sender, username,
            abi.encode(IdentityReplicateSentData({ dstChainEid: dstEid })));
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
    function _buildReplicatePayload(bytes32 sender, bytes32 toAddress, uint256 tokenId) internal view returns (bytes memory) {
        return abi.encode(sender, toAddress, tokenId, _usernames[tokenId]);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  RECEIVE — handle replicated identity from another chain
    // ══════════════════════════════════════════════════════════════════════════

    /// @dev Called by LayerZero when a replicated identity arrives.
    ///      If sender == recipient → auto-mint (safe, same person).
    ///      If sender != recipient → store as pending claim (prevents injection).
    function _lzReceive(
        Origin calldata /*_origin*/,
        bytes32 /*_guid*/,
        bytes calldata _message,
        address /*_executor*/,
        bytes calldata /*_extraData*/
    ) internal override {
        (
            bytes32 senderBytes,
            bytes32 toAddressBytes,
            uint256 tokenId,
            string memory username
        ) = abi.decode(_message, (bytes32, bytes32, uint256, string));

        address toAddress = address(uint160(uint256(toAddressBytes)));

        // Reject if token already exists on this chain
        if (_ownerOf(tokenId) != address(0)) {
            _emitEvent(tokenId, DukerEventType.IDENTITY_REPLICATE_RECEIVED_REJECTED, toAddress, username,
                abi.encode(ReplicaRejectedData({ reason: RejectReason.ALREADY_REPLICATED })));
            return;
        }

        // Reject if recipient already has an identity (one address = one identity)
        if (ownerToTokenId[toAddress] != 0) {
            _emitEvent(tokenId, DukerEventType.IDENTITY_REPLICATE_RECEIVED_REJECTED, toAddress, username,
                abi.encode(ReplicaRejectedData({ reason: RejectReason.ALREADY_HAS_IDENTITY })));
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

        _emitEvent(tokenId, DukerEventType.IDENTITY_REPLICATE_RECEIVED_REJECTED, msg.sender, username,
            abi.encode(ReplicaRejectedData({ reason: RejectReason.USER_REJECTED })));
    }

    /// @dev Shared mint logic for replicas (used by auto-mint and claim).
    function _mintReplica(
        address toAddress,
        uint256 tokenId,
        string memory username
    ) internal {
        _mint(toAddress, tokenId);
        ownerToTokenId[toAddress] = tokenId;

        _usernames[tokenId] = username;

        _emitEvent(tokenId, DukerEventType.IDENTITY_REPLICATE_RECEIVED_CLAIMED, toAddress, username, "");
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

        _emitEvent(tokenId, DukerEventType.IDENTITY_BURNED, msg.sender, username,
            abi.encode(IdentityBurnedData({ chainEid: localChainEid })));
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
