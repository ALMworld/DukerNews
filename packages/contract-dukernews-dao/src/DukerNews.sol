// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IDukerNewsEvents } from "./interfaces/IDukerNewsEvents.sol";
import { IDukerNewsErrors } from "./interfaces/IDukerNewsErrors.sol";
import { AggData } from "./interfaces/IDukerNewsTypes.sol";

/// @notice Minimal interface for DukerRegistry (identity layer).
interface IDukerRegistry {
    function ownerToTokenId(address owner) external view returns (uint256);
    function usernameOf(address owner) external view returns (string memory);
}

/// @notice Minimal interface for DukigenRegistry (payment layer).
interface IDukigenRegistry {
    function payTo(
        uint256 agentId,
        uint256 amount,
        uint16 userPreferDukiBps,
        address payer,
        address stableCoinAddress
    ) external;
}

/// @title DukerNews (UUPS Upgradeable)
/// @notice Transparent event log + payment delegator for Duker News.
///
///         Identity is resolved from DukerRegistry (cross-chain soulbound NFT).
///         Payments are routed through DukigenRegistry (DUKI ecosystem split).
///
///         DukerNews itself is a registered agent in DukigenRegistry;
///         all boosts go through dukigenRegistry.payTo(agentId, ...).
///
///         Direct path (user has gas):
///           - submitPost() / submitComment() / boostAttention() — user calls directly
///
///         x402 path — commented out for initial integration.
contract DukerNews is OwnableUpgradeable, UUPSUpgradeable, IDukerNewsEvents, IDukerNewsErrors {

    // ── Constants ───────────────────────────────────────────────────────────

    uint256 public constant AMEND_WINDOW = 64 minutes;
    uint256 public constant COMMENT_WINDOW = 64 days;

    // ── Registry delegation ─────────────────────────────────────────────────

    /// @notice DukerRegistry — cross-chain identity resolution
    IDukerRegistry public dukerRegistry;

    /// @notice DukigenRegistry — payment routing + DUKI minting
    IDukigenRegistry public dukigenRegistry;

    /// @notice This dApp's registered agent ID in DukigenRegistry
    uint256 public agentId;

    /// @notice Stablecoin used for boost payments (e.g., USDT address)
    address public stableCoinAddress;

    // ── Event log state ─────────────────────────────────────────────────────

    /// @notice Global event sequence counter (monotonic)
    uint64 private _evtSeq;

    /// @notice Aggregate ID counters — auto-increment per aggregate type (max 32 types)
    uint64[32] public aggIdCounters;

    /// @notice Aggregate metadata — tracks creator + creation time
    /// aggType => aggId => AggData
    mapping(uint8 => mapping(uint128 => AggData)) public aggData;

    /// @notice Per-user event sequence (incremented on every mutation)
    mapping(address => uint64) public userSeqOf;

    /// @notice Per-user cumulative amount paid (stablecoin, native decimals)
    mapping(address => uint128) public userTotalPaid;

    /// @notice x402 payment nonce → payer address (address(0) = unused)
    mapping(bytes32 => address) public paymentPayer;

    // ── Storage gap for upgradeable contracts ────────────────────────────────
    uint256[64] private __gap;

    // ── Initializer (replaces constructor) ──────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _dukerRegistry,
        address _dukigenRegistry,
        uint256 _agentId,
        address _stableCoinAddress
    ) external initializer {
        __Ownable_init(msg.sender);

        dukerRegistry = IDukerRegistry(_dukerRegistry);
        dukigenRegistry = IDukigenRegistry(_dukigenRegistry);
        agentId = _agentId;
        stableCoinAddress = _stableCoinAddress;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SUBMIT POST — transparent event log
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Submit a post on-chain (user pays gas).
    ///         If boostAmount > 0, routes payment through DukigenRegistry.
    ///         Username is resolved from DukerRegistry (globally unique fullId).
    /// @param aggType           Aggregate type (2=WORKS)
    /// @param aggId             Aggregate ID (0 = create new, >0 = update existing)
    /// @param evtType           Event type enum value (1=POST_CREATED)
    /// @param data              Protobuf-serialized EventData bytes (opaque)
    /// @param boostAmount       Stablecoin amount for initial marketing boost (0 = free)
    /// @param userPreferDukiBps User's preferred DUKI split (clamped by DukigenRegistry)
    function submitPost(
        uint8 aggType,
        uint64 aggId,
        uint8 evtType,
        bytes calldata data,
        uint128 boostAmount,
        uint16 userPreferDukiBps
    ) external {
        _requireIdentity(msg.sender);
        string memory username = dukerRegistry.usernameOf(msg.sender);

        ++userSeqOf[msg.sender];

        // Route payment through DukigenRegistry if boost > 0
        if (boostAmount > 0) {
            userTotalPaid[msg.sender] += boostAmount;
            dukigenRegistry.payTo(agentId, boostAmount, userPreferDukiBps, msg.sender, stableCoinAddress);
        }

        uint64 resolvedAggId = aggId == 0 ? _nextAggId(aggType) : aggId;

        if (aggId == 0) {
            aggData[aggType][resolvedAggId] = AggData({ creator: msg.sender, createdAt: uint64(block.timestamp) });
        }

        uint64 seq = ++_evtSeq;
        emit DukerEvent(
            msg.sender,
            seq,
            username,
            userSeqOf[msg.sender],
            uint32(evtType),
            aggType,
            resolvedAggId,
            uint64(block.timestamp),
            data
        );
    }

    // TODO: re-enable after direct path is validated
    // function submitPostViaX402(...) external onlyOwner { ... }

    // ══════════════════════════════════════════════════════════════════════════
    //  COMMENT INTERNALS — shared logic
    // ══════════════════════════════════════════════════════════════════════════

    /// @dev Shared: create/delete a comment (always free — boost is a separate call).
    ///      Auto-assigns aggId if 0. Enforces 64-day comment window on parentAggId.
    function _submitComment(
        address actor,
        uint8 aggType,
        uint64 aggId,
        uint8 evtType,
        bytes calldata data,
        uint64 parentAggId
    ) internal {
        _requireIdentity(actor);
        string memory username = dukerRegistry.usernameOf(actor);

        if (parentAggId > 0) {
            uint64 parentCreated = aggData[aggType][parentAggId].createdAt;
            if (parentCreated > 0 && block.timestamp > parentCreated + COMMENT_WINDOW) {
                revert CommentWindowClosed(parentAggId);
            }
        }

        ++userSeqOf[actor];

        uint64 resolvedAggId = aggId == 0 ? _nextAggId(aggType) : aggId;

        if (aggId == 0) {
            aggData[aggType][resolvedAggId] = AggData({ creator: actor, createdAt: uint64(block.timestamp) });
        }

        uint64 seq = ++_evtSeq;
        emit DukerEvent(
            actor,
            seq,
            username,
            userSeqOf[actor],
            uint32(evtType),
            aggType,
            resolvedAggId,
            uint64(block.timestamp),
            data
        );
    }

    /// @dev Shared: boost a post or comment — routes payment through DukigenRegistry.
    function _boostItem(
        address actor,
        uint8 aggType,
        uint64 aggId,
        uint8 evtType,
        bytes calldata data,
        uint128 boostAmount,
        uint16 userPreferDukiBps
    ) internal {
        if (boostAmount == 0) revert AmountBelowMinFee(0, 1);
        _requireIdentity(actor);
        string memory username = dukerRegistry.usernameOf(actor);

        ++userSeqOf[actor];
        userTotalPaid[actor] += boostAmount;

        // Route ALL payment through DukigenRegistry
        dukigenRegistry.payTo(agentId, boostAmount, userPreferDukiBps, actor, stableCoinAddress);

        uint64 seq = ++_evtSeq;
        emit DukerEvent(
            actor,
            seq,
            username,
            userSeqOf[actor],
            uint32(evtType),
            aggType,
            aggId,
            uint64(block.timestamp),
            data
        );
    }

    /// @dev Shared: amend a comment (always free, no boost).
    ///      Enforces 64-minute amend window.
    function _amendComment(address actor, uint8 aggType, uint64 aggId, uint8 evtType, bytes calldata data) internal {
        _requireIdentity(actor);
        string memory username = dukerRegistry.usernameOf(actor);

        ++userSeqOf[actor];

        // Ownership + time-lock check
        AggData storage ad = aggData[aggType][aggId];
        if (ad.creator != actor) revert NotAggOwner(aggType, aggId);
        if (block.timestamp > ad.createdAt + AMEND_WINDOW) revert AmendWindowClosed(aggType, aggId);

        uint64 seq = ++_evtSeq;

        emit DukerEvent(
            actor,
            seq,
            username,
            userSeqOf[actor],
            uint32(evtType),
            aggType,
            aggId,
            uint64(block.timestamp),
            data
        );
    }

    /// @dev Shared: upvote a post or comment — pure social signal, always free.
    ///      agg_type identifies the target: 2=post, 3=comment.
    function _upvoteAttention(address actor, uint8 aggType, uint64 aggId, uint8 evtType, bytes calldata data) internal {
        _requireIdentity(actor);
        string memory username = dukerRegistry.usernameOf(actor);

        ++userSeqOf[actor];

        uint64 seq = ++_evtSeq;
        emit DukerEvent(
            actor,
            seq,
            username,
            userSeqOf[actor],
            uint32(evtType),
            aggType,
            aggId,
            uint64(block.timestamp),
            data
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  COMMENT — external entry points (direct path)
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Submit a comment on-chain (user pays gas). Always free.
    function submitComment(uint8 aggType, uint64 aggId, uint8 evtType, bytes calldata data, uint64 parentAggId)
        external
    {
        _submitComment(msg.sender, aggType, aggId, evtType, data, parentAggId);
    }

    /// @notice Amend (edit) a comment on-chain (user pays gas). Always free.
    function amendComment(uint8 aggType, uint64 aggId, uint8 evtType, bytes calldata data) external {
        _amendComment(msg.sender, aggType, aggId, evtType, data);
    }

    /// @notice Upvote a post or comment on-chain (user pays gas). Always free — pure social signal.
    ///         agg_type identifies the target: 2=post, 3=comment.
    function upvoteAttention(uint8 aggType, uint64 aggId, uint8 evtType, bytes calldata data) external {
        _upvoteAttention(msg.sender, aggType, aggId, evtType, data);
    }

    /// @notice Boost attention on a post or comment with stablecoin (user pays gas).
    ///         agg_type identifies the target: 2=post, 3=comment.
    ///         Pure economic signal — does not increment vote count.
    function boostAttention(
        uint8 aggType,
        uint64 aggId,
        uint8 evtType,
        bytes calldata data,
        uint128 boostAmount,
        uint16 userPreferDukiBps
    ) external {
        _boostItem(msg.sender, aggType, aggId, evtType, data, boostAmount, userPreferDukiBps);
    }

    // TODO: re-enable x402 paths after direct path is validated
    // function submitCommentViaX402(...) external onlyOwner { ... }
    // function amendCommentViaX402(...) external onlyOwner { ... }
    // function upvoteAttentionViaX402(...) external onlyOwner { ... }
    // function boostAttentionViaX402(...) external onlyOwner { ... }

    // ══════════════════════════════════════════════════════════════════════════
    //  PUBLIC VIEW
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Returns the globally unique username for `owner`, or empty string if none.
    function usernameOf(address owner) external view returns (string memory) {
        return dukerRegistry.usernameOf(owner);
    }

    /// @notice Current global event sequence number.
    function worldEvtSeq() external view returns (uint64) {
        return _evtSeq;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  OWNER ADMIN
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Update registry references and agent ID.
    function setRegistries(
        address _dukerRegistry,
        address _dukigenRegistry,
        uint256 _agentId,
        address _stableCoinAddress
    ) external onlyOwner {
        dukerRegistry = IDukerRegistry(_dukerRegistry);
        dukigenRegistry = IDukigenRegistry(_dukigenRegistry);
        agentId = _agentId;
        stableCoinAddress = _stableCoinAddress;
    }

    /// @notice Emergency withdraw any ERC-20 accidentally sent to this contract.
    function rescueERC20(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }

    // ── UUPS upgrade authorization ──────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner { }

    // ══════════════════════════════════════════════════════════════════════════
    //  INTERNAL
    // ══════════════════════════════════════════════════════════════════════════

    /// @dev Check that user has an identity in DukerRegistry.
    function _requireIdentity(address user) internal view {
        if (dukerRegistry.ownerToTokenId(user) == 0) revert NoUsername();
    }

    /// @dev Auto-increment aggregate ID counter for the given type.
    function _nextAggId(uint8 aggType) internal returns (uint64) {
        return ++aggIdCounters[aggType];
    }

    /// @dev Mark a payment nonce as used, storing who paid.
    function _markPayment(bytes32 nonce, address payer) internal {
        if (paymentPayer[nonce] != address(0)) revert PaymentAlreadyProcessed(nonce);
        paymentPayer[nonce] = payer;
    }
}
