// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/DukerNews.sol";

interface IMinter {
    function tokenConfigs(address) external view returns (bool accepted, uint8 tokenDecimals, address oracle, uint256 oracleHeart);
}

contract TestDukerNewsMint is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        DukerNews dukerNews = DukerNews(vm.envAddress("DUKERNEWS_ADDRESS"));
        address usdt0 = vm.envAddress("USDT_ADDRESS");
        address minterAddr = vm.envAddress("MINTER_ADDRESS");

        console.log("=== Test DukerNews Mint ===");
        console.log("DukerNews:", address(dukerNews));
        console.log("Minter:   ", minterAddr);
        console.log("Deployer: ", deployer);

        // Verify minter is set
        console.log("DukerNews.minter:", address(dukerNews.minter()));
        console.log("DukerNews.mintFee:", dukerNews.mintFee());

        // Check if token is accepted on minter
        IMinter minter = IMinter(minterAddr);
        (bool accepted,,,) = minter.tokenConfigs(usdt0);
        console.log("Token accepted on minter:", accepted);

        vm.startBroadcast(pk);

        // Approve USDT0 for DukerNews
        uint256 amount = 2e6; // 2 USDT
        IERC20(usdt0).approve(address(dukerNews), amount);

        // mintUsername(name, amount, dukiBps)
        // 50% to DUKI minter (yin=deployer, yang=treasury), 50% to treasury
        dukerNews.mintUsername(unicode"test_minter", amount, 5000);

        vm.stopBroadcast();

        // Verify
        string memory name = dukerNews.usernameOf(deployer);
        console.log("Username minted:", name);
        console.log("=== SUCCESS ===");
    }
}
