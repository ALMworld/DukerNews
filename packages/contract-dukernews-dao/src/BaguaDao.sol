//SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./libraries/DukiDaoConstants.sol";
import "./libraries/DukiDaoTypes.sol";
import "./evolve/IEvolveDao.sol";
import "./evolve/IEvolveDaoEvents.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ILoveMintable.sol";
import "./interfaces/IChingDeal.sol";

import "./libraries/DaoEventEncoder.sol";

/**
 * A Bagua DAO contract — startup equity split with 8 Trigram roles.
 *
 * Duki In Action could be the global marketing strategy for any serious business entity that has a global vision.
 * ~ All Attention is All You Need To Make All Great Again. ~
 *
 * @author KindKang2024
 */
contract BaguaDao is Initializable, UUPSUpgradeable, OwnableUpgradeable, IEvolveDao, IChingDeal {
    using SafeERC20 for ERC20;

    address s_stableCoin;

    // Replace Anyrand variables with commit-reveal variables:
    bytes32 private s_sealedHalfTruth;
    uint64 private s_evolveLuckyTruthRevealBlockNumber;
    uint64 private s_lastEvolutionTimestamp;

    // Configurable time parameters
    uint64 public s_minWaitBetweenEvolutions; // Minimum time between evolution attempts (default 7 days)

    uint16[8] public s_dao_bps_arr;
    // calculate total unit for each trigram dynamically
    uint64[8] s_dao_bps_count_arr;

    // each
    uint64 s_dao_born_seconds; // the timestamp when the dao was created
    uint64 s_dao_evolve_round; // start from 1,  monotonic increasing step=1

    uint64 s_dao_world_evt_seq; // everytime contract state mutated
    mapping(address => uint64) s_dao_ego_evt_seq_map; // each ego has its own event sequence
    DukiDaoTypes.DaoFairDrop[8] s_dao_fair_drop_arr;

    uint128 private s_dao_claimed_amount;

    uint64[2] public s_lucky_yinyang_no_pair;

    address s_main_maintainer;

    mapping(address => DukiDaoTypes.ClaimData[8]) s_fairness_claim_data;

    mapping(address => DukiDaoTypes.DukiParticipation) s_community_3_Participants;

    // Keep track of authorized Automation addresses
    address public automationRegistry;

    address public s_alm_world_miner;

    // ─── IChingDeal Storage ───
    mapping(uint64 => IChingDeal.Product) s_products;

    // Reserved storage slots for future upgrades
    uint256[48] private __gap;

    // @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function _authorizeUpgrade(address newImplementation) internal view override onlyOwner {
        if (newImplementation == address(0)) {
            revert DukiDaoTypes.ZeroAddressError();
        }
    }

    function initialize(DukiDaoTypes.BaguaDeployConfig memory config) public initializer {
        __Ownable_init(msg.sender);

        if (config.d18StableCoin == address(0)) {
            revert DukiDaoTypes.ZeroAddressError();
        }

        s_dao_evolve_round = DukiDaoConstants.Initial_Evolve_Round;
        s_dao_born_seconds = uint64(block.timestamp);

        s_stableCoin = config.d18StableCoin;

        // Initialize time parameters with defaults
        s_minWaitBetweenEvolutions = 7 days;

        s_alm_world_miner = config.almWorldMiner;

        // Set unlimited approval for DUKI token contract
        ERC20(s_stableCoin).approve(s_alm_world_miner, type(uint256).max);

        s_dao_bps_arr = [
            DukiDaoConstants.Initial_0_ALM_World_DukiInAction_Bps,
            DukiDaoConstants.Initial_1_ALM_Nation_DukiInAction_Bps,
            DukiDaoConstants.Initial_2_Investors_Bps,
            DukiDaoConstants.Initial_3_Community_Bps,
            DukiDaoConstants.Initial_4_Marketers_Bps,
            DukiDaoConstants.Initial_5_Partners_Bps,
            DukiDaoConstants.Initial_6_Builders_Bps,
            DukiDaoConstants.Initial_7_Founders_Bps
        ];

        // 1. Validate and set shares
        for (uint256 i = 0; i < config.creators.length; i++) {
            if (config.creators[i] == address(0)) {
                revert DukiDaoTypes.ZeroAddressError();
            }
            s_fairness_claim_data[config.creators[i]][DukiDaoConstants.SEQ_7_Heaven_Founders] =
                DukiDaoTypes.ClaimData(DukiDaoConstants.Initial_Evolve_Round, 0);
        }

        s_dao_bps_count_arr[DukiDaoConstants.SEQ_7_Heaven_Founders] = uint64(config.creators.length);

        for (uint256 i = 0; i < config.maintainers.length; i++) {
            if (config.maintainers[i] == address(0)) {
                revert DukiDaoTypes.ZeroAddressError();
            }
            s_fairness_claim_data[config.maintainers[i]][DukiDaoConstants.SEQ_6_Lake_Builders] =
                DukiDaoTypes.ClaimData(DukiDaoConstants.Initial_Evolve_Round, 0);
            if (0 == i) {
                s_main_maintainer = config.maintainers[0];
            }
        }
        s_dao_bps_count_arr[DukiDaoConstants.SEQ_6_Lake_Builders] = uint64(config.maintainers.length);

        s_dao_world_evt_seq += 1;
        emit WorldEvolveDaoEvent(
            address(this),
            s_dao_world_evt_seq,
            EvolveDaoEventType.BAGUA_EVOLVE_DAO_BORN,
            DukiDaoTypes.Trigram.Heaven_Qian_7_Founders,
            uint64(block.timestamp),
            1, // version
            DaoEventEncoder.encodeBaguaDukiDaoBornData(s_dao_bps_arr, config.creators, config.maintainers)
        );
    }

    function baguaDaoAgg4World() external view override returns (DukiDaoTypes.BaguaDaoWorldAgg memory) {
        uint128 stableCoinBalance = uint128(ERC20(s_stableCoin).balanceOf(address(this)));

        return DukiDaoTypes.BaguaDaoWorldAgg(
            s_dao_evolve_round,
            s_dao_born_seconds,
            s_dao_world_evt_seq,
            s_lucky_yinyang_no_pair,
            s_dao_claimed_amount,
            stableCoinBalance,
            s_dao_bps_arr,
            s_dao_bps_count_arr,
            s_dao_fair_drop_arr
        );
    }

    function baguaDaoAgg4Me(address user) external view override returns (DukiDaoTypes.BaguaDaoEgoAgg memory) {
        return DukiDaoTypes.BaguaDaoEgoAgg(
            s_dao_ego_evt_seq_map[user],
            s_dao_world_evt_seq,
            s_community_3_Participants[user],
            s_fairness_claim_data[user]
        );
    }

    function claimableAlmWorldToken(address user) external view returns (uint128) {
        DukiDaoTypes.DukiParticipation memory participation = s_community_3_Participants[user];
        uint128 claimedAlmWorldAmount =
            s_fairness_claim_data[user][DukiDaoConstants.SEQ_0_Earth_ALM_DukiInAction].totalClaimedAmount;
        return participation.almWorldAmount - claimedAlmWorldAmount;
    }

    function approveAsObserver(address requestor, uint256 observerRoleSeq) external maintainerOnly {
        if (
            observerRoleSeq != DukiDaoConstants.SEQ_5_Fire_Partners
                && observerRoleSeq != DukiDaoConstants.SEQ_4_Thunder_DukiMarketers
        ) {
            revert DukiDaoTypes.RoleNotSupport(observerRoleSeq);
        }

        uint256 observerRoleMaxCount =
            DukiDaoConstants.SEQ_5_Fire_Partners == observerRoleSeq ? DukiDaoConstants.MaxInfluencerTotal : 0;

        addAsDaoObserver(requestor, observerRoleSeq, s_fairness_claim_data[requestor], observerRoleMaxCount);
    }

    // add as observer for the dao
    function addAsDaoObserver(
        address observer,
        uint256 observerRoleSeq,
        DukiDaoTypes.ClaimData[8] storage fairnessClaimData,
        uint256 observerRoleMaxCount
    ) internal {
        if (observerRoleMaxCount > 0 && s_dao_bps_count_arr[observerRoleSeq] >= observerRoleMaxCount) {
            revert DukiDaoTypes.BaguaRoleFull(observerRoleSeq);
        }

        if (fairnessClaimData[observerRoleSeq].latestClaimedRound >= DukiDaoConstants.Initial_Evolve_Round) {
            revert DukiDaoTypes.AlreadyInBaguaRole(observerRoleSeq);
        }

        s_dao_bps_count_arr[observerRoleSeq] += 1;
        fairnessClaimData[observerRoleSeq] = DukiDaoTypes.ClaimData(DukiDaoConstants.Initial_Evolve_Round, 0);
        s_dao_world_evt_seq += 1;
        emit WorldEvolveDaoEvent(
            observer,
            s_dao_world_evt_seq,
            EvolveDaoEventType.BAGUA_ROLE_ADDED,
            DukiDaoTypes.Trigram(observerRoleSeq),
            uint64(block.timestamp),
            1, // version
            DaoEventEncoder.encodeBaguaRoleAdded(observer)
        );
    }

    /**
     * a way to support
     */
    function connectDaoToInvest() external {
        DukiDaoTypes.ClaimData memory investorMap =
            s_fairness_claim_data[msg.sender][DukiDaoConstants.SEQ_2_Water_Investors];

        if (investorMap.latestClaimedRound >= DukiDaoConstants.Initial_Evolve_Round) {
            return;
        }

        // EFFECTS
        addAsDaoObserver(
            msg.sender,
            DukiDaoConstants.SEQ_2_Water_Investors,
            s_fairness_claim_data[msg.sender],
            DukiDaoConstants.TESLA_MAGIC_INVESTORS_NUMBER
        );

        ERC20(s_stableCoin).safeTransferFrom(msg.sender, address(this), DukiDaoConstants.Hexagram_INVEST_AMOUNT_D18);

        s_dao_world_evt_seq += 1;
        s_dao_ego_evt_seq_map[msg.sender] += 1;
        emit WorldEvolveDaoEvent(
            msg.sender,
            s_dao_world_evt_seq,
            EvolveDaoEventType.KINDNESS_FIRST_INVESTMENT,
            DukiDaoTypes.Trigram.Water_Kan_2_Investors,
            uint64(block.timestamp),
            1, // version
            DaoEventEncoder.encodeKindnessFirstInvestment(
                s_dao_evolve_round, DukiDaoConstants.Hexagram_INVEST_AMOUNT_D18, s_dao_ego_evt_seq_map[msg.sender]
            )
        );
    }

    function claim3Love_CommunityLotteryFairDrop() external {
        // CHECKS
        DukiDaoTypes.DukiParticipation memory participation = s_community_3_Participants[msg.sender];

        if (participation.participantNo == 0) {
            revert DukiDaoTypes.NotQualifiedForClaim(DukiDaoConstants.SEQ_3_Wind_Community_Participants);
        }

        if (
            participation.participantNo != s_lucky_yinyang_no_pair[0]
                && participation.participantNo != s_lucky_yinyang_no_pair[1]
        ) {
            revert DukiDaoTypes.NotCommunityLotteryWinner();
        }

        DukiDaoTypes.ClaimData memory claimData =
            s_fairness_claim_data[msg.sender][DukiDaoConstants.SEQ_3_Wind_Community_Participants];
        if (claimData.latestClaimedRound >= s_dao_evolve_round) {
            revert DukiDaoTypes.ClaimedCurrentRoundAlreadyError();
        }

        DukiDaoTypes.DaoFairDrop memory fairDrop =
            s_dao_fair_drop_arr[DukiDaoConstants.SEQ_3_Wind_Community_Participants];
        if (fairDrop.unitLeft <= 0) {
            revert DukiDaoTypes.NoDistributionUnitLeft();
        }

        uint128 maxClaimAmount = participation.participantAmount * 1000;
        uint128 claimAmount = maxClaimAmount > fairDrop.unitAmount ? fairDrop.unitAmount : maxClaimAmount;

        // EFFECTS
        s_dao_fair_drop_arr[DukiDaoConstants.SEQ_3_Wind_Community_Participants].unitLeft -= 1;

        claimData.latestClaimedRound = s_dao_evolve_round;
        claimData.totalClaimedAmount += claimAmount;
        s_fairness_claim_data[msg.sender][DukiDaoConstants.SEQ_3_Wind_Community_Participants] = claimData;

        s_dao_claimed_amount += claimAmount;

        // INTERACTIONS
        ERC20(s_stableCoin).safeTransfer(msg.sender, claimAmount);

        s_dao_world_evt_seq += 1;
        s_dao_ego_evt_seq_map[msg.sender] += 1;
        emit WorldEvolveDaoEvent(
            msg.sender,
            s_dao_world_evt_seq,
            EvolveDaoEventType.FAIRNESS_ALWAYS_CLAIM,
            DukiDaoTypes.Trigram.Wind_Xun_3_Community,
            uint64(block.timestamp),
            1, // version
            DaoEventEncoder.encodeFairnessAlwaysClaim(
                claimData.latestClaimedRound, fairDrop.unitAmount, s_dao_ego_evt_seq_map[msg.sender]
            )
        );
    }

    function claim0Love_AlmWorldToken() external {
        DukiDaoTypes.DukiParticipation memory participation = s_community_3_Participants[msg.sender];
        if (participation.participantNo == 0) {
            revert DukiDaoTypes.NotCommunityParticipant();
        }

        uint128 claimedAlmWorldAmount =
            s_fairness_claim_data[msg.sender][DukiDaoConstants.SEQ_0_Earth_ALM_DukiInAction].totalClaimedAmount;

        if (claimedAlmWorldAmount >= participation.almWorldAmount) {
            revert DukiDaoTypes.NoDistributionUnitLeft();
        }

        uint128 almWorldAmountToClaim = participation.almWorldAmount - claimedAlmWorldAmount;
        uint128 almTokenBalance = uint128(ERC20(s_alm_world_miner).balanceOf(address(this)));

        if (almTokenBalance < almWorldAmountToClaim) {
            revert DukiDaoTypes.InsufficientAmount(almTokenBalance, almWorldAmountToClaim);
        }

        // EFFECTS
        s_fairness_claim_data[msg.sender][DukiDaoConstants.SEQ_0_Earth_ALM_DukiInAction].totalClaimedAmount += almWorldAmountToClaim;

        // INTERACTIONS
        ERC20(s_alm_world_miner).safeTransfer(msg.sender, almWorldAmountToClaim);

        s_dao_world_evt_seq += 1;
        s_dao_ego_evt_seq_map[msg.sender] += 1;
        emit WorldEvolveDaoEvent(
            msg.sender,
            s_dao_world_evt_seq,
            EvolveDaoEventType.FAIRNESS_ALWAYS_CLAIM,
            DukiDaoTypes.Trigram.Earth_Kun_0_ALM_World,
            uint64(block.timestamp),
            1, // version
            DaoEventEncoder.encodeFairnessAlwaysClaim(
                s_dao_evolve_round, almWorldAmountToClaim, s_dao_ego_evt_seq_map[msg.sender]
            )
        );
    }

    function common_claim(uint256 trigramRoleSeq) external {
        if (
            trigramRoleSeq < DukiDaoConstants.SEQ_4_Thunder_DukiMarketers
                && trigramRoleSeq != DukiDaoConstants.SEQ_2_Water_Investors
        ) {
            revert DukiDaoTypes.RoleNotSupport(trigramRoleSeq);
        }

        DukiDaoTypes.ClaimData memory claimData = s_fairness_claim_data[msg.sender][trigramRoleSeq];

        uint64 currentEvolveAge = s_dao_evolve_round;

        if (claimData.latestClaimedRound == 0) {
            revert DukiDaoTypes.NotQualifiedForClaim(trigramRoleSeq);
        }

        if (claimData.latestClaimedRound == currentEvolveAge) {
            revert DukiDaoTypes.ClaimedCurrentRoundAlreadyError();
        }

        DukiDaoTypes.DaoFairDrop storage fairDrop = s_dao_fair_drop_arr[trigramRoleSeq];
        if (fairDrop.unitLeft <= 0) {
            revert DukiDaoTypes.NoDistributionUnitLeft();
        }

        // EFFECTS
        fairDrop.unitLeft -= 1;
        claimData.latestClaimedRound = currentEvolveAge;
        claimData.totalClaimedAmount += fairDrop.unitAmount;
        s_fairness_claim_data[msg.sender][trigramRoleSeq] = claimData;

        s_dao_claimed_amount += fairDrop.unitAmount;

        // INTERACTIONS
        ERC20(s_stableCoin).safeTransfer(msg.sender, fairDrop.unitAmount);

        s_dao_world_evt_seq += 1;
        s_dao_ego_evt_seq_map[msg.sender] += 1;
        emit WorldEvolveDaoEvent(
            msg.sender,
            s_dao_world_evt_seq,
            EvolveDaoEventType.FAIRNESS_ALWAYS_CLAIM,
            DukiDaoTypes.Trigram(trigramRoleSeq),
            uint64(block.timestamp),
            1, // version
            DaoEventEncoder.encodeFairnessAlwaysClaim(
                s_dao_evolve_round, fairDrop.unitAmount, s_dao_ego_evt_seq_map[msg.sender]
            )
        );
    }

    modifier maintainerOnly() {
        if (s_fairness_claim_data[msg.sender][DukiDaoConstants.SEQ_6_Lake_Builders].latestClaimedRound == 0) {
            revert DukiDaoTypes.OnlyMaintainerOrAutomationCanCall();
        }
        _;
    }

    modifier maintainerOrAutomationOnly() {
        bool isMaintainer =
            s_fairness_claim_data[msg.sender][DukiDaoConstants.SEQ_6_Lake_Builders].latestClaimedRound != 0;
        bool isAutomation = automationRegistry != address(0) && msg.sender == automationRegistry;

        if (!isMaintainer && !isAutomation) {
            revert DukiDaoTypes.OnlyMaintainerOrAutomationCanCall();
        }
        _;
    }

    function setMinWaitBetweenEvolutions(uint64 newWaitTime) external maintainerOnly {
        s_minWaitBetweenEvolutions = newWaitTime;
    }

    function setAutomationRegistry(address _automationRegistry) external maintainerOnly {
        automationRegistry = _automationRegistry;
    }

    function tryAbortDaoEvolution() external maintainerOnly {
        s_sealedHalfTruth = bytes32(0);
        s_evolveLuckyTruthRevealBlockNumber = 0;
    }

    // instead of sealed half truth, iChing divination can given our sealed full truth. check KnowUnknowable.love  to know more.
    function commitDivineSealedHalfTruth(bytes32 sealedHalfTruth) external override maintainerOrAutomationOnly {
        if (s_sealedHalfTruth != bytes32(0)) {
            revert DukiDaoTypes.DaoEvolutionInProgress();
        }

        // Only enforce wait time if there was a previous evolution (s_lastEvolutionTimestamp > 0)
        if (s_lastEvolutionTimestamp > 0 && block.timestamp < s_lastEvolutionTimestamp + s_minWaitBetweenEvolutions) {
            revert DukiDaoTypes.MustWaitBetweenEvolutions(
                s_lastEvolutionTimestamp, s_minWaitBetweenEvolutions, block.timestamp
            );
        }

        uint256 balance = ERC20(s_stableCoin).balanceOf(address(this));
        if (balance < DukiDaoConstants.DAO_START_EVOLVE_AMOUNT_D18) {
            revert DukiDaoTypes.InsufficientBalance(balance, DukiDaoConstants.DAO_START_EVOLVE_AMOUNT_D18);
        }

        s_sealedHalfTruth = sealedHalfTruth;
        s_evolveLuckyTruthRevealBlockNumber = uint64(block.number + 3); // Next block

        s_dao_world_evt_seq += 1;
        emit WorldEvolveDaoEvent(
            address(this),
            s_dao_world_evt_seq,
            EvolveDaoEventType.DAO_EVOLUTION_WILLING,
            DukiDaoTypes.Trigram.Lake_Dui_6_Builders,
            uint64(block.timestamp),
            1, // version
            DaoEventEncoder.encodeDaoEvolutionWilling(s_evolveLuckyTruthRevealBlockNumber)
        );
    }

    function revealTheFullTruthAndEvolve(bytes32 openedHalfTruth) external override maintainerOrAutomationOnly {
        if (s_sealedHalfTruth == bytes32(0)) {
            revert DukiDaoTypes.DaoEvolutionNotWilled();
        }
        if (block.number < s_evolveLuckyTruthRevealBlockNumber) {
            revert DukiDaoTypes.NeedMoreTimeToKnowFullTruth();
        }
        if (keccak256(abi.encodePacked(msg.sender, openedHalfTruth)) != s_sealedHalfTruth) {
            revert DukiDaoTypes.OperatorDoNotKnowTheHalfTruth();
        }

        // Generate random number using seed + blockhash
        uint256 fullTruthRandomNumber =
            uint256(keccak256(abi.encodePacked(openedHalfTruth, blockhash(s_evolveLuckyTruthRevealBlockNumber))));

        // Reset state
        s_sealedHalfTruth = bytes32(0);
        s_lastEvolutionTimestamp = uint64(block.timestamp);

        // Execute evolution with random number
        evolveDaoAndDivideLove(uint64(fullTruthRandomNumber));
    }

    function evolveDaoAndDivideLove(uint64 randomNumber) internal {
        uint128 balance = uint128(ERC20(s_stableCoin).balanceOf(address(this)));
        if (balance < DukiDaoConstants.DAO_START_EVOLVE_AMOUNT_D18) {
            revert DukiDaoTypes.InsufficientBalance(balance, DukiDaoConstants.DAO_START_EVOLVE_AMOUNT_D18);
        }

        uint128 distributionAmount = (balance - DukiDaoConstants.DAO_EVOLVE_LEFT_AMOUNT_D18) / 8;
        uint64 totalParticipants = s_dao_bps_count_arr[DukiDaoConstants.SEQ_3_Wind_Community_Participants];

        uint64 luckyAnchor = (randomNumber % totalParticipants) + 1;

        // EFFECTS
        s_lastEvolutionTimestamp = uint64(block.timestamp);

        s_dao_evolve_round += 1;
        s_lucky_yinyang_no_pair = [luckyAnchor, luckyAnchor >= totalParticipants ? luckyAnchor - 1 : luckyAnchor + 1];

        uint64[8] memory bpsUnitNumArr = s_dao_bps_count_arr;
        uint16[8] memory bpsArr = s_dao_bps_arr;

        DukiDaoTypes.DaoFairDrop[8] memory daoFairDrops = calculateFairDrops(distributionAmount, bpsUnitNumArr, bpsArr);

        // Set the values in batch
        s_dao_fair_drop_arr = daoFairDrops;

        ILoveMintable(s_alm_world_miner).mint(address(this), daoFairDrops[0].unitTotal * daoFairDrops[0].unitAmount);

        s_dao_world_evt_seq += 1;
        emit WorldEvolveDaoEvent(
            address(this),
            s_dao_world_evt_seq,
            EvolveDaoEventType.DAO_EVOLUTION_MANIFESTATION,
            DukiDaoTypes.Trigram.Earth_Kun_0_ALM_World,
            uint64(block.timestamp),
            1, // version
            DaoEventEncoder.encodeDaoEvolutionManifestation(
                s_dao_evolve_round, s_evolveLuckyTruthRevealBlockNumber, randomNumber, totalParticipants, daoFairDrops
            )
        );
    }

    /**
     * @notice Calculate fair drops for evolution
     * @param daoDistributionAmount Total amount to distribute
     * @param bpsUnitNumArr Array of unit counts for each role
     * @param bpsArr Array of BPS values for each role
     * @return daoFairDrops Array of calculated fair drops
     */
    function calculateFairDrops(uint128 daoDistributionAmount, uint64[8] memory bpsUnitNumArr, uint16[8] memory bpsArr)
        internal
        pure
        returns (DukiDaoTypes.DaoFairDrop[8] memory daoFairDrops)
    {
        uint128 distributionAmount = (DukiDaoConstants.BPS_PRECISION * daoDistributionAmount)
            / (DukiDaoConstants.BPS_PRECISION - bpsArr[DukiDaoConstants.SEQ_0_Earth_ALM_DukiInAction]);
        // iterate over baguaDaoUnitTotals
        for (uint256 i = 0; i < 8; i++) {
            uint128 bpsAmount = (bpsArr[i] * distributionAmount) / DukiDaoConstants.BPS_PRECISION;
            uint64 bpsUnitNum = bpsUnitNumArr[i];

            if (DukiDaoConstants.SEQ_0_Earth_ALM_DukiInAction == i) {
                daoFairDrops[i] = DukiDaoTypes.DaoFairDrop(bpsAmount, 1, 1);
            } else if (DukiDaoConstants.SEQ_6_Lake_Builders == i) {
                continue;
            } else if (DukiDaoConstants.SEQ_3_Wind_Community_Participants == i) {
                if (bpsUnitNum <= 0) {
                    continue;
                }
                uint128 unitAmount = bpsAmount / 2; // two winners - yin and yang
                daoFairDrops[i] = DukiDaoTypes.DaoFairDrop(unitAmount, 2, 2);
            } else {
                if (bpsUnitNum <= 0) {
                    continue;
                }
                uint128 unitAmount = bpsAmount / bpsUnitNum;
                daoFairDrops[i] = DukiDaoTypes.DaoFairDrop(unitAmount, bpsUnitNum, bpsUnitNum);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  IChingDeal Implementation — QianKunDEAL Payment Standard
    // ═══════════════════════════════════════════════════════════════

    /// @dev Emitted on every kind deal purchase. Distinct from IChingDeal.QianKunDeal (different args).
    event QianKunDEAL(address indexed buyer, uint64 indexed productId, uint128 amount, uint64 buyCount, uint64 timestamp);

    /// @inheritdoc IChingDeal
    function registerProduct(uint64 id, uint128 perPrice, uint128 dukiPerPrice, string calldata hasContentHashUrl)
        external
        override
        maintainerOnly
    {
        if (s_products[id].active) {
            revert DukiDaoTypes.ProductAlreadyExists(id);
        }

        s_products[id] = Product({
            perPrice: perPrice, dukiPerPrice: dukiPerPrice, hasContentHashUrl: hasContentHashUrl, active: true
        });

        emit QianKunProductRegistered(id, perPrice, dukiPerPrice, hasContentHashUrl);
    }

    /// @inheritdoc IChingDeal
    function kindDeal(uint64 productId, uint128 amount) external override {
        Product storage product = s_products[productId];

        if (!product.active) {
            revert DukiDaoTypes.ProductNotFound(productId);
        }
        if (product.perPrice > 0 && amount < product.perPrice) {
            revert DukiDaoTypes.InsufficientDealAmount(amount, product.perPrice);
        }

        // Transfer stablecoin from dealer into DAO treasury
        ERC20(s_stableCoin).safeTransferFrom(msg.sender, address(this), amount);

        // Track participation — accumulate amount, auto-join community on first deal
        DukiDaoTypes.DukiParticipation storage participation = s_community_3_Participants[msg.sender];
        uint64 buyCount = 0;
        if (participation.participantNo == 0) {
            // First deal — register as community participant
            s_dao_bps_count_arr[DukiDaoConstants.SEQ_3_Wind_Community_Participants] += 1;
            participation.participantNo = s_dao_bps_count_arr[DukiDaoConstants.SEQ_3_Wind_Community_Participants];
        } else {
            buyCount = uint64(participation.participantAmount / amount);
        }
        participation.participantAmount += amount;

        // Emit QianKunDEAL — the universal payment event
        emit QianKunDEAL(msg.sender, productId, amount, buyCount, uint64(block.timestamp));
    }

    /// @inheritdoc IChingDeal
    function getProduct(uint64 productId) external view override returns (Product memory) {
        return s_products[productId];
    }
}
