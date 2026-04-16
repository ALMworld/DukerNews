// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import { IAlmWorldDukiMinter } from "./interfaces/IAlmWorldDukiMinter.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

import { IDukerNewsEvents } from "./interfaces/IDukerNewsEvents.sol";
import { IDukerNewsErrors } from "./interfaces/IDukerNewsErrors.sol";
import { UserData, AggData } from "./interfaces/IDukerNewsTypes.sol";
import { DukerNewsEventEncoder } from "./libraries/DukerNewsEventEncoder.sol";

/// @title DukerNews (UUPS Upgradeable)
/// @notice Soulbound username NFT + transparent event log for Duker News.
///         Supports Unicode usernames (Chinese, Japanese, Korean, etc.).
///
///         Direct path (user has gas):
///           - mintUsername() / submitPost()  — user calls directly, pays gas
///
///         x402 path (user has NO gas):
///           - mintUsernameViaX402() / submitPostViaX402()  — backend calls on behalf of user
///
///         Both paths emit the same DukerEvent, so the event indexer doesn't
///         need to know which path was used.
contract DukerNews is ERC721Upgradeable, OwnableUpgradeable, UUPSUpgradeable, IDukerNewsEvents, IDukerNewsErrors {
    using Strings for uint256;

    // ── Constants ───────────────────────────────────────────────────────────

    uint256 public constant MAX_DUKI_BPS = 9900; // max 99% to Treasury (min 1% to DukerNews)
    uint256 public constant MIN_DUKI_BPS = 5000; // min 50% to Treasury (max 50% to DukerNews)
    uint256 public constant MAX_NAME_BYTES = 192; // ~64 CJK chars or 192 ASCII
    uint256 public constant AMEND_WINDOW = 64 minutes;
    uint256 public constant COMMENT_WINDOW = 64 days;
    uint32 internal constant EVT_TYPE_USER_MINTED = 21;

    // ── State ───────────────────────────────────────────────────────────────

    IERC20 public usdt;
    address public treasury;
    uint256 public mintFee; // min USDT to mint (6 decimals), owner-adjustable

    uint256 private _nextId;
    uint64 private _evtSeq; // global event sequence counter

    /// @notice AlmWorldDukiMinter — converts USDT into DUKI + ALM on every payment.
    IAlmWorldDukiMinter public minter;

    /// @notice Aggregate ID counters — auto-increment per aggregate type (max 32 types)
    uint64[32] public aggIdCounters;

    /// @notice Aggregate metadata — tracks creator + creation time
    /// aggType => aggId => AggData
    mapping(uint8 => mapping(uint128 => AggData)) public aggData;

    /// username → tokenId  (1-indexed; 0 means not registered)
    mapping(string => uint256) public nameToId;

    /// @notice  tokenId → UserData containing extended metadata
    mapping(uint256 => UserData) public idToUserData;

    // NOTE: totalPaid mapping removed in V3 — replaced by idToUserData[].amount

    /// x402 payment nonce → payer address (address(0) = unused)
    mapping(bytes32 => address) public paymentPayer;

    /// address → tokenId (O(1) reverse lookup; 0 means no token)
    mapping(address => uint256) public ownerToTokenId;

    // ── Storage gap for upgradeable contracts ────────────────────────────────
    uint256[64] private __gap;

    // ── Initializer (replaces constructor) ──────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _usdt, address _treasury) external initializer {
        __ERC721_init("Duker Username", "DUKR");
        __Ownable_init(msg.sender);

        usdt = IERC20(_usdt);
        treasury = _treasury;
        mintFee = 1e6; // 1 USDT default
        _nextId = 1;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  DIRECT PATH (user has gas, calls directly)
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Mint a unique username NFT by paying USDT.
    /// @param name      Desired username (Unicode supported, 2–192 bytes).
    /// @param amount    USDT amount to pay (6 decimals). Must be >= mintFee.
    /// @param dukiBps   Basis points (0–10000) of amount allocated to platform (Duker News).
    ///                  Remainder goes to DUKI treasury.
    function mintUsername(string calldata name, uint256 amount, uint256 dukiBps) external {
        _validateMint(name, amount, dukiBps);

        // Pull USDT from caller & split
        (uint256 dukiTreasuryAmount, uint256 dukerNewsAmount) = _splitFunds(amount, dukiBps);
        if (dukiTreasuryAmount > 0) {
            usdt.transferFrom(msg.sender, address(this), dukiTreasuryAmount);
            _mintDuki(msg.sender, dukiTreasuryAmount);
        }
        if (dukerNewsAmount > 0) {
            usdt.transferFrom(msg.sender, treasury, dukerNewsAmount);
        }

        _doMint(msg.sender, name, uint128(amount), uint16(dukiBps));
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  x402 PATH (user has no gas, backend calls on behalf of user)
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Register a username via x402 payment (gasless for user).
    /// @dev    Called by backend (owner) after x402 verify+settle.
    ///         x402 settle has already transferred USDT to this contract.
    /// @param user           User's wallet address (x402 payer).
    /// @param name           Desired username (Unicode supported, 2–192 bytes).
    /// @param amount         USDT amount paid (6 decimals).
    /// @param dukiBps        Basis points (0–10000) for platform share.
    /// @param paymentNonce   x402 EIP-3009 nonce — idempotency key.
    function mintUsernameViaX402(
        address user,
        string calldata name,
        uint256 amount,
        uint256 dukiBps,
        bytes32 paymentNonce
    ) external onlyOwner {
        _markPayment(paymentNonce, user);
        if (user == address(0)) revert ZeroAddress();
        _validateMint(name, amount, dukiBps);

        // Split funds already in contract (x402 settle sent USDT here)
        (uint256 dukiTreasuryAmount, uint256 dukerNewsAmount) = _splitFunds(amount, dukiBps);
        if (dukiTreasuryAmount > 0) {
            _mintDuki(user, dukiTreasuryAmount);
        }
        if (dukerNewsAmount > 0) {
            usdt.transfer(treasury, dukerNewsAmount);
        }

        _doMint(user, name, uint128(amount), uint16(dukiBps));
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  SUBMIT POST — transparent event log
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Submit a post on-chain (user pays gas).
    ///         If boostAmount > 0, transfers USDT from caller to contract (initial marketing boost).
    ///         Username is derived on-chain from the caller's NFT.
    /// @param aggType       Aggregate type (2=WORKS)
    /// @param aggId         Aggregate ID (0 = create new, >0 = update existing)
    /// @param evtType       Event type enum value (1=POST_CREATED)
    /// @param data          Protobuf-serialized EventData bytes (opaque)
    /// @param boostAmount   USDT amount for initial marketing boost (6 decimals, 0 = free)
    function submitPost(uint8 aggType, uint64 aggId, uint8 evtType, bytes calldata data, uint128 boostAmount) external {
        uint256 tokenId = ownerToTokenId[msg.sender];
        if (tokenId == 0) revert NoUsername();
        string memory username = idToUserData[tokenId].userName;

        ++idToUserData[tokenId].userSeq;

        // Transfer USDT if initial marketing boost > 0 → mint DUKI + ALM
        if (boostAmount > 0) {
            idToUserData[tokenId].amount += boostAmount;
            bool ok = usdt.transferFrom(msg.sender, address(this), boostAmount);
            if (!ok) revert TransferFailed();
            _mintDuki(msg.sender, boostAmount);
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
            idToUserData[tokenId].userSeq,
            uint32(evtType),
            aggType,
            resolvedAggId,
            uint64(block.timestamp),
            data
        );
    }

    /// @notice Submit a post via x402 (backend pays gas on behalf of user).
    /// @param paymentNonce   Idempotency key
    function submitPostViaX402(
        address user,
        uint8 aggType,
        uint64 aggId,
        uint8 evtType,
        bytes calldata data,
        uint128 boostAmount,
        bytes32 paymentNonce
    ) external onlyOwner {
        _markPayment(paymentNonce, user);
        uint256 tokenId = ownerToTokenId[user];
        if (tokenId == 0) revert NoUsername();
        string memory username = idToUserData[tokenId].userName;

        ++idToUserData[tokenId].userSeq;

        if (boostAmount > 0) {
            idToUserData[tokenId].amount += boostAmount;
            bool ok = usdt.transferFrom(user, address(this), boostAmount);
            if (!ok) revert TransferFailed();
            _mintDuki(user, boostAmount);
        }

        uint64 resolvedAggId = aggId == 0 ? _nextAggId(aggType) : aggId;

        if (aggId == 0) {
            aggData[aggType][resolvedAggId] = AggData({ creator: user, createdAt: uint64(block.timestamp) });
        }

        uint64 seq = ++_evtSeq;
        emit DukerEvent(
            user,
            seq,
            username,
            idToUserData[tokenId].userSeq,
            uint32(evtType),
            aggType,
            resolvedAggId,
            uint64(block.timestamp),
            data
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  COMMENT INTERNALS — shared logic for direct + x402 paths
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
        uint256 tokenId = ownerToTokenId[actor];
        if (tokenId == 0) revert NoUsername();
        string memory username = idToUserData[tokenId].userName;

        if (parentAggId > 0) {
            uint64 parentCreated = aggData[aggType][parentAggId].createdAt;
            if (parentCreated > 0 && block.timestamp > parentCreated + COMMENT_WINDOW) {
                revert CommentWindowClosed(parentAggId);
            }
        }

        ++idToUserData[tokenId].userSeq;

        uint64 resolvedAggId = aggId == 0 ? _nextAggId(aggType) : aggId;

        if (aggId == 0) {
            aggData[aggType][resolvedAggId] = AggData({ creator: actor, createdAt: uint64(block.timestamp) });
        }

        uint64 seq = ++_evtSeq;
        emit DukerEvent(
            actor,
            seq,
            username,
            idToUserData[tokenId].userSeq,
            uint32(evtType),
            aggType,
            resolvedAggId,
            uint64(block.timestamp),
            data
        );
    }

    /// @dev Shared: boost a post or comment — pure USDT payment, no vote increment.
    function _boostItem(
        address actor,
        uint8 aggType,
        uint64 aggId,
        uint8 evtType,
        bytes calldata data,
        uint128 boostAmount
    ) internal {
        if (boostAmount == 0) revert AmountBelowMinFee(0, 1);
        uint256 tokenId = ownerToTokenId[actor];
        if (tokenId == 0) revert NoUsername();
        string memory username = idToUserData[tokenId].userName;

        ++idToUserData[tokenId].userSeq;
        idToUserData[tokenId].amount += boostAmount;

        bool ok = usdt.transferFrom(actor, address(this), boostAmount);
        if (!ok) revert TransferFailed();
        _mintDuki(actor, boostAmount);

        uint64 seq = ++_evtSeq;
        emit DukerEvent(
            actor,
            seq,
            username,
            idToUserData[tokenId].userSeq,
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
        uint256 tokenId = ownerToTokenId[actor];
        if (tokenId == 0) revert NoUsername();
        string memory username = idToUserData[tokenId].userName;

        // Track mutation (amend is free, no boost)
        ++idToUserData[tokenId].userSeq;

        // Ownership + time-lock check
        AggData storage ad = aggData[aggType][aggId];
        if (ad.creator != actor) revert NotAggOwner(aggType, aggId);
        if (block.timestamp > ad.createdAt + AMEND_WINDOW) revert AmendWindowClosed(aggType, aggId);

        uint64 seq = ++_evtSeq;

        emit DukerEvent(
            actor,
            seq,
            username,
            idToUserData[tokenId].userSeq,
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
        uint256 tokenId = ownerToTokenId[actor];
        if (tokenId == 0) revert NoUsername();
        string memory username = idToUserData[tokenId].userName;

        ++idToUserData[tokenId].userSeq;

        uint64 seq = ++_evtSeq;
        emit DukerEvent(
            actor,
            seq,
            username,
            idToUserData[tokenId].userSeq,
            uint32(evtType),
            aggType,
            aggId,
            uint64(block.timestamp),
            data
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  COMMENT — external entry points (direct + x402)
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Submit a comment on-chain (user pays gas). Always free.
    function submitComment(uint8 aggType, uint64 aggId, uint8 evtType, bytes calldata data, uint64 parentAggId)
        external
    {
        _submitComment(msg.sender, aggType, aggId, evtType, data, parentAggId);
    }

    /// @notice Submit a comment via x402 (backend pays gas on behalf of user).
    function submitCommentViaX402(
        address user,
        uint8 aggType,
        uint64 aggId,
        uint8 evtType,
        bytes calldata data,
        uint64 parentAggId,
        bytes32 paymentNonce
    ) external onlyOwner {
        _markPayment(paymentNonce, user);
        _submitComment(user, aggType, aggId, evtType, data, parentAggId);
    }

    /// @notice Amend (edit) a comment on-chain (user pays gas). Always free.
    function amendComment(uint8 aggType, uint64 aggId, uint8 evtType, bytes calldata data) external {
        _amendComment(msg.sender, aggType, aggId, evtType, data);
    }

    /// @notice Amend a comment via x402 (backend pays gas). Always free.
    function amendCommentViaX402(
        address user,
        uint8 aggType,
        uint64 aggId,
        uint8 evtType,
        bytes calldata data,
        bytes32 paymentNonce
    ) external onlyOwner {
        _markPayment(paymentNonce, user);
        _amendComment(user, aggType, aggId, evtType, data);
    }

    /// @notice Upvote a post or comment on-chain (user pays gas). Always free — pure social signal.
    ///         agg_type identifies the target: 2=post, 3=comment.
    function upvoteAttention(uint8 aggType, uint64 aggId, uint8 evtType, bytes calldata data) external {
        _upvoteAttention(msg.sender, aggType, aggId, evtType, data);
    }

    /// @notice Upvote a post or comment via x402 (backend pays gas). Always free.
    function upvoteAttentionViaX402(
        address user,
        uint8 aggType,
        uint64 aggId,
        uint8 evtType,
        bytes calldata data,
        bytes32 paymentNonce
    ) external onlyOwner {
        _markPayment(paymentNonce, user);
        _upvoteAttention(user, aggType, aggId, evtType, data);
    }

    /// @notice Boost attention on a post or comment with USDT (user pays gas).
    ///         agg_type identifies the target: 2=post, 3=comment.
    ///         Pure economic signal — does not increment vote count.
    function boostAttention(uint8 aggType, uint64 aggId, uint8 evtType, bytes calldata data, uint128 boostAmount)
        external
    {
        _boostItem(msg.sender, aggType, aggId, evtType, data, boostAmount);
    }

    /// @notice Boost attention via x402 (backend pays gas on behalf of user).
    function boostAttentionViaX402(
        address user,
        uint8 aggType,
        uint64 aggId,
        uint8 evtType,
        bytes calldata data,
        uint128 boostAmount,
        bytes32 paymentNonce
    ) external onlyOwner {
        _markPayment(paymentNonce, user);
        _boostItem(user, aggType, aggId, evtType, data, boostAmount);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  PUBLIC VIEW
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Returns the username owned by `owner`, or empty string if none.
    function usernameOf(address owner) external view returns (string memory) {
        uint256 tokenId = tokenOfOwner(owner);
        if (tokenId == 0) return "";
        return idToUserData[tokenId].userName;
    }

    /// @notice Returns the tokenId owned by `owner`, or 0 if none.
    function tokenOfOwner(address owner) public view returns (uint256) {
        return ownerToTokenId[owner];
    }

    // ── On-chain SVG metadata ────────────────────────────────────────────────

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert NonexistentToken(tokenId);
        UserData storage ud = idToUserData[tokenId];
        string memory name = ud.userName;
        uint256 bps = ud.dukiBps;
        if (bps == 0) bps = 9500; // fallback for pre-V3 tokens

        string memory svg = _buildSVG(name, tokenId, bps);
        string memory json = string.concat(
            '{"name":"@',
            name,
            '","description":"Duker News username NFT","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '","attributes":[{"trait_type":"Username","value":"',
            name,
            '"},',
            '{"trait_type":"Token ID","value":"',
            tokenId.toString(),
            '"},{"trait_type":"DUKI Allocation (%)","value":"',
            (bps / 100).toString(),
            '"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  OWNER ADMIN
    // ══════════════════════════════════════════════════════════════════════════

    function setMintFee(uint256 fee) external onlyOwner {
        mintFee = fee;
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
    }

    /// @notice Set the AlmWorldDukiMinter. Grants max USDT approval so mint() works.
    function setMinter(address _minter) external onlyOwner {
        if (_minter == address(0)) revert ZeroAddress();
        // Revoke previous approval if minter changes
        if (address(minter) != address(0)) {
            usdt.approve(address(minter), 0);
        }
        minter = IAlmWorldDukiMinter(_minter);
        usdt.approve(_minter, type(uint256).max);
    }

    /// @notice Emergency withdraw any ERC-20 accidentally sent to this contract.
    function rescueERC20(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(treasury, amount);
    }

    // ── UUPS upgrade authorization ──────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner { }

    // ── Soulbound: block transfers ───────────────────────────────────────────

    function transferFrom(address from, address to, uint256 tokenId) public override {
        if (msg.sender != address(this) && msg.sender != owner()) revert Soulbound();
        super.transferFrom(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public override {
        if (msg.sender != address(this) && msg.sender != owner()) revert Soulbound();
        super.safeTransferFrom(from, to, tokenId, data);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  INTERNAL
    // ══════════════════════════════════════════════════════════════════════════

    /// @dev Shared validation for mint operations.
    function _validateMint(string calldata name, uint256 amount, uint256 dukiBps) internal view {
        if (!_isValidName(name)) revert InvalidName();
        if (nameToId[name] != 0) revert NameTaken(name);
        if (amount < mintFee) revert AmountBelowMinFee(amount, mintFee);
        if (dukiBps < MIN_DUKI_BPS || dukiBps > MAX_DUKI_BPS) revert DukiBpsOutOfRange(dukiBps);
    }

    /// @dev Split amount into dukiTreasury + dukerNews portions.
    function _splitFunds(uint256 amount, uint256 dukiBps)
        internal
        pure
        returns (uint256 dukiTreasuryAmount, uint256 dukerNewsAmount)
    {
        dukiTreasuryAmount = (amount * dukiBps) / 10000;
        dukerNewsAmount = amount - dukiTreasuryAmount;
    }

    /// @dev Shared mint logic — used by both direct and x402 paths.
    ///      Emits the SAME DukerEvent so the event indexer is path-agnostic.
    function _doMint(address user, string calldata name, uint128 amount, uint16 dukiBps) internal {
        uint256 tokenId = _nextId++;
        _safeMint(user, tokenId);

        nameToId[name] = tokenId;
        ownerToTokenId[user] = tokenId;

        // Single struct-literal write — compiler packs dukiBps+userSeq+amount into 1 SSTORE
        idToUserData[tokenId] = UserData({ dukiBps: dukiBps, userSeq: 1, amount: amount, userName: name });

        // Same DukerEvent — indexer is path-agnostic
        uint64 seq = ++_evtSeq;
        emit DukerEvent(
            user,
            seq,
            name,
            1, // userSeq = 1 for freshly minted
            EVT_TYPE_USER_MINTED,
            1, // aggType = USER
            uint64(tokenId),
            uint64(block.timestamp),
            DukerNewsEventEncoder.encodeUsernameMinted(tokenId, name, amount, dukiBps)
        );
    }

    /// @dev Auto-increment aggregate ID counter for the given type
    function _nextAggId(uint8 aggType) internal returns (uint64) {
        return ++aggIdCounters[aggType];
    }

    /// @dev Mark a payment nonce as used, storing who paid.
    function _markPayment(bytes32 nonce, address payer) internal {
        if (paymentPayer[nonce] != address(0)) revert PaymentAlreadyProcessed(nonce);
        paymentPayer[nonce] = payer;
    }

    /// @dev Mint DUKI + ALM via the minter. ALM: 50% to user (yin), 50% to treasury (yang).
    function _mintDuki(address user, uint256 usdtAmount) internal {
        minter.mint(address(usdt), user, treasury, usdtAmount);
    }

    /// @dev Unicode-safe name validation using blacklist approach.
    ///      Allows all languages (CJK, Arabic, Cyrillic, etc.).
    ///      Blocks: SVG injection chars, zero-width chars, direction overrides,
    ///      ligatures, combining marks, variation selectors, and other dangerous Unicode.
    ///      See Unicode TR39 for background on identifier security.
    function _isValidName(string calldata name) internal pure returns (bool) {
        bytes memory b = bytes(name);
        uint256 len = b.length;
        if (len < 1 || len > MAX_NAME_BYTES) return false;

        // ── Rule 15: Mixed-script detection (Latin + Cyrillic cannot coexist)
        bool hasLatin;
        bool hasCyrillic;

        for (uint256 i = 0; i < len; i++) {
            uint8 c = uint8(b[i]);

            // ── Rule 1: Control characters + space (0x00-0x20)
            if (c <= 0x20) return false;

            // ── Rule 2: SVG/XML injection chars + @
            // " (0x22) & (0x26) ' (0x27) < (0x3C) > (0x3E) @ (0x40)
            if (c == 0x22 || c == 0x26 || c == 0x27 || c == 0x3C || c == 0x3E || c == 0x40) return false;

            // ── Rule 3: DEL character
            if (c == 0x7F) return false;

            // Track Latin letters for mixed-script check
            if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) {
                hasLatin = true;
            }

            // ── Multi-byte UTF-8 checks (only when high bit set)
            if (c >= 0x80 && i + 1 < len) {
                uint8 c1 = uint8(b[i + 1]);

                // Track Cyrillic (U+0400-U+04FF) → UTF-8: D0 80 — D3 BF
                if (c >= 0xD0 && c <= 0xD3) {
                    hasCyrillic = true;
                }

                // ── Rule 4: Combining diacritical marks (U+0300-U+036F)
                //    UTF-8: CC 80 — CD AF
                if (c == 0xCC) return false;
                if (c == 0xCD && c1 <= 0xAF) return false;

                // 3-byte sequences (0xE0-0xEF)
                if (c >= 0xE0 && c <= 0xEF && i + 2 < len) {
                    uint8 c2 = uint8(b[i + 2]);

                    // ── Rule 5: Zero-width chars + direction overrides (U+200x-U+206x)
                    //    UTF-8: E2 80 xx — E2 81 xx
                    if (c == 0xE2 && (c1 == 0x80 || c1 == 0x81)) return false;

                    // ── Rule 6: Enclosed alphanumerics (U+2460-U+24FF) — Ⓐ Ⓑ etc
                    //    UTF-8: E2 91 xx — E2 93 xx
                    if (c == 0xE2 && c1 >= 0x91 && c1 <= 0x93) return false;

                    // ── Rule 7: Superscripts/subscripts remainder (U+2080-U+209F)
                    //    UTF-8: E2 82 xx
                    if (c == 0xE2 && c1 == 0x82) return false;

                    // ── Rule 8: Ligatures (U+FB00-FB06) — ﬁ ﬂ etc
                    //    UTF-8: EF AC xx
                    if (c == 0xEF && c1 == 0xAC) return false;

                    // ── Rule 9: BOM (U+FEFF)
                    //    UTF-8: EF BB BF
                    if (c == 0xEF && c1 == 0xBB && c2 == 0xBF) return false;

                    // ── Rule 10: Variation selectors (U+FE00-FE0F)
                    //    UTF-8: EF B8 80-8F
                    if (c == 0xEF && c1 == 0xB8 && c2 >= 0x80 && c2 <= 0x8F) return false;

                    // ── Rule 11: Non-characters (U+FDD0-FDEF)
                    //    UTF-8: EF B7 xx
                    if (c == 0xEF && c1 == 0xB7) return false;

                    // ── Rule 12: Specials block (U+FFF0-FFFF)
                    //    UTF-8: EF BF Bx-Fx
                    if (c == 0xEF && c1 == 0xBF && c2 >= 0xB0) return false;

                    // ── Rule 13: Fullwidth Latin (U+FF00-FF60) — ａ ｂ ｃ etc
                    //    UTF-8: EF BC xx — EF BD xx
                    if (c == 0xEF && (c1 == 0xBC || c1 == 0xBD)) return false;
                }

                // ── Rule 14: Tag characters (U+E0001-E007F) — 4-byte, invisible tags
                //    UTF-8: F3 A0 xx xx
                if (c == 0xF3 && c1 == 0xA0) return false;
            }
        }

        // ── Rule 15: Reject Latin + Cyrillic mixing (homoglyph attack prevention)
        if (hasLatin && hasCyrillic) return false;

        return true;
    }

    /// @dev Count UTF-8 codepoints (characters), not bytes.
    ///      Skips continuation bytes (10xxxxxx = 0x80-0xBF).
    function _utf8CharCount(bytes memory b) internal pure returns (uint256 count) {
        for (uint256 i = 0; i < b.length; i++) {
            // A byte is a leading byte if it's NOT a continuation byte (0x80-0xBF)
            if (uint8(b[i]) & 0xC0 != 0x80) {
                count++;
            }
        }
    }

    /// @dev Dynamic font size based on character count (Unicode-aware).
    function _fontSize(uint256 charLen) internal pure returns (string memory) {
        if (charLen <= 8) return "48"; // short names: @alice, @你好世界
        if (charLen <= 14) return "36"; // medium: @dukernews_user
        if (charLen <= 20) return "26"; // long: @very_long_username
        return "20"; // very long names
    }

    // solhint-disable max-line-length
    function _buildSVG(string memory name, uint256 tokenId, uint256 dukiBps) internal pure returns (string memory) {
        string memory fontSize = _fontSize(_utf8CharCount(bytes(name)));

        string memory pctStr = "";
        if (dukiBps > 0) {
            pctStr = string.concat(unicode" · ", (dukiBps / 100).toString(), "%");
        }

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">' "<defs>"
            '<linearGradient id="bg" x1="0" y1="0" x2="500" y2="500" gradientUnits="userSpaceOnUse">'
            '<stop stop-color="#1a0533"/><stop offset="1" stop-color="#0f0a1e"/>' "</linearGradient>"
            '<linearGradient id="db" x1="0" y1="0" x2="0" y2="1">'
            '<stop stop-color="#a855f7"/><stop offset="1" stop-color="#7e22ce"/>' "</linearGradient>"
            '<linearGradient id="gd" x1="0" y1="0" x2="1" y2="1">'
            '<stop stop-color="#FFD700"/><stop offset="1" stop-color="#F0B000"/>' "</linearGradient>" "</defs>"
            '<rect width="500" height="500" rx="24" fill="url(#bg)"/>'
            '<rect x="2" y="2" width="496" height="496" rx="22" fill="none" stroke="#9333ea" stroke-width="1.5" opacity=".3"/>',
            // DUKI logo
            '<g transform="translate(250,150)scale(.16)">' '<circle r="250" fill="url(#db)"/>'
            '<circle r="225" fill="none" stroke="#d8b4fe" stroke-width="8" opacity=".3"/>'
            '<g transform="translate(-130,-195)scale(.35)">'
            '<path d="M298 950l0-30 111 0q84 0 155-27.5 71-27.5 122.5-77.5 51.5-50 80-118 28.5-68 28.5-149 0-81-28.5-149-28.5-68-80-118-51.5-50-122.5-77.5-71-27.5-155-27.5l-111 0 0-30 111 0q91 0 167 29.5 76 29.5 132 83.5 56 54 87 127.5 31 73.5 31 161.5 0 88-31 161.5-31 73.5-87 127.5-56 54-132 83.5-76 29.5-167 29.5l-111 0z m-198-519l0-285 30 0 0 285-30 0z m66 0l0-285 30 0 0 285-30 0z m66 0l0-285 30 0 0 285-30 0z m66 453l0-30 111 0q94 0 166-39 72-39 113-108.5 41-69.5 41-158.5 0-90-41-159-41-69-113-108-72-39-166-39l-111 0 0-30 111 0q103 0 182 43 79 43 124 119 45 76 45 174 0 98-45 174-45 76-124 119-79 43-182 43l-111 0z m0-66l0-30 111 0q76 0 132.5-30 56.5-30 88.5-84.5 32-54.5 32-125.5 0-72-32-126-32-54-88.5-84-56.5-30-132.5-30l-111 0 0-30 111 0q84 0 148 34 64 34 100 95 36 61 36 141 0 80-36 141-36 61-100 95-64 34-148 34l-111 0z m-288-321l0-30 399 0 0 30-399 0z m0 66l0-30 399 0 0 30-399 0z m0 66l0-30 399 0 0 30-399 0z m90 321l0-285 30 0 0 285-30 0z m66 0l0-285 30 0 0 285-30 0z m66 0l0-285 30 0 0 285-30 0z" fill="#FFD700" stroke="#FFD700" stroke-width="30" stroke-linejoin="round"/>'
            "</g></g>",
            // Text
            '<text x="250" y="235" font-family="monospace" font-size="13" fill="#9333ea" text-anchor="middle" letter-spacing="2">DUKER NEWS</text>'
            '<text x="250" y="320" font-family="monospace" font-size="',
            fontSize,
            '" font-weight="bold" fill="url(#gd)" text-anchor="middle">@',
            name,
            "</text>"
            '<text x="250" y="380" font-family="monospace" font-size="16" fill="#d8b4fe" text-anchor="middle">#',
            tokenId.toString(),
            unicode" · X Layer",
            pctStr,
            "</text></svg>"
        );
    }
    // solhint-enable max-line-length
}
