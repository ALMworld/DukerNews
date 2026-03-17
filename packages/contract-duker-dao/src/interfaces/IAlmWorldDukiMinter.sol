// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @notice Minimal interface for AlmWorldDukiMinter — used by DukerNews.
interface IAlmWorldDukiMinter {
    /// @notice Mint DUKI + ALM by depositing stablecoin. ALM split 50/50 to yin & yang.
    /// @param token The stablecoin address.
    /// @param yinReceiver Receives half of ALM.
    /// @param yangReceiver Receives the other half of ALM.
    /// @param amount Stablecoin amount in native decimals.
    function mint(address token, address yinReceiver, address yangReceiver, uint256 amount) external;
}
