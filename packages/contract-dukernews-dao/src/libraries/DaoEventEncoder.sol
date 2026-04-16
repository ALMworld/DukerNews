// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { DukiDaoTypes } from "./DukiDaoTypes.sol";
import { IEvolveDaoEvents } from "../evolve/IEvolveDaoEvents.sol";
// Helper library for encoding event data

library DaoEventEncoder {
    function encodeBeingKindnessFirstCommit(
        bytes16 wUuid,
        uint64 wid,
        bytes16 bUuid,
        uint64 bid,
        uint128 willEvolvePowerAmount,
        uint64 startTimestamp,
        uint16 evolvePassDays,
        uint16 periodDays,
        uint64 egoEvtSeq
    ) internal pure returns (bytes memory) {
        return abi.encode(
            IEvolveDaoEvents.BeingKindnessFirstCommitData({
                wUuid: wUuid,
                wid: wid,
                bUuid: bUuid,
                bid: bid,
                evolvePassDays: evolvePassDays,
                startTimestamp: startTimestamp,
                periodDays: periodDays,
                egoEvtSeq: egoEvtSeq,
                willEvolvePowerAmount: willEvolvePowerAmount
            })
        );
    }

    function encodeBeingKindnessFirstJudge(
        bytes16 bUuid,
        uint64 bid,
        uint128 willEvolvePowerAmount,
        uint16 evolvePassDays,
        uint16 periodDays,
        bool evolved,
        uint16 ackDays,
        uint64 egoEvtSeq,
        bytes memory willEvolveRepresentationMap
    ) internal pure returns (bytes memory) {
        return abi.encode(
            IEvolveDaoEvents.BeingKindnessFirstJudgeData({
                bUuid: bUuid,
                bid: bid,
                willEvolvePowerAmount: willEvolvePowerAmount,
                evolvePassDays: evolvePassDays,
                periodDays: periodDays,
                evolved: evolved,
                ackDays: ackDays,
                egoEvtSeq: egoEvtSeq,
                willEvolveRepresentationMap: willEvolveRepresentationMap
            })
        );
    }

    function encodeKindnessFirstInvestment(uint64 daoEvolveRound, uint128 amount, uint64 egoEvtSeq)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(
            IEvolveDaoEvents.KindnessFirstInvestmentData({
                daoEvolveRound: daoEvolveRound, amount: amount, egoEvtSeq: egoEvtSeq
            })
        );
    }

    function encodeFairnessAlwaysClaim(uint64 daoEvolveRound, uint128 amount, uint64 egoEvtSeq)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(
            IEvolveDaoEvents.FairnessAlwaysClaimData({
                daoEvolveRound: daoEvolveRound, amount: amount, egoEvtSeq: egoEvtSeq
            })
        );
    }

    function encodeDaoEvolutionWilling(uint64 luckyTruthRevealBlockNumber) internal pure returns (bytes memory) {
        return abi.encode(
            IEvolveDaoEvents.DaoEvolutionWillingData({ luckyTruthRevealBlockNumber: luckyTruthRevealBlockNumber })
        );
    }

    function encodeDaoEvolutionManifestation(
        uint64 daoEvolveRound,
        uint64 luckyTruthRevealBlockNumber,
        uint64 randomNumber,
        uint64 totalParticipants,
        DukiDaoTypes.DaoFairDrop[8] memory fairDrops
    ) internal pure returns (bytes memory) {
        return abi.encode(
            IEvolveDaoEvents.DaoEvolutionManifestationData({
                daoEvolveRound: daoEvolveRound,
                luckyTruthRevealBlockNumber: luckyTruthRevealBlockNumber,
                randomNumber: randomNumber,
                totalParticipants: totalParticipants,
                fairDrops: fairDrops
            })
        );
    }

    function encodeBaguaDukiDaoBornData(
        uint16[8] memory initialBps,
        address[] memory founders,
        address[] memory initialBuilders
    ) internal pure returns (bytes memory) {
        return abi.encode(
            IEvolveDaoEvents.BaguaDukiEvolveDaoBornData({
                initialBps: initialBps, founders: founders, initialBuilders: initialBuilders
            })
        );
    }

    function encodeBaguaEvolveDaoBpsChanged(uint16[8] memory beforeBps, uint16[8] memory afterBps)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(IEvolveDaoEvents.BaguaDukiDaoBpsChangedData({ beforeBps: beforeBps, afterBps: afterBps }));
    }

    function encodeBaguaRoleAdded(address user) internal pure returns (bytes memory) {
        return abi.encode(IEvolveDaoEvents.BaguaRoleAddedData({ user: user }));
    }
}
