// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @notice Minimal interface for AlmWorldDukiMinter — used by DukerNews.
interface IAlmWorldDukiMinter {
    /// @notice Mint DUKI + ALM by depositing stablecoin. ALM split 50/50 to yang & yin.
    /// @param token The stablecoin address.
    /// @param yangReceiver The active party — receives half of ALM.
    /// @param yinReceiver The passive party — receives the other half of ALM.
    /// @param amount Stablecoin amount in native decimals.
    function mint(address token, address yangReceiver, address yinReceiver, uint256 amount) external;
}
