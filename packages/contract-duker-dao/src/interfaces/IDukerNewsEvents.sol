// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title IDukerNewsEvents
 * @notice Unified event definitions for DukerNews.
 *         The contract is a transparent event log — eventType is a raw uint32
 *         matching proto EventType enum values, not a Solidity enum.
 */
interface IDukerNewsEvents {
    /// @notice Universal event — all DukerNews actions emit this.
    /// @param ego       The actor's wallet address (indexed for filtering)
    /// @param evtSeq    Global event sequence number (indexed, monotonic)
    /// @param username  The actor's registered username
    /// @param eventType Raw proto EventType value (uint32, e.g. 1=POST_CREATED, 21=USER_MINTED)
    /// @param aggType   Aggregate type: 0=unspecified, 1=user, 2=works
    /// @param aggId     Aggregate ID: post ID, user token ID, etc.
    /// @param evtTime   Block timestamp when event occurred
    /// @param eventData Protobuf-serialized bytes (opaque to contract)
    event DukerEvent(
        address indexed ego,
        uint64 indexed evtSeq,
        string username,
        uint32 eventType,
        uint8 aggType,
        uint64 aggId,
        uint64 evtTime,
        bytes eventData
    );

    /// @notice Data for USERNAME_MINTED event (ABI-encoded by contract)
    struct UsernameMintedData {
        uint256 tokenId;
        string username;
        uint128 amount; // USDT amount in 6-decimal native precision
        uint16 dukiBps; // basis points (0–10000) for platform share
    }

    // ABI helper — gives ethers.js / viem the struct ABI for decoding eventData
    error _ABI_UsernameMintedData(UsernameMintedData data);
}
