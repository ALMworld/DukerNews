// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { DukerRegistry } from "../DukerRegistry.sol";

/// @dev WARNING: This is for testing purposes only
contract DukerRegistryMock is DukerRegistry {
    constructor(address _lzEndpoint) DukerRegistry(_lzEndpoint) {}
}
