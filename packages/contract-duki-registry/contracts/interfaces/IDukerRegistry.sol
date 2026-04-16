// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { DukerIdentity } from "./IDukerRegistryTypes.sol";

/// @title IDukerRegistry
/// @notice External interface for dApps to resolve user identity.
///         Import this in DukerNews and future dApps.
interface IDukerRegistry {
    /// @notice Returns the tokenId owned by `owner`, or 0 if none.
    function ownerToTokenId(address owner) external view returns (uint256);

    /// @notice Returns the full identity record for a tokenId.
    function getIdentity(uint256 tokenId) external view returns (DukerIdentity memory);

    /// @notice Returns the display name for the given owner, or "" if none.
    function displayNameOf(address owner) external view returns (string memory);

    /// @notice Returns the full ID "displayName@originChainEid" for the given owner.
    function fullIdOf(address owner) external view returns (string memory);

    /// @notice ERC721 ownerOf — returns the owner of a tokenId.
    function ownerOf(uint256 tokenId) external view returns (address);

    /// @notice Extract origin chain EID from a tokenId (upper 32 bits).
    function originChainOf(uint256 tokenId) external pure returns (uint32);

    /// @notice Extract local sequence from a tokenId (lower 224 bits).
    function sequenceOf(uint256 tokenId) external pure returns (uint224);
}
