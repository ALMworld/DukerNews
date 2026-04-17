// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { IDukerRegistryEnums } from "./IDukerRegistryEnums.sol";

/// @title IDukerRegistryEvents
/// @notice Events emitted by DukerRegistry.
///         Uses a unified DukerEvent log (matching DukigenRegistry pattern)
///         with `username` as a common field on every event.
///         Enums are inherited from IDukerRegistryEnums (auto-generated from proto).
interface IDukerRegistryEvents is IDukerRegistryEnums {

    // ══════════════════════════════════════════════════════════════════════════
    //  UNIFIED EVENT LOG — DukerEvent (indexed by off-chain services)
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Universal event — all DukerRegistry mutations emit this.
    ///         Every mutation increments evtSeq (global monotonic counter).
    ///
    /// @param tokenId    The NFT token ID (indexed — primary entity key)
    /// @param evtSeq     Global event sequence (indexed, monotonic)
    /// @param eventType  What happened (DukerEventType enum)
    /// @param ego        Actor's wallet address (who triggered the mutation)
    /// @param username   The identity username (e.g. "alice.30184") — common to all events
    /// @param evtTime    Block timestamp
    /// @param eventData  ABI-encoded event-specific data (see structs below)
    event DukerEvent(
        uint256         indexed tokenId,
        uint64          indexed evtSeq,
        DukerEventType  eventType,
        address         ego,
        string          username,
        uint64          evtTime,
        bytes           eventData
    );

    // ══════════════════════════════════════════════════════════════════════════
    //  EVENT DATA STRUCTS — ABI-encoded in DukerEvent.eventData
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Data for USER_MINTED (eventType=1)
    ///         Carries the user's initial preferences + optional payment info.
    struct UserMintedData {
        uint16 preferDukiBps;       // Preferred DUKI bps for DukerRegistry agent (0 = agent default)
        uint256 dukigenTokenId;     // DukerRegistry's selfAgentId in DukigenRegistry
        uint256 experienceAmount;   // Stablecoin amount paid (0 = free mint)
        address stableCoinAddress;  // ERC-20 used for payment (address(0) = no payment)
    }

    /// @notice Data for IDENTITY_REPLICATE_SENT (eventType=2)
    struct IdentityReplicateSentData {
        uint32 dstChainEid;
    }

    /// @notice Data for IDENTITY_BURNED (eventType=3)
    struct IdentityBurnedData {
        uint32 chainEid;
    }

    /// @notice Data for REPLICA_REJECTED (eventType=6)
    struct ReplicaRejectedData {
        RejectReason reason;
    }

    /// @notice Data for IDENTITY_PREFERENCES_SET (eventType=7)
    ///         Emitted when user updates their per-agent DUKI bps preference.
    struct PreferencesSetData {
        uint256 dukigenAgentId;    // DukigenRegistry agent this preference is for
        uint16 preferDukiBps;     // Updated DUKI distribution bps
    }

    // Note: IDENTITY_REPLICATE_RECEIVED_PENDING (4), IDENTITY_REPLICATE_RECEIVED_CLAIMED (5)
    //       carry no extra data beyond the common event fields.

    // ── ABI Helpers — expose struct types for wagmi/viem codegen ─────────────

    error _ABI_UserMintedData(UserMintedData data);
    error _ABI_IdentityReplicateSentData(IdentityReplicateSentData data);
    error _ABI_IdentityBurnedData(IdentityBurnedData data);
    error _ABI_ReplicaRejectedData(ReplicaRejectedData data);
    error _ABI_PreferencesSetData(PreferencesSetData data);
}
