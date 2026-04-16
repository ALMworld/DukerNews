// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { DukerRegistry } from "../DukerRegistry.sol";

/// @dev WARNING: This is for testing purposes only
contract DukerRegistryMock is DukerRegistry {
    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _delegate,
        uint32 _localChainEid
    ) DukerRegistry(_name, _symbol, _lzEndpoint, _delegate, _localChainEid) {}
}
