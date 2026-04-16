// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title IDukerRegistryEvents
/// @notice Events emitted by DukerRegistry.
///         Uses a unified DukerEvent log (matching DukigenRegistry pattern)
///         with `username` as a common field on every event.
interface IDukerRegistryEvents {

    // ══════════════════════════════════════════════════════════════════════════
    //  EVENT TYPE ENUM
    // ══════════════════════════════════════════════════════════════════════════

    enum DukerEventType {
        USER_MINTED,                           // 0
        IDENTITY_REPLICATE_SENT,               // 1
        IDENTITY_BURNED,                       // 2
        IDENTITY_REPLICATE_RECEIVED_PENDING,   // 3 — cross-address, needs manual claim
        IDENTITY_REPLICATE_RECEIVED_CLAIMED,   // 4 — auto-minted (same addr) or manually claimed
        IDENTITY_REPLICATE_RECEIVED_REJECTED   // 5 — conflict (see RejectReason)
    }

    enum RejectReason {
        ALREADY_REPLICATED,           // 0 — token already exists on this chain
        ALREADY_HAS_IDENTITY,         // 1 — recipient already owns a different identity
        USER_REJECTED                 // 2 — recipient explicitly rejected via rejectReplica()
    }

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

    /// @notice Data for IDENTITY_REPLICATE_SENT
    struct IdentityReplicateSentData {
        uint32 dstChainEid;
    }

    /// @notice Data for IDENTITY_BURNED
    struct IdentityBurnedData {
        uint32 chainEid;
    }

    /// @notice Data for REPLICA_REJECTED
    struct ReplicaRejectedData {
        RejectReason reason;
    }

    // Note: USER_MINTED, IDENTITY_REPLICATE_RECEIVED, REPLICA_PENDING,
    //       REPLICA_CLAIMED carry no extra data beyond the common fields.

    // ── ABI Helpers — expose struct types for wagmi/viem codegen ─────────────

    error _ABI_IdentityReplicateSentData(IdentityReplicateSentData data);
    error _ABI_IdentityBurnedData(IdentityBurnedData data);
    error _ABI_ReplicaRejectedData(ReplicaRejectedData data);
}
