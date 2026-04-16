// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "./BaguaDao.sol";
import "./libraries/DukiDaoTypes.sol";

/**
 * @title DukerBaguaFactory
 * @notice Deploys new BaguaDao instances as UUPS proxies on demand.
 * @dev Each deployed DAO shares one implementation contract (gas-efficient),
 *      but gets its own proxy with independent storage.
 *
 * @author KindKang2024
 */
contract DukerBaguaFactory is Ownable {
    /// @notice The shared BaguaDao implementation address
    address public implementation;

    /// @notice Registry of all deployed DAO proxies
    address[] public deployedDaos;

    /// @notice Emitted when a new DAO is deployed
    event DaoBorn(address indexed dao, address indexed creator, uint256 index);

    /// @notice Emitted when the implementation is updated
    event ImplementationUpdated(address indexed oldImpl, address indexed newImpl);

    error ZeroImplementation();

    constructor(address _implementation) Ownable(msg.sender) {
        if (_implementation == address(0)) revert ZeroImplementation();
        implementation = _implementation;
    }

    /**
     * @notice Deploy a new BaguaDao as a UUPS proxy
     * @param config The deployment configuration for the new DAO
     * @return dao The address of the newly deployed DAO proxy
     */
    function createDao(DukiDaoTypes.BaguaDeployConfig calldata config) external returns (address dao) {
        // Encode the initialize call
        bytes memory initData = abi.encodeCall(BaguaDao.initialize, (config));

        // Deploy ERC1967Proxy pointing to shared implementation
        ERC1967Proxy proxy = new ERC1967Proxy(implementation, initData);
        dao = address(proxy);

        // Register
        deployedDaos.push(dao);

        emit DaoBorn(dao, msg.sender, deployedDaos.length - 1);
    }

    /**
     * @notice Update the shared implementation for future deployments
     * @dev Does NOT affect already-deployed proxies (they manage their own upgrades via UUPS)
     */
    function updateImplementation(address _implementation) external onlyOwner {
        if (_implementation == address(0)) revert ZeroImplementation();
        address old = implementation;
        implementation = _implementation;
        emit ImplementationUpdated(old, _implementation);
    }

    function getDaoCount() external view returns (uint256) {
        return deployedDaos.length;
    }

    function getDao(uint256 index) external view returns (address) {
        return deployedDaos[index];
    }

    function getAllDaos() external view returns (address[] memory) {
        return deployedDaos;
    }
}
