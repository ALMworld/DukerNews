// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockUSDT
/// @notice Mintable ERC-20 with 6 decimals + EIP-2612 permit for gasless approvals.
///         Mimics real USDT with permit support for x402 testing on testnets.
contract MockUSDT is ERC20, ERC20Permit, Ownable {
    constructor() ERC20("Mock USDT", "USDT") ERC20Permit("Mock USDT") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint tokens to any address (test only).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Override nonces for ERC20Permit compatibility
    function nonces(address owner) public view override(ERC20Permit) returns (uint256) {
        return super.nonces(owner);
    }
}
