// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title IDukerRegistryErrors
/// @notice Custom errors for DukerRegistry.
interface IDukerRegistryErrors {
    error InvalidName();
    error NameTaken(string name);
    error ZeroAddress();
    error NoIdentity();
    error NotTokenOwner(uint256 tokenId);
    error NonexistentToken(uint256 tokenId);
    error SoulboundToken();
    error AlreadyHasIdentity();
    error AlreadyReplicatedHere(uint256 tokenId);
    error NoPendingReplica(uint256 tokenId);
    error InvalidDukigenAgent(uint256 agentId);
}
