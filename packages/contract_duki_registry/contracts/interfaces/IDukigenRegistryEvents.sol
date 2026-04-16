// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { ProductType, DukiType } from "./IDukigenTypes.sol";

/// @title IDukigenRegistryEvents
/// @notice Events emitted by DukigenRegistry.
///         Includes ERC-8004 standard events (for compliance) + the unified
///         DukigenEvent log (for indexing). Both are emitted on every mutation.
interface IDukigenRegistryEvents {

    // ══════════════════════════════════════════════════════════════════════════
    //  UNIFIED EVENT LOG — DukigenEvent (indexed by off-chain services)
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Universal event — all DukigenRegistry mutations emit this.
    ///         Every mutation increments evtSeq (global monotonic counter).
    ///
    ///         Event types:
    ///           1 = AGENT_REGISTERED
    ///           2 = AGENT_URI_UPDATED
    ///           3 = AGENT_DUKI_BPS_SET
    ///           4 = AGENT_WORKS_DATA_SET
    ///           5 = AGENT_METADATA_SET
    ///           6 = AGENT_WALLET_SET
    ///           7 = AGENT_WALLET_UNSET
    ///           8 = PAYMENT_PROCESSED
    ///
    /// @param agentId    The NFT token ID (indexed — primary entity key)
    /// @param evtSeq     Global event sequence (indexed, monotonic)
    /// @param eventType  What happened (see constants above)
    /// @param ego        Actor's wallet address (who triggered the mutation)
    /// @param evtTime    Block timestamp
    /// @param eventData  ABI-encoded event-specific data (see structs below)
    event DukigenEvent(
        uint256 indexed agentId,
        uint64  indexed evtSeq,
        uint32  eventType,
        address ego,
        uint64  evtTime,
        bytes   eventData
    );

    // ══════════════════════════════════════════════════════════════════════════
    //  ERC-8004 STANDARD EVENTS (kept for compliance)
    // ══════════════════════════════════════════════════════════════════════════

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

    /// @notice Emitted when a payment is processed through the registry.
    event PaymentProcessed(
        uint256 indexed agentId,
        address indexed payer,
        uint256 totalAmount,
        uint256 dukiAmount,
        uint256 agentAmount,
        uint16 dukiBps
    );

    // ══════════════════════════════════════════════════════════════════════════
    //  EVENT DATA STRUCTS — ABI-encoded in DukigenEvent.eventData
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Data for EVT_AGENT_REGISTERED (eventType=1)
    struct AgentRegisteredData {
        string name;
        string agentURI;
    }

    /// @notice Data for EVT_AGENT_URI_UPDATED (eventType=2)
    struct AgentURIUpdatedData {
        string newURI;
    }

    /// @notice Data for EVT_AGENT_DUKI_BPS_SET (eventType=3)
    struct AgentDukiBpsSetData {
        uint16 defaultDukiBps;
        uint16 minDukiBps;
        uint16 maxDukiBps;
    }

    /// @notice Data for EVT_AGENT_WORKS_DATA_SET (eventType=4)
    struct AgentWorksDataSetData {
        ProductType productType;
        DukiType dukiType;
        string pledgeUrl;
        string[] tags;
    }

    /// @notice Data for EVT_AGENT_METADATA_SET (eventType=5)
    struct AgentMetadataSetData {
        string key;
        bytes value;
    }

    /// @notice Data for EVT_AGENT_WALLET_SET (eventType=6)
    struct AgentWalletSetData {
        address newWallet;
    }

    /// @notice Data for EVT_PAYMENT_PROCESSED (eventType=8)
    struct PaymentProcessedData {
        uint256 amount;
        uint256 dukiAmount;
        uint256 agentAmount;
        uint16 dukiBps;
    }

    // ── ABI Helpers — expose struct types for wagmi/viem codegen ─────────────

    error _ABI_AgentRegisteredData(AgentRegisteredData data);
    error _ABI_AgentURIUpdatedData(AgentURIUpdatedData data);
    error _ABI_AgentDukiBpsSetData(AgentDukiBpsSetData data);
    error _ABI_AgentWorksDataSetData(AgentWorksDataSetData data);
    error _ABI_AgentMetadataSetData(AgentMetadataSetData data);
    error _ABI_AgentWalletSetData(AgentWalletSetData data);
    error _ABI_PaymentProcessedData(PaymentProcessedData data);
}
