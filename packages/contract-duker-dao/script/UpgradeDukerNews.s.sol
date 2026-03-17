// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import "../src/DukerNews.sol";

/**
 * UUPS Upgrade script for DukerNews.
 *
 * Deploys a new implementation and calls upgradeTo() on the existing proxy,
 * preserving all state (minted usernames, events, balances).
 *
 * Then calls migrateOwnerToTokenId() to backfill the new mapping.
 *
 * Usage:
 *   forge script script/UpgradeDukerNews.s.sol --fork-url http://127.0.0.1:8545 --broadcast
 */
contract UpgradeDukerNews is Script {
    function run() external {
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));

        // Existing proxy address (from deployments/x402.json or contracts.ts)
        address proxyAddr = vm.envOr("PROXY_ADDRESS", address(0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E));

        vm.startBroadcast(deployerKey);

        // 1. Deploy new implementation
        DukerNews newImpl = new DukerNews();

        // 2. Upgrade existing proxy to new implementation
        DukerNews proxy = DukerNews(proxyAddr);
        proxy.upgradeToAndCall(address(newImpl), "");

        // 3. Backfill ownerToTokenId for existing holders
        proxy.migrateOwnerToTokenId();

        vm.stopBroadcast();

        console.log("=== DukerNews UUPS Upgrade Complete ===");
        console.log("Proxy (unchanged):  ", proxyAddr);
        console.log("New implementation: ", address(newImpl));
        console.log("ownerToTokenId migrated");
    }
}
