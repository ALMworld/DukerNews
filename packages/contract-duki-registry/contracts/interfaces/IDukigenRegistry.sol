// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { AgentRecord } from "./IDukigenTypes.sol";

/// @title IDukigenRegistry
/// @notice External interface for dApps to query the agent registry and process payments.
interface IDukigenRegistry {
    /// @notice Check if an agentId is registered.
    function isRegistered(uint256 agentId) external view returns (bool);

    /// @notice Get the agent record for an agentId.
    function getAgent(uint256 agentId) external view returns (AgentRecord memory);

    /// @notice Get the agentId for a given agent name, or 0 if not found.
    function nameToAgentId(string calldata name) external view returns (uint256);

    /// @notice Get on-chain metadata for an agent.
    function getMetadata(uint256 agentId, string calldata metadataKey)
        external view returns (bytes memory);

    /// @notice Get the agent's wallet address (defaults to owner if not set).
    function getAgentWallet(uint256 agentId) external view returns (address);

    /// @notice Total number of registered agents.
    function totalAgents() external view returns (uint256);

    /// @notice Pay an agent using the agent's default dukiBps.
    function pay(uint256 agentId, uint256 amount) external;

    /// @notice Pay an agent with a custom dukiBps (within agent's allowed range).
    function pay(uint256 agentId, uint256 amount, uint16 dukiBps) external;
}
