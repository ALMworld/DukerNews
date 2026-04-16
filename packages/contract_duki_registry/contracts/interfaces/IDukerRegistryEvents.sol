// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title IDukerRegistryEvents
/// @notice Events emitted by DukerRegistry.
interface IDukerRegistryEvents {
    /// @notice Emitted when a new username identity NFT is minted on the origin chain.
    event UserMinted(
        address indexed user,
        uint256 indexed tokenId,
        string displayName,
        uint32 originChainEid
    );

    /// @notice Emitted when a user replicates their identity to another chain.
    ///         Emitted on the SOURCE chain. toAddress is always msg.sender.
    event IdentityReplicateSent(
        address indexed user,
        uint256 indexed tokenId,
        uint32 dstChainEid
    );

    /// @notice Emitted when a replicated identity arrives on a new chain.
    ///         Emitted on the DESTINATION chain.
    event IdentityReplicateReceived(
        address indexed user,
        uint256 indexed tokenId,
        string displayName,
        uint32 originChainEid
    );

    /// @notice Emitted when a user burns their identity on a specific chain.
    event IdentityBurned(
        address indexed user,
        uint256 indexed tokenId,
        uint32 chainEid
    );

    /// @notice Emitted when a replica is stored as pending (cross-address replication).
    ///         The recipient must call claimReplica() to accept.
    event ReplicaPending(
        address indexed toAddress,
        uint256 indexed tokenId,
        string displayName,
        uint32 originChainEid
    );

    /// @notice Emitted when a recipient rejects a pending replica.
    event ReplicaRejected(
        address indexed user,
        uint256 indexed tokenId
    );
}
