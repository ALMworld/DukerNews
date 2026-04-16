// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title IDukigenAware
/// @notice Interface for contracts that delegate payments to DukigenRegistry.
///         Implementing contracts (e.g., DukerNews) have their own agentId
///         and route payments through the registry's payTo() function.
interface IDukigenAware {
    /// @notice The DukigenRegistry this contract delegates payments to.
    function dukigenRegistry() external view returns (address);

    /// @notice This contract's registered agent ID in DukigenRegistry.
    function agentId() external view returns (uint256);
}
