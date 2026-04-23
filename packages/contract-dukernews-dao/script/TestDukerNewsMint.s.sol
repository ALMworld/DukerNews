// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import "../src/DukerNews.sol";

/// @notice Test script — submits a post with boost via the new DukerNews v4.
///         Requires DukerRegistry identity + DukigenRegistry approval.
contract TestDukerNewsPost is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        DukerNews dukerNews = DukerNews(vm.envAddress("DUKERNEWS_ADDRESS"));

        console.log("=== Test DukerNews Post ===");
        console.log("DukerNews:", address(dukerNews));
        console.log("Deployer: ", deployer);

        // Check identity
        string memory username = dukerNews.usernameOf(deployer);
        console.log("Username:", username);

        vm.startBroadcast(pk);

        // Submit a free post (no boost)
        dukerNews.submitPost(
            2,    // aggType = WORKS
            0,    // aggId = 0 (create new)
            1,    // evtType = POST_CREATED
            "",   // data (empty for test)
            0,    // boostAmount = 0 (free)
            address(0) // stableCoin (ignored when boost=0)
        );

        vm.stopBroadcast();

        console.log("=== SUCCESS ===");
    }
}
