// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title DukerRegistryTokenId
/// @notice Bit-packing helpers for DukerRegistry tokenIds.
///
///         tokenId layout (uint256):
///         ┌────────────────────────────────────────┬──────────────────────┐
///         │ Bits 255..32 (224b)                    │ Bits 31..0 (32b)     │
///         │ localSequence                          │ originChainEid       │
///         └────────────────────────────────────────┴──────────────────────┘
///
///         Placing the sequence in the high bits keeps tokenIds small and
///         human-readable when sequence numbers are low (e.g. seq=1, eid=31337
///         → tokenId = 4294998633 instead of 8.4e+68).
///
///         This guarantees globally unique, collision-free tokenIds
///         across all chains without any cross-chain coordination.
library DukerRegistryTokenId {
    /// @notice Construct a tokenId from chain EID and local sequence.
    function make(uint32 chainEid, uint224 seq) internal pure returns (uint256) {
        return (uint256(seq) << 32) | uint256(chainEid);
    }

    /// @notice Extract the origin chain EID from a tokenId (lower 32 bits).
    function originChainOf(uint256 tokenId) internal pure returns (uint32) {
        return uint32(tokenId);
    }

    /// @notice Extract the local sequence from a tokenId (upper 224 bits).
    function sequenceOf(uint256 tokenId) internal pure returns (uint224) {
        return uint224(tokenId >> 32);
    }
}
