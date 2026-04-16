// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library DukiDaoTypes {
    struct NetworkConfig {
        address stableCoin;
        address anyrand; // Address of the Anyrand contract for verifiable randomness
        address almWorldLoveDao; // Address of the ALM.world Love DAO contract
        address[] maintainers;
        address[] creators;
    }

    // BaguaDao deploy config
    struct BaguaDeployConfig {
        address d18StableCoin;
        address almWorldMiner;
        address[] maintainers;
        address[] creators;
    }

    // maybe that is the will evolve. the high level of will has the power and will to care about the all.
    // Thus in Chinese philosophy, The Heaven is the highest level of will and comes first. No conflict with that.
    enum Trigram {
        Earth_Kun_0_ALM_World, // 8 ☷ Kun 000 - Earth, born and come into existence - All Lives, All Potential buyers
        Mountain_Gen_1_ALM_Nation, // 7 ☶ 001 Gen - Mountain,  Guardianship and Governer, Nation level
        Water_Kan_2_Investors, // 6  ☵ Kan 010- Water, investors, empowerment
        Wind_Xun_3_Community, //5 ☴ Xun 011- Wind/Wood, Community participation and growth, Community, Realized Consumers (part of Earth Kun)
        Thunder_Zhen_4_Marketers, //4 ☳ Zhen 100- Thunder, Wills Awakening and Mobilization for Duki in Action, mainly for DUKI influence. Could be KOL and so on
        Fire_Li_5_Partners, //3 ☲ Li - Fire, 101 , outside partners
        Lake_Dui_6_Builders, // 2 ☱ Dui - 110 Lake/Marsh teams, suggest 2.5% . (no more than 5% total, need compete with others who do not give; maybe a fitness loss if kindness do not begets kindness)
        Heaven_Qian_7_Founders // 1 ☰ Qian - 111 Heaven/Sky suggest 2.5%, The Service Provider
    }

    struct DukiParticipation {
        uint64 participantNo;
        uint128 participantAmount;
        uint128 almWorldAmount;
    }

    struct DaoFairDrop {
        uint128 unitAmount; // how much money
        uint64 unitLeft; // unitLeft
        uint64 unitTotal; // current evolution total
    }

    struct ClaimData {
        uint64 latestClaimedRound;
        uint128 totalClaimedAmount;
    }

    struct BaguaDaoWorldAgg {
        uint64 evolveNum;
        uint64 bornSeconds;
        uint64 worldEvtSeq;
        uint64[2] luckYinyangNoPair;
        uint128 daoTotalClaimedAmount;
        uint128 daoStableCoinBalance;
        uint16[8] bpsArr;
        uint64[8] bpsNumArr;
        DaoFairDrop[8] fairDrops;
    }

    struct BaguaDaoEgoAgg {
        uint64 egoEvtSeq;
        uint64 worldEvtSeq;
        DukiParticipation participation;
        ClaimData[8] fairnessClaimDataArr;
    }

    enum ConfigChangeType {
        LotteryEntryFee
    }

    event ConfigChanged(ConfigChangeType changeType, uint256 previousFee, uint256 newFee, uint256 timestamp);

    event BaguaDukiDaoBpsChanged(uint256[8] beforeBps, uint256[8] afterBps);

    event BaguaRoleAdded(address user, uint256 roleSeq);

    event DaoEvolutionWilling(uint256 willId);

    event DaoEvolutionManifestation(
        uint256 indexed daoEvolveRound,
        uint256 willId,
        uint256 randomMutationNumber,
        uint256 communityLuckyNumber,
        DukiDaoTypes.DaoFairDrop[8] fairDrops
    );

    // Errors related to Bagua DAO logic
    error BpsSumError();
    error BpsTooLargeViolationError();
    error BpsTooSmallViolationError();
    error NoFoundersError();
    error ZeroAddressError();
    error NotCommunityLotteryWinner();
    error DuplicateFounderError();
    error NotOwnerError();
    error ClaimedCurrentRoundAlreadyError();
    error AlreadyInvested();
    error InsufficientAmount(uint256 current, uint256 expected);
    error NoDistributionUnitLeft();
    error InvalidSignature();
    error OnlyAutomationCanCall();
    error DaoEvolutionNotWilled();
    error DaoEvolutionInProgress();
    error InsufficientPayment(uint256 provided, uint256 required);
    error MustWaitBetweenEvolutions(uint256 lastEvolution, uint256 requiredWait, uint256 currentTime);
    error OnlyMaintainerOrAutomationCanCall();
    error BaguaRoleFull(uint256 roleSeq);
    error NotZkProvedHuman();
    error LateForCurrentClaim(uint256 currentClaimRound, uint256 lateEntryRound);
    error RoleNotSupport(uint256 roleSeq);
    error NotSupported(string actionNeeded);
    error AlreadyInBaguaRole(uint256 roleSeq);
    error NoParticipants();
    error InsufficientBalance(uint256 balance, uint256 required);
    error TransferFailed(uint8 t, address other, uint256 amount);
    error RefundFailed();
    error NotQualifiedForClaim(uint256 roleSeq);
    error InsufficientAllowance(uint8 t, address src, uint256 amount);
    error ExcessiveAmount();
    error TokenNotSupport(uint256 id);
    error OperatorDoNotKnowTheHalfTruth();
    error NotEnoughBalance(uint256 balance, uint256 required);
    error NotUniqueZkProvedHuman();
    error OneHumanOneTermOnlyOneDukiClaim();
    error LengthNotMatch(uint256 expectedLength, uint256 actualLength);
    error InvalidPattern(uint256 value);
    error InvalidOperation();
    error NeedMoreTimeToKnowFullTruth();
    error EvolutionCooldownNotMet(uint256 currentTime, uint256 requiredTime);
    error OnlyByALMWorldGovernor();
    error NotCommunityParticipant();

    // KindDeal errors
    error ProductAlreadyExists(uint64 productId);
    error ProductNotFound(uint64 productId);
    error ProductNotActive(uint64 productId);
    error InsufficientDealAmount(uint128 provided, uint128 required);
}
