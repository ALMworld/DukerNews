// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title DukerRegistryTokenId
/// @notice Bit-packing helpers for DukerRegistry tokenIds.
///
///         tokenId layout (uint256):
///         ┌──────────────────────┬────────────────────────────────────────┐
///         │ Bits 255..224 (32b)  │ Bits 223..0 (224b)                    │
///         │ originChainEid       │ localSequence                          │
///         └──────────────────────┴────────────────────────────────────────┘
///
///         This guarantees globally unique, collision-free tokenIds
///         across all chains without any cross-chain coordination.
library DukerRegistryTokenId {
    /// @notice Construct a tokenId from chain EID and local sequence.
    function make(uint32 chainEid, uint224 seq) internal pure returns (uint256) {
        return (uint256(chainEid) << 224) | uint256(seq);
    }

    /// @notice Extract the origin chain EID from a tokenId (upper 32 bits).
    function originChainOf(uint256 tokenId) internal pure returns (uint32) {
        return uint32(tokenId >> 224);
    }

    /// @notice Extract the local sequence from a tokenId (lower 224 bits).
    function sequenceOf(uint256 tokenId) internal pure returns (uint224) {
        return uint224(tokenId);
    }
}
