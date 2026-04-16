// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @notice Cross-chain identity record.
///
///         Full ID = displayName + "@" + originChainEid
///         Example: "alice@30184" (globally unique, like email)
///
///         - displayName: unique per origin chain, immutable, '@' forbidden
///         - originChainEid: encoded in tokenId (upper 32 bits), stored for convenience
struct DukerIdentity {
    string displayName; // "alice" — unique per origin chain, immutable
    uint32 originChainEid; // LayerZero EID where first minted (also in tokenId)
}
