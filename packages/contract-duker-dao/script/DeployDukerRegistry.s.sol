// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/MockUSDT.sol";
import "../src/DukerNews.sol";

contract DeployDukerRegistry is Script {
    function run() external {
        // Anvil account #0 private key
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. Deploy MockUSDT
        MockUSDT usdt = new MockUSDT();

        // 2. Deploy DukerNews implementation
        DukerNews impl = new DukerNews();

        // 3. Deploy ERC1967Proxy pointing to implementation
        bytes memory initData = abi.encodeCall(
            DukerNews.initialize,
            (address(usdt), deployer) // treasury = deployer for local testing
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);

        // 4. Mint USDT to first 5 Anvil accounts for testing
        uint256 mintAmount = 10_000 * 1e6; // 10,000 USDT each
        address[5] memory accounts = [
            0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,
            0x70997970C51812dc3A010C7d01b50e0d17dc79C8,
            0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,
            0x90F79bf6EB2c4f870365E785982E1f101E93b906,
            0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
        ];
        for (uint256 i = 0; i < accounts.length; i++) {
            usdt.mint(accounts[i], mintAmount);
        }

        vm.stopBroadcast();

        // 5. Write addresses to file for frontend consumption
        //    Frontend uses the PROXY address, not the implementation
        string memory json = string.concat(
            '{\n',
            '  "chainId": 31337,\n',
            '  "MockUSDT": "', vm.toString(address(usdt)), '",\n',
            '  "DukerNews": "', vm.toString(address(proxy)), '",\n',
            '  "DukerNewsImpl": "', vm.toString(address(impl)), '"\n',
            '}'
        );
        vm.writeFile("deployments/local.json", json);

        console.log("=== DukerNews Deployed (UUPS Proxy) ===");
        console.log("MockUSDT:            ", address(usdt));
        console.log("DukerNews (proxy):   ", address(proxy));
        console.log("DukerNews (impl):    ", address(impl));
        console.log("Treasury:             ", deployer);
        console.log("Deployments written to deployments/local.json");
    }
}
