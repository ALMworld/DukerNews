// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { AgentRecord, ProductType, DukiType } from "./IDukigenTypes.sol";

/// @title IDukigenRegistry
/// @notice External interface for dApps to query the agent registry and process payments.
interface IDukigenRegistry {
    /// @notice Check if an agentId is registered.
    function isRegistered(uint256 agentId) external view returns (bool);

    /// @notice Get the agent record for an agentId.
    function getAgent(uint256 agentId) external view returns (AgentRecord memory);

    /// @notice Get the agentId for a given agent name, or 0 if not found.
    function nameToAgentId(string calldata name) external view returns (uint256);

    /// @notice Get the agent's registration URI (ERC-8004: agentURI).
    function agentURI(uint256 agentId) external view returns (string memory);

    /// @notice Get on-chain metadata for an agent.
    function getMetadata(uint256 agentId, string calldata metadataKey)
        external view returns (bytes memory);

    /// @notice Get the agent's wallet address (defaults to owner if not set).
    function getAgentWallet(uint256 agentId) external view returns (address);

    /// @notice Total number of registered agents.
    function totalAgents() external view returns (uint256);

    /// @notice Current global event sequence number.
    function worldEvtSeq() external view returns (uint64);

    /// @notice Pay an agent on behalf of `payer` using a specified stablecoin.
    ///         Payer must have approved this registry for `stableCoinAddress`.
    ///         userPreferDukiBps is clamped to the agent's min/max range.
    function payTo(
        uint256 agentId,
        uint256 amount,
        uint16 userPreferDukiBps,
        address payer,
        address stableCoinAddress
    ) external;

    /// @notice Approve a stablecoin for the minter. Owner only.
    function approveTokenForMinter(address token) external;

    /// @notice Update works metadata fields for an existing agent.
    function setWorksData(
        uint256 agentId,
        ProductType productType,
        DukiType dukiType,
        string calldata pledgeUrl,
        string[] calldata tags
    ) external;
}
