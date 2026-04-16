// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title IDukigenRegistryEvents
/// @notice Events emitted by DukigenRegistry.
///         Includes ERC-8004 standard events + DUKIGEN-specific extensions.
interface IDukigenRegistryEvents {
    // ── ERC-8004 Standard Events ────────────────────────────────────────────

    /// @notice ERC-8004: Emitted when a new agent is registered.
    event Registered(
        uint256 indexed agentId,
        string agentURI,
        address indexed owner
    );

    /// @notice ERC-8004: Emitted when an agent's URI is updated.
    event URIUpdated(
        uint256 indexed agentId,
        string newURI,
        address indexed updatedBy
    );

    /// @notice ERC-8004: Emitted when on-chain metadata is set.
    event MetadataSet(
        uint256 indexed agentId,
        string indexed indexedMetadataKey,
        string metadataKey,
        bytes metadataValue
    );

    // ── DUKIGEN Extension Events ────────────────────────────────────────────

    /// @notice Emitted when a payment is processed through the registry.
    event PaymentProcessed(
        uint256 indexed agentId,
        address indexed payer,
        uint256 totalAmount,
        uint256 dukiAmount,
        uint256 agentAmount,
        uint16 dukiBps
    );
}
