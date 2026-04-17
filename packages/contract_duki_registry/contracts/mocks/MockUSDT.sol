// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal ERC20 mock for local integration testing.
///      Mints 1M tokens to the deployer on construction.
contract MockUSDT is ERC20 {
    constructor() ERC20("Mock USDT", "MUSDT") {
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
