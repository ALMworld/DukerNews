// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IDukerNewsEvents } from "./interfaces/IDukerNewsEvents.sol";
import { IDukerNewsErrors } from "./interfaces/IDukerNewsErrors.sol";
import { AggData } from "./interfaces/IDukerNewsTypes.sol";

/// @notice Minimal interface for DukerRegistry (identity layer).
interface IDukerRegistry {
    function ownerToTokenId(address owner) external view returns (uint256);
    function usernameOf(address owner) external view returns (string memory);
    function mintUsernameTo(address to, string calldata displayName, uint256 amount, address stableCoinAddress, uint256 agentId) external;
}

/// @notice Minimal interface for AlmWorldDukiMinter (payment layer).
interface IAlmWorldDukiMinter {
    function mint(address token, address yangReceiver, address yinReceiver, uint256 amount, uint256 agentId) external;
}

/// @title DukerNews (UUPS Upgradeable)
/// @notice Transparent event log + payment delegator for Duker News.
///
///         Identity is resolved from DukerRegistry (cross-chain soulbound NFT).
///         Payments are routed through AlmWorldDukiMinter (DUKI/ALM minting).
///
///         Direct path (user has gas):
///           - submitPost() / submitComment() / boostAttention() — user calls directly
///
///         x402 path — commented out for initial integration.
contract DukerNews is OwnableUpgradeable, UUPSUpgradeable, IDukerNewsEvents, IDukerNewsErrors {
    using SafeERC20 for IERC20;

    // ── Constants ───────────────────────────────────────────────────────────

    uint256 public constant AMEND_WINDOW = 64 minutes;
    uint256 public constant COMMENT_WINDOW = 64 days;

    // ── Registry delegation ─────────────────────────────────────────────────

    /// @notice DukerRegistry — cross-chain identity resolution
    IDukerRegistry public dukerRegistry;

    /// @notice AlmWorldDukiMinter — payment routing + DUKI/ALM minting
    IAlmWorldDukiMinter public almWorldDukiMinter;

    /// @notice This dApp's registered agent ID in DukigenRegistry
    uint256 public agentId;

    /// @notice Default dealDukiBps for this dApp (5% = 500 bps).
    ///         Controls the DUKI ecosystem share for payments routed through DukerNews.
    uint16 public defaultDealDukiBps;

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


    // ── Storage gap for upgradeable contracts ────────────────────────────────
    uint256[64] private __gap;

    // ── Initializer (replaces constructor) ──────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _dukerRegistry,
        address _almWorldDukiMinter,
        uint256 _agentId
    ) external initializer {
        __Ownable_init(msg.sender);

        dukerRegistry = IDukerRegistry(_dukerRegistry);
        almWorldDukiMinter = IAlmWorldDukiMinter(_almWorldDukiMinter);
        agentId = _agentId;
        defaultDealDukiBps = 500; // 5% default
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  MINT USERNAME — create identity + payment
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Mint a username via DukerRegistry with payment through AlmWorldDukiMinter.
    ///         The caller (msg.sender) pays; the identity NFT + yin ALM goes to `to`.
    /// @param to                Address to receive the identity (yin)
    /// @param displayName      Desired display name (e.g., "alice")
    /// @param amount            Stablecoin amount (must be > 0)
    /// @param stableCoin        ERC-20 stablecoin address
    function mintUsername(
        address to,
        string calldata displayName,
        uint128 amount,
        address stableCoin
    ) external {
        // DukerRegistry handles payment + identity minting atomically.
        // User must have approved stablecoin to DukerRegistry before calling.
        dukerRegistry.mintUsernameTo(to, displayName, amount, stableCoin, agentId);

        // Resolve token ID from the freshly minted identity
        uint256 tokenId = dukerRegistry.ownerToTokenId(to);
        string memory username = dukerRegistry.usernameOf(to);

        ++userSeqOf[to];

        // Emit event with payment data
        uint64 seq = ++_evtSeq;
        emit DukerEvent(
            to,
            seq,
            username,
            userSeqOf[to],
            21, // USER_MINTED
            1,  // aggType = USER
            uint64(tokenId),
            uint64(block.timestamp),
            abi.encode(UsernameMintedData({
                tokenId: tokenId,
                username: username,
                amount: amount,
                dealDukiBps: defaultDealDukiBps
            }))
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SUBMIT POST — transparent event log
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Submit a post on-chain (user pays gas).
    ///         If boostAmount > 0, routes payment through AlmWorldDukiMinter.
    /// @param aggType         Aggregate type (2=WORKS)
    /// @param aggId           Aggregate ID (0 = create new, >0 = update existing)
    /// @param evtType         Event type enum value (1=POST_CREATED)
    /// @param data            Protobuf-serialized EventData bytes (opaque)
    /// @param boostAmount     Stablecoin amount for initial marketing boost (0 = free)
    /// @param stableCoin      ERC-20 stablecoin address (ignored if boostAmount == 0)
    function submitPost(
        uint8 aggType,
        uint64 aggId,
        uint8 evtType,
        bytes calldata data,
        uint128 boostAmount,
        address stableCoin
    ) external {
        _requireIdentity(msg.sender);
        string memory username = dukerRegistry.usernameOf(msg.sender);

        ++userSeqOf[msg.sender];

        // Route payment through AlmWorldDukiMinter if boost > 0
        if (boostAmount > 0) {
            _routePayment(msg.sender, boostAmount, stableCoin);
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

    /// @dev Shared: boost a post or comment — routes payment through AlmWorldDukiMinter.
    function _boostItem(
        address actor,
        uint8 aggType,
        uint64 aggId,
        uint8 evtType,
        bytes calldata data,
        uint128 boostAmount,
        address stableCoin
    ) internal {
        if (boostAmount == 0) revert AmountBelowMinFee(0, 1);
        _requireIdentity(actor);
        string memory username = dukerRegistry.usernameOf(actor);

        ++userSeqOf[actor];

        // Route ALL payment through AlmWorldDukiMinter
        _routePayment(actor, boostAmount, stableCoin);

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
    /// @param stableCoin  ERC-20 stablecoin address chosen by user
    function boostAttention(
        uint8 aggType,
        uint64 aggId,
        uint8 evtType,
        bytes calldata data,
        uint128 boostAmount,
        address stableCoin
    ) external {
        _boostItem(msg.sender, aggType, aggId, evtType, data, boostAmount, stableCoin);
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

    /// @notice Update registry references.
    function setRegistries(
        address _dukerRegistry,
        address _almWorldDukiMinter,
        uint256 _agentId
    ) external onlyOwner {
        dukerRegistry = IDukerRegistry(_dukerRegistry);
        almWorldDukiMinter = IAlmWorldDukiMinter(_almWorldDukiMinter);
        agentId = _agentId;
    }

    /// @notice Set the default DUKI ecosystem share for payments routed through DukerNews.
    function setDefaultDealDukiBps(uint16 _bps) external onlyOwner {
        defaultDealDukiBps = _bps;
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

    /// @dev Route stablecoin payment through AlmWorldDukiMinter.
    ///      Pulls stablecoin from payer, approves minter, calls mint.
    ///      yin = this contract (DukerNews treasury), yang = payer.
    function _routePayment(address payer, uint128 amount, address stableCoin) internal {
        IERC20(stableCoin).safeTransferFrom(payer, address(this), amount);
        IERC20(stableCoin).forceApprove(address(almWorldDukiMinter), amount);
        almWorldDukiMinter.mint(
            stableCoin,
            payer,         // yang — payer gets their share of ALM
            address(this), // yin — DukerNews treasury collects ALM
            amount,
            agentId
        );
    }

    /// @dev Check that user has an identity in DukerRegistry.
    function _requireIdentity(address user) internal view {
        if (dukerRegistry.ownerToTokenId(user) == 0) revert NoUsername();
    }

    /// @dev Auto-increment aggregate ID counter for the given type.
    function _nextAggId(uint8 aggType) internal returns (uint64) {
        return ++aggIdCounters[aggType];
    }
}
