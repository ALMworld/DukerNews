// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IDukerNewsErrors
/// @notice Custom errors for DukerNews — saves gas vs require(string).
interface IDukerNewsErrors {
    error NoUsername();
    error ZeroAddress();
    error CooldownActive(uint256 until);
    error PaymentAlreadyProcessed(bytes32 txHash);
    error TransferFailed();
    error NotAggOwner(uint8 aggType, uint64 aggId);
    error AmendWindowClosed(uint8 aggType, uint64 aggId);
    error CommentWindowClosed(uint64 parentAggId);
    error AmountBelowMinFee(uint256 amount, uint256 minFee);
}
