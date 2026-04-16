// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { DukiDaoTypes } from "../libraries/DukiDaoTypes.sol";

/**
 * @title IEvolveDaoEvents
 * @notice Centralized event definitions for BaguaDao
 */
interface IEvolveDaoEvents {
    enum EvolveDaoEventType {
        BAGUA_EVOLVE_DAO_BORN, // 0
        BEING_KINDNESS_FIRST_COMMIT, // 1
        BEING_KINDNESS_FIRST_JUDGE, // 2
        KINDNESS_FIRST_INVESTMENT, // 3
        FAIRNESS_ALWAYS_CLAIM, // 4
        DAO_EVOLUTION_WILLING, // 5
        DAO_EVOLUTION_MANIFESTATION, // 6
        BAGUA_DUKI_DAO_BPS_CHANGED, // 7
        BAGUA_ROLE_ADDED // 8
    }

    // Universal event for all DAO activities
    event WorldEvolveDaoEvent(
        address indexed evolver,
        uint64 indexed worldEvtSeq,
        EvolveDaoEventType eventType,
        DukiDaoTypes.Trigram role,
        uint64 evtTime,
        uint32 version,
        bytes eventData
    );

    // Data structures for different event types
    struct BeingKindnessFirstCommitData {
        bytes16 wUuid;
        uint64 wid;
        bytes16 bUuid;
        uint64 bid;
        uint32 evolvePassDays;
        uint32 periodDays;
        uint64 egoEvtSeq;
        uint64 startTimestamp;
        uint128 willEvolvePowerAmount;
    }

    struct BeingKindnessFirstJudgeData {
        bytes16 bUuid;
        uint64 bid;
        uint16 evolvePassDays;
        uint16 periodDays;
        bool evolved;
        uint16 ackDays;
        uint64 egoEvtSeq;
        uint128 willEvolvePowerAmount;
        bytes willEvolveRepresentationMap;
    }

    struct KindnessFirstInvestmentData {
        uint64 daoEvolveRound;
        uint128 amount;
        uint64 egoEvtSeq;
    }

    struct FairnessAlwaysClaimData {
        uint64 daoEvolveRound;
        uint128 amount;
        uint64 egoEvtSeq;
    }

    struct DaoEvolutionWillingData {
        uint64 luckyTruthRevealBlockNumber;
    }

    struct DaoEvolutionManifestationData {
        uint64 daoEvolveRound;
        uint64 luckyTruthRevealBlockNumber;
        uint64 randomNumber;
        uint64 totalParticipants;
        DukiDaoTypes.DaoFairDrop[8] fairDrops;
    }

    struct BaguaDukiEvolveDaoBornData {
        uint16[8] initialBps;
        address[] founders;
        address[] initialBuilders;
    }

    struct BaguaDukiDaoBpsChangedData {
        uint16[8] beforeBps;
        uint16[8] afterBps;
    }

    struct EvolveDaoBornEventData {
        uint16[8] initialBps;
    }

    struct BaguaRoleAddedData {
        address user;
    }

    error _ABI_BaguaEvolveDaoBorn(BaguaDukiEvolveDaoBornData data);
    error _ABI_BeingKindnessFirstJudgeData(BeingKindnessFirstJudgeData data);
    error _ABI_BeingKindnessFirstCommitData(BeingKindnessFirstCommitData data);
    error _ABI_KindnessFirstInvestmentData(KindnessFirstInvestmentData data);
    error _ABI_FairnessAlwaysClaimData(FairnessAlwaysClaimData data);
    error _ABI_DaoEvolutionWillingData(DaoEvolutionWillingData data);
    error _ABI_DaoEvolutionManifestationData(DaoEvolutionManifestationData data);
    error _ABI_BaguaDukiDaoBpsChangedData(BaguaDukiDaoBpsChangedData data);
    error _ABI_BaguaRoleAddedData(BaguaRoleAddedData data);
}
