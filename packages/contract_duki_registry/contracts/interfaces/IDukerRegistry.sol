// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title IDukerRegistry
/// @notice External interface for dApps to resolve user identity.
///         Import this in DukerNews and future dApps.
interface IDukerRegistry {
    /// @notice Returns the tokenId owned by `owner`, or 0 if none.
    function ownerToTokenId(address owner) external view returns (uint256);

    /// @notice Returns the username for a tokenId (e.g. "alice.30184").
    function getUsername(uint256 tokenId) external view returns (string memory);

    /// @notice Returns the username (e.g. "alice.30184") for the given owner, or "" if none.
    function usernameOf(address owner) external view returns (string memory);

    /// @notice ERC721 ownerOf — returns the owner of a tokenId.
    function ownerOf(uint256 tokenId) external view returns (address);

    /// @notice Extract origin chain EID from a tokenId (upper 32 bits).
    function originChainOf(uint256 tokenId) external pure returns (uint32);

    /// @notice Extract local sequence from a tokenId (lower 224 bits).
    function sequenceOf(uint256 tokenId) external pure returns (uint224);
}
