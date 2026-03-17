// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import "../src/MockUSDT.sol";

/// @notice Fund any address with test ETH + MockUSDT for local development.
///
/// Usage:
///   FUND_TO=0xYourAddress forge script script/FundAccount.s.sol \
///     --rpc-url http://127.0.0.1:8545 --broadcast
///
/// Optional env vars:
///   FUND_ETH_WEI  — amount of ETH in wei to send  (default: 1 ether)
///   FUND_USDT     — amount of USDT in whole units  (default: 10000)
///   USDT_ADDRESS  — MockUSDT contract address      (reads deployments/local.json default)
contract FundAccount is Script {
    function run() external {
        address target = vm.envAddress("FUND_TO");

        uint256 ethAmount  = vm.envOr("FUND_ETH_WEI", uint256(1 ether));
        uint256 usdtAmount = vm.envOr("FUND_USDT",    uint256(10_000)) * 1e6; // 6 decimals

        // Read USDT address from env or fall back to known local deployment
        address usdtAddr = vm.envOr(
            "USDT_ADDRESS",
            address(0x5FbDB2315678afecb367f032d93F642f64180aa3)
        );

        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        vm.startBroadcast(deployerKey);

        // 1. Send ETH for gas
        if (ethAmount > 0) {
            (bool ok,) = target.call{value: ethAmount}("");
            require(ok, "FundAccount: ETH transfer failed");
        }

        // 2. Mint MockUSDT
        if (usdtAmount > 0 && usdtAddr != address(0)) {
            MockUSDT(usdtAddr).mint(target, usdtAmount);
        }

        vm.stopBroadcast();

        console.log("=== Funded ===");
        console.log("Target: ", target);
        console.log("ETH:    ", ethAmount / 1e18, "ETH");
        console.log("USDT:   ", usdtAmount / 1e6, "USDT");
    }
}
