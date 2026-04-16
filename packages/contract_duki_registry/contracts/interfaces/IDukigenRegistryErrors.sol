// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title IDukigenRegistryErrors
/// @notice Custom errors for DukigenRegistry.
interface IDukigenRegistryErrors {
    error AgentNameTaken(string name);
    error AgentNameEmpty();
    error NotAgentOwner(uint256 agentId);
    error AgentNotFound(uint256 agentId);
    error ReservedMetadataKey(string key);
    error DukiBpsOutOfRange(uint16 dukiBps, uint16 min, uint16 max);
    error InvalidDukiBpsConfig(uint16 min, uint16 max, uint16 defaultBps);
    error InvalidAgentName();
    error PaymentAmountZero();
    error TransferFailed();
    error InvalidSignature();
    error SignatureExpired();
}
