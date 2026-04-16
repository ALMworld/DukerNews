// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IDukerNewsEvents } from "../interfaces/IDukerNewsEvents.sol";

/// @title DukerNewsEventEncoder
/// @notice ABI-encoding helpers for DukerNews event data.
library DukerNewsEventEncoder {
    function encodeUsernameMinted(
        uint256 tokenId,
        string memory username,
        uint128 amount,
        uint16 dukiBps
    ) internal pure returns (bytes memory) {
        return abi.encode(
            IDukerNewsEvents.UsernameMintedData({
                tokenId: tokenId,
                username: username,
                amount: amount,
                dukiBps: dukiBps
            })
        );
    }
}
