// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Per-user NFT metadata (packed into 1 storage slot + string)
struct UserData {
    uint16 dukiBps; // 2 bytes  — basis points 0-10000, set at mint
    uint64 userSeq; // 8 bytes  — incremented on every mutation
    uint128 amount; // 16 bytes — cumulative USDT (6 decimals)
    // ── 26 bytes total → packed into 1 storage slot ──
    string userName; // separate slot(s), set at mint
}

/// @notice Per-aggregate metadata (1 storage slot)
struct AggData {
    address creator; // 20 bytes ┐ 1 storage slot (28/32 bytes)
    uint64 createdAt; // 8 bytes  ┘
}
