// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../libraries/DukiDaoTypes.sol";

interface IDukiBaguaDao {
    function baguaDaoUnitCountArr() external view returns (uint256[8] memory);
    function baguaDaoFairDropArr() external view returns (DukiDaoTypes.DaoFairDrop[8] memory);
    function baguaDaoBpsArr() external view returns (uint256[8] memory);
}
