// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * Define a randomness interface that seems similar to how iChing divination works (KnowUnknowable.love)
 *
 * @title IRandomness
 */
interface IRandomness {
    // commit
    function commitDivineSealedHalfTruth(bytes32 sealedHalfTruth) external;

    // reveal
    function revealTheFullTruthAndEvolve(bytes32 openedHalfTruth) external;
}
