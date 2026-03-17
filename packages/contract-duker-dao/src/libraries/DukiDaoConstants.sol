// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library DukiDaoConstants {
    uint256 constant Initial_Zero = 0;
    uint64 constant Initial_Evolve_Round = 1; // must be 1 to distinguish from 0 - unexisted

    uint32 constant BPS_PRECISION = 10000;

    // makers
    uint16 constant Initial_4_Marketers_Bps = 1000;
    uint16 constant Initial_5_Partners_Bps = 750; // 7.5% for unlimit contributors, like help the localization ...
    uint16 constant Initial_6_Builders_Bps = 3000; // hopes it cover the operation cost and make it survive and thrive
    uint16 constant Initial_7_Founders_Bps = 250; // [2.5% ]

    // takers
    uint16 constant Initial_0_ALM_World_DukiInAction_Bps = 1000; //  serious business should be 1%-2.5% profit.  here 10% since this is a poc and advocate
    uint16 constant Initial_1_ALM_Nation_DukiInAction_Bps = 0; // 0 for now, need nation back up the human proof.  maybe business tax is already paid here.
    uint16 constant Initial_2_Investors_Bps = 2000; // $369*64 for 20%
    uint16 constant Initial_3_Community_Bps = 2000;

    uint16 constant MIN_DukiInAction_Bps = 100; // 1%

    uint8 constant SEQ_0_Earth_ALM_DukiInAction = 0;
    uint8 constant SEQ_1_Mountain_DukiInAction_ALM_Nation = 1;
    uint8 constant SEQ_2_Water_Investors = 2;
    uint8 constant SEQ_3_Wind_Community_Participants = 3;

    uint8 constant SEQ_4_Thunder_DukiMarketers = 4;
    uint8 constant SEQ_5_Fire_Partners = 5;
    uint8 constant SEQ_6_Lake_Builders = 6;
    uint8 constant SEQ_7_Heaven_Founders = 7;

    uint256 constant LotteryMaxLuckyNumber = 2000;

    uint256 constant Stable_Coin_Decimals_D6 = 6;
    uint256 constant Stable_Coin_Decimals_D18 = 18;

    uint256 constant ONE_DOLLAR_BASE_D6 = 10 ** 6;
    uint128 constant ONE_DOLLAR_BASE_D18 = 10 ** 18;

    uint256 constant DukiInAction_StableCoin_Claim_Amount_D6 = ONE_DOLLAR_BASE_D6 / 100;
    uint256 constant DukiInAction_StableCoin_Claim_Amount_D18 = ONE_DOLLAR_BASE_D18 / 100;

    uint256 constant DAO_START_EVOLVE_AMOUNT_D6 = 100 * ONE_DOLLAR_BASE_D6;
    uint256 constant DAO_EVOLVE_LEFT_AMOUNT_D6 = 8 * ONE_DOLLAR_BASE_D6;

    uint128 constant DAO_START_EVOLVE_AMOUNT_D18 = 100 * ONE_DOLLAR_BASE_D18;
    uint128 constant DAO_EVOLVE_LEFT_AMOUNT_D18 = 8 * ONE_DOLLAR_BASE_D18;

    uint256 constant Min_DUKI_Claim_StableCoin_Prerequisite_Amount_D6 = 10 ** Stable_Coin_Decimals_D6;
    uint256 constant Min_DUKI_Claim_StableCoin_Prerequisite_Amount_D18 = 10 ** Stable_Coin_Decimals_D18;

    uint256 constant BASIC_INVEST_AMOUNT_D6 = 369 * ONE_DOLLAR_BASE_D6;
    uint256 constant BASIC_INVEST_AMOUNT_D18 = 369 * ONE_DOLLAR_BASE_D18;

    uint256 constant SMALL_BASIC_INVEST_AMOUNT_D6 = 369 * ONE_DOLLAR_BASE_D6 / 10;
    uint256 constant SMALL_BASIC_INVEST_AMOUNT_D18 = 369 * ONE_DOLLAR_BASE_D18 / 10;

    uint256 constant Hexagram_INVEST_AMOUNT_D6 = 64 * ONE_DOLLAR_BASE_D6;
    uint128 constant Hexagram_INVEST_AMOUNT_D18 = 64 * ONE_DOLLAR_BASE_D18;

    uint256 constant MAX_POWER_AMOUNT_D6 = 1000 * ONE_DOLLAR_BASE_D6;
    uint256 constant MAX_POWER_AMOUNT_D18 = 1000 * ONE_DOLLAR_BASE_D18;

    uint256 constant MaxInvestorsTotal = 64;
    uint256 constant MaxInfluencerTotal = 64;

    uint256 constant TESLA_MAGIC_INVESTORS_NUMBER = 369;

    uint64 constant LIFE_TIME_EXPIRE_SECONDS = type(uint64).max;

    bytes constant ZERO_512_BITS = hex"0000000000000000000000000000000000000000000000000000000000000000";

    bytes32 constant ZERO_256_BITS = bytes32(0);

    bytes constant EMPTY_512_BITS = hex"";

    uint256 public constant BASE_DAY_TIMESTAMP = 1737382800;
}
