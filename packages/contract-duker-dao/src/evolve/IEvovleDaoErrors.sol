// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IEvovleDaoErrors {
    error UnknownDaoEvolutionId(uint256 requestId, uint256 lastRandomnessWillId);
    error MetaDataAlreadyBackedUp(uint256 maxWorldEvolveNumber);

    error WilleManifestationBootstrapped(bytes16 wUuid, bytes16 mUuid);
    error WilleEvolutionNotFound(bytes16 wUuid, bytes16 mUuid);
    error WilleEvolutionEvaluated(); // already evolved and settled
    error NoPendingRandomnessWill();
    error LoveAsMoneyIntoDaoRequired();
    error WilleEvolutionNeedMoreTime();
    error WilleNotBelongToEgo(bytes16 wUuid, address ego);
}
