// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IDukerNewsErrors
/// @notice Custom errors for DukerNews — saves gas vs require(string).
interface IDukerNewsErrors {
    error InvalidName();
    error NameTaken(string name);
    error AmountBelowMinFee(uint256 amount, uint256 minFee);
    error DukiBpsOutOfRange(uint256 dukiBps);
    error ZeroAddress();
    error SameWallet();
    error NoUsername();
    error CooldownActive(uint256 until);
    error NonexistentToken(uint256 tokenId);
    error Soulbound();
    error PaymentAlreadyProcessed(bytes32 txHash);
    error TransferFailed();
    error NotAggOwner(uint8 aggType, uint64 aggId);
    error AmendWindowClosed(uint8 aggType, uint64 aggId);
    error CommentWindowClosed(uint64 parentAggId);
}
