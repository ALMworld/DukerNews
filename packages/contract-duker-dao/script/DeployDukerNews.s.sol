// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/DukerNews.sol";

contract DeployDukerNews is Script {
    function run() external {
        // Anvil account #0 private key
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerKey);

        // Read addresses from env
        address usdtAddr = vm.envOr("USDT_ADDRESS", address(0x5FbDB2315678afecb367f032d93F642f64180aa3));
        address treasuryAddr = vm.envOr("TREASURY_ADDRESS", deployer);
        address minterAddr = vm.envOr("MINTER_ADDRESS", address(0));

        vm.startBroadcast(deployerKey);

        // 1. Deploy DukerNews implementation
        DukerNews impl = new DukerNews();

        // 2. Deploy ERC1967Proxy pointing to implementation
        bytes memory initData = abi.encodeCall(
            DukerNews.initialize,
            (usdtAddr, treasuryAddr)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);

        // 3. Wire up minter if provided
        DukerNews dukerNews = DukerNews(address(proxy));
        if (minterAddr != address(0)) {
            dukerNews.setMinter(minterAddr);
            console.log("Minter:            ", minterAddr);
        }

        vm.stopBroadcast();

        // 4. Write address to deployments
        string memory chainId = vm.toString(block.chainid);
        string memory json = string.concat(
            '{\n',
            '  "chainId": ', chainId, ',\n',
            '  "DukerNews": "', vm.toString(address(proxy)), '",\n',
            '  "DukerNewsImpl": "', vm.toString(address(impl)), '"\n',
            '}'
        );
        string memory filename = string.concat("deployments/", chainId, ".json");
        vm.writeFile(filename, json);

        console.log("=== DukerNews Deployed (UUPS Proxy) ===");
        console.log("DukerNews (proxy):", address(proxy));
        console.log("DukerNews (impl): ", address(impl));
        console.log("USDT:              ", usdtAddr);
        console.log("Treasury:          ", treasuryAddr);
        console.log("Written to", filename);
    }
}
