// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IDukiBaguaDao } from "../interfaces/IDukiBaguaDao.sol";
import { DukiDaoTypes } from "../libraries/DukiDaoTypes.sol";
import { IEvolveDaoEvents } from "./IEvolveDaoEvents.sol";
import { IEvovleDaoErrors } from "./IEvovleDaoErrors.sol";
import "../interfaces/IRandomness.sol";

interface IEvolveDao is IEvolveDaoEvents, IEvovleDaoErrors, IRandomness {
    function baguaDaoAgg4Me(address user) external view returns (DukiDaoTypes.BaguaDaoEgoAgg memory);
    function baguaDaoAgg4World() external view returns (DukiDaoTypes.BaguaDaoWorldAgg memory);

    function connectDaoToInvest() external;

    function tryAbortDaoEvolution() external;

    function commitDivineSealedHalfTruth(bytes32 sealedHalfTruth) external;
    function revealTheFullTruthAndEvolve(bytes32 openedHalfTruth) external;
}
