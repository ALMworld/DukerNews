// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * love is a two-sided coin. It can not be minted without interaction.
 *
 * dao is love , it has ying and yang.
 *
 * @title ALMWorldMintable
 * @author ALM.World
 * @notice Interface for ALM.world mintable token
 */
interface ILoveMintable {
    event DukiYinYangMint(
        address ying_receiver, address yang_receiver, uint256 amount, address indexed minter, uint256 indexed sequence
    );

    event DukiTaijiMint(address taiji_receiver, uint256 amount, address indexed minter, uint256 indexed sequence);

    function mint(address ying_receiver, address yang_receiver, uint256 amount) external returns (bool success);

    // taiji means not divided
    function mint(address taiji_receiver, uint256 amount) external returns (bool success);
}
