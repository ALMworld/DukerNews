// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import { AgentRecord, ProductType, DukiType } from "./interfaces/IDukigenTypes.sol";
import { IDukigenRegistryEvents } from "./interfaces/IDukigenRegistryEvents.sol";
import { IDukigenRegistryErrors } from "./interfaces/IDukigenRegistryErrors.sol";
import { AgentNameValidator } from "./libraries/AgentNameValidator.sol";

/// @notice Minimal interface for AlmWorldDukiMinter.
interface IAlmWorldDukiMinter {
    function mint(address token, address yinReceiver, address yangReceiver, uint256 amount) external;
}

/// @title DukigenRegistry
/// @notice On-chain agent/dApp registry + payment router for the DUKIGEN ecosystem.
///         Conforms to ERC-8004 (Trustless Agents) Identity Registry standard
///         with DUKIGEN-specific payment extensions.
///
///         ERC-8004 compliance:
///           - ERC-721 NFT for agent identity
///           - agentURI → registration JSON
///           - getMetadata / setMetadata KV store
///           - agentWallet with EIP-712 signature verification
///           - Standard events: Registered, URIUpdated, MetadataSet
///
///         DUKIGEN extensions:
///           - dukiBps split configuration (min/max/default)
///           - pay() routes payments through DUKI ecosystem
///           - Unified DukigenEvent log with global evtSeq
///           - Works metadata: productType, dukiType, pledgeUrl, tags
contract DukigenRegistry is ERC721, EIP712, Ownable, IDukigenRegistryEvents, IDukigenRegistryErrors {

    // ── Constants ───────────────────────────────────────────────────────────

    uint16 public constant BPS_DENOMINATOR = 10000;
    uint16 public constant GLOBAL_MIN_DUKI_BPS = 5000;  // 50% minimum to DUKI ecosystem
    uint16 public constant GLOBAL_MAX_DUKI_BPS = 9900;  // 99% maximum to DUKI ecosystem

    /// @dev Reserved metadata key for agent wallet address.
    string private constant AGENT_WALLET_KEY = "agentWallet";

    /// @dev EIP-712 typehash for SetAgentWallet authorization.
    bytes32 public constant SET_AGENT_WALLET_TYPEHASH =
        keccak256("SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)");

    // ── Event type constants ────────────────────────────────────────────────

    uint32 private constant EVT_AGENT_REGISTERED      = 1;
    uint32 private constant EVT_AGENT_URI_UPDATED     = 2;
    uint32 private constant EVT_AGENT_DUKI_BPS_SET    = 3;
    uint32 private constant EVT_AGENT_WORKS_DATA_SET  = 4;
    uint32 private constant EVT_AGENT_METADATA_SET    = 5;
    uint32 private constant EVT_AGENT_WALLET_SET      = 6;
    uint32 private constant EVT_AGENT_WALLET_UNSET    = 7;
    uint32 private constant EVT_PAYMENT_PROCESSED     = 8;

    // ── State ───────────────────────────────────────────────────────────────

    /// @notice This chain's LayerZero Endpoint ID
    uint32 public immutable localChainEid;

    /// @notice Auto-incrementing agent ID counter
    uint256 private _nextAgentId;

    /// @notice Global event sequence counter (monotonic)
    uint64 private _evtSeq;

    /// @notice agentId → agent record (includes agentURI, works metadata)
    mapping(uint256 => AgentRecord) private _agents;

    /// @notice agent name → agentId (uniqueness check)
    mapping(string => uint256) public nameToAgentId;

    /// @notice agentId → key → value (on-chain KV metadata, ERC-8004 style)
    mapping(uint256 => mapping(string => bytes)) private _metadata;

    // ── Payment infrastructure ──────────────────────────────────────────────

    /// @notice The stablecoin used for payments (e.g., USDT)
    IERC20 public payToken;

    /// @notice AlmWorldDukiMinter — converts stablecoin into DUKI + ALM
    IAlmWorldDukiMinter public minter;

    // ── Constructor ─────────────────────────────────────────────────────────

    constructor(
        string memory _name,
        string memory _symbol,
        address _delegate,
        uint32 _localChainEid,
        address _payToken,
        address _minter
    ) ERC721(_name, _symbol) EIP712(_name, "1") Ownable(_delegate) {
        localChainEid = _localChainEid;
        payToken = IERC20(_payToken);
        minter = IAlmWorldDukiMinter(_minter);

        // Pre-approve minter to spend payToken
        IERC20(_payToken).approve(_minter, type(uint256).max);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  REGISTER — ERC-8004 compatible registration
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice ERC-8004: Register with agentURI only. Uses default dukiBps.
    function register(string calldata _agentURI) external returns (uint256 agentId) {
        string[] memory emptyTags = new string[](0);
        return _register("", _agentURI, GLOBAL_MIN_DUKI_BPS, GLOBAL_MIN_DUKI_BPS, GLOBAL_MAX_DUKI_BPS,
            ProductType.UNSPECIFIED, DukiType.UNSPECIFIED, "", emptyTags);
    }

    /// @notice ERC-8004: Register with no args. agentURI set later via setAgentURI().
    function register() external returns (uint256 agentId) {
        string[] memory emptyTags = new string[](0);
        return _register("", "", GLOBAL_MIN_DUKI_BPS, GLOBAL_MIN_DUKI_BPS, GLOBAL_MAX_DUKI_BPS,
            ProductType.UNSPECIFIED, DukiType.UNSPECIFIED, "", emptyTags);
    }

    /// @notice DUKIGEN: Register with name, URI, and custom dukiBps configuration.
    function register(
        string calldata agentName,
        string calldata _agentURI,
        uint16 defaultDukiBps,
        uint16 minDukiBps,
        uint16 maxDukiBps
    ) external returns (uint256 agentId) {
        _validateDukiBpsConfig(minDukiBps, maxDukiBps, defaultDukiBps);
        string[] memory emptyTags = new string[](0);
        return _register(agentName, _agentURI, defaultDukiBps, minDukiBps, maxDukiBps,
            ProductType.UNSPECIFIED, DukiType.UNSPECIFIED, "", emptyTags);
    }

    /// @notice DUKIGEN: Register with name + URI, default dukiBps.
    function register(string calldata agentName, string calldata _agentURI)
        external returns (uint256 agentId)
    {
        string[] memory emptyTags = new string[](0);
        return _register(agentName, _agentURI, GLOBAL_MIN_DUKI_BPS, GLOBAL_MIN_DUKI_BPS, GLOBAL_MAX_DUKI_BPS,
            ProductType.UNSPECIFIED, DukiType.UNSPECIFIED, "", emptyTags);
    }

    /// @notice DUKIGEN: Full registration with works metadata.
    function register(
        string calldata agentName,
        string calldata _agentURI,
        uint16 defaultDukiBps,
        uint16 minDukiBps,
        uint16 maxDukiBps,
        ProductType productType,
        DukiType dukiType,
        string calldata pledgeUrl,
        string[] calldata tags
    ) external returns (uint256 agentId) {
        _validateDukiBpsConfig(minDukiBps, maxDukiBps, defaultDukiBps);
        return _register(agentName, _agentURI, defaultDukiBps, minDukiBps, maxDukiBps,
            productType, dukiType, pledgeUrl, tags);
    }

    /// @dev Shared registration logic.
    function _register(
        string memory agentName,
        string memory _agentURI,
        uint16 defaultDukiBps,
        uint16 minDukiBps,
        uint16 maxDukiBps,
        ProductType productType,
        DukiType dukiType,
        string memory pledgeUrl,
        string[] memory tags
    ) internal returns (uint256 agentId) {
        // Name validation + uniqueness check (only if name is provided)
        if (bytes(agentName).length > 0) {
            AgentNameValidator.validate(agentName);
            if (nameToAgentId[agentName] != 0) revert AgentNameTaken(agentName);
        }

        agentId = ++_nextAgentId;
        _mint(msg.sender, agentId);

        _agents[agentId] = AgentRecord({
            name: agentName,
            agentURI: _agentURI,
            originChainEid: localChainEid,
            defaultDukiBps: defaultDukiBps,
            minDukiBps: minDukiBps,
            maxDukiBps: maxDukiBps,
            productType: productType,
            dukiType: dukiType,
            pledgeUrl: pledgeUrl,
            tags: tags
        });

        if (bytes(agentName).length > 0) {
            nameToAgentId[agentName] = agentId;
        }
        _metadata[agentId][AGENT_WALLET_KEY] = abi.encode(msg.sender);

        // ERC-8004 standard events
        emit Registered(agentId, _agentURI, msg.sender);
        emit MetadataSet(agentId, AGENT_WALLET_KEY, AGENT_WALLET_KEY, abi.encode(msg.sender));

        // Unified DukigenEvent
        _emitEvent(agentId, EVT_AGENT_REGISTERED, msg.sender,
            abi.encode(AgentRegisteredData({ name: agentName, agentURI: _agentURI })));
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  PAY — route payments through dukiBps split
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Pay an agent on behalf of `payer` using a specified stablecoin.
    ///         `payer` must have approved this registry for `stableCoinAddress`.
    ///         userPreferDukiBps is clamped to the agent's min/max range.
    /// @param agentId              Registered agent receiving payment
    /// @param amount               Stablecoin amount (native decimals)
    /// @param userPreferDukiBps    User's preferred DUKI split (clamped to agent's range)
    /// @param payer                Wallet to pull stablecoin from
    /// @param stableCoinAddress    ERC-20 stablecoin to use for this payment
    function payTo(
        uint256 agentId,
        uint256 amount,
        uint16 userPreferDukiBps,
        address payer,
        address stableCoinAddress
    ) external {
        AgentRecord storage agent = _agents[agentId];
        if (bytes(agent.name).length == 0 && agent.originChainEid == 0) revert AgentNotFound(agentId);
        uint16 finalBps = _clampBps(userPreferDukiBps, agent.minDukiBps, agent.maxDukiBps);
        _processPay(agentId, amount, finalBps, payer, stableCoinAddress);
    }

    /// @dev Clamp user preference to agent's allowed range.
    function _clampBps(uint16 userPref, uint16 minBps, uint16 maxBps) internal pure returns (uint16) {
        if (userPref < minBps) return minBps;
        if (userPref > maxBps) return maxBps;
        return userPref;
    }

    /// @dev Shared payment logic.
    ///      REVENUE_SHARE: split via dukiBps — DUKI portion goes to minter (real-time DUKI minting).
    ///      PROFIT_SHARE:  100% goes to agentWallet — agent pledges profit-share separately.
    /// @param payer              The wallet to pull stablecoin from
    /// @param stableCoinAddress  The ERC-20 stablecoin used for this payment
    function _processPay(
        uint256 agentId,
        uint256 amount,
        uint16 dukiBps,
        address payer,
        address stableCoinAddress
    ) internal {
        if (amount == 0) revert PaymentAmountZero();

        IERC20 token = IERC20(stableCoinAddress);
        address agentWallet = _getAgentWallet(agentId);
        AgentRecord storage agent = _agents[agentId];

        uint256 dukiAmount;
        uint256 agentAmount;

        if (agent.dukiType == DukiType.PROFIT_SHARE) {
            // PROFIT_SHARE: 100% → agentWallet (no automatic DUKI minting)
            // Agent contributes DUKI share from profits off-chain/periodically
            dukiAmount = 0;
            agentAmount = amount;

            bool ok = token.transferFrom(payer, agentWallet, amount);
            if (!ok) revert TransferFailed();
        } else {
            // REVENUE_SHARE (default): dukiBps split with real-time DUKI minting
            dukiAmount = (amount * dukiBps) / BPS_DENOMINATOR;
            agentAmount = amount - dukiAmount;

            // 1. Pull DUKI portion → this contract → minter → DUKI + ALM
            //    ALM yin → payer (user reputation)
            //    ALM yang → agentWallet (agent reputation)
            if (dukiAmount > 0) {
                bool ok1 = token.transferFrom(payer, address(this), dukiAmount);
                if (!ok1) revert TransferFailed();
                minter.mint(stableCoinAddress, payer, agentWallet, dukiAmount);
            }

            // 2. Pull agent portion → directly to agentWallet
            if (agentAmount > 0) {
                bool ok2 = token.transferFrom(payer, agentWallet, agentAmount);
                if (!ok2) revert TransferFailed();
            }
        }

        // ERC-8004 extension event
        emit PaymentProcessed(agentId, payer, amount, dukiAmount, agentAmount, dukiBps);

        // Unified DukigenEvent
        _emitEvent(agentId, EVT_PAYMENT_PROCESSED, payer,
            abi.encode(PaymentProcessedData({
                amount: amount,
                dukiAmount: dukiAmount,
                agentAmount: agentAmount,
                dukiBps: dukiBps
            })));
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  AGENT URI — ERC-8004 setAgentURI
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice ERC-8004: Update the agentURI (points to registration JSON).
    function setAgentURI(uint256 agentId, string calldata newURI) external {
        _requireOwnerOrApproved(agentId);
        _agents[agentId].agentURI = newURI;

        // ERC-8004 standard event
        emit URIUpdated(agentId, newURI, msg.sender);

        // Unified DukigenEvent
        _emitEvent(agentId, EVT_AGENT_URI_UPDATED, msg.sender,
            abi.encode(AgentURIUpdatedData({ newURI: newURI })));
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  DUKI BPS — update the split configuration
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice DUKIGEN: Update the dukiBps configuration for an agent.
    function setDukiBps(uint256 agentId, uint16 defaultDukiBps, uint16 minDukiBps, uint16 maxDukiBps)
        external
    {
        _requireOwnerOrApproved(agentId);
        _validateDukiBpsConfig(minDukiBps, maxDukiBps, defaultDukiBps);

        AgentRecord storage agent = _agents[agentId];
        agent.defaultDukiBps = defaultDukiBps;
        agent.minDukiBps = minDukiBps;
        agent.maxDukiBps = maxDukiBps;

        // Unified DukigenEvent
        _emitEvent(agentId, EVT_AGENT_DUKI_BPS_SET, msg.sender,
            abi.encode(AgentDukiBpsSetData({
                defaultDukiBps: defaultDukiBps,
                minDukiBps: minDukiBps,
                maxDukiBps: maxDukiBps
            })));
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  WORKS DATA — update works-specific metadata
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice DUKIGEN: Update works metadata fields for an existing agent.
    function setWorksData(
        uint256 agentId,
        ProductType productType,
        DukiType dukiType,
        string calldata pledgeUrl,
        string[] calldata tags
    ) external {
        _requireOwnerOrApproved(agentId);
        AgentRecord storage agent = _agents[agentId];
        agent.productType = productType;
        agent.dukiType = dukiType;
        agent.pledgeUrl = pledgeUrl;
        agent.tags = tags;

        // Unified DukigenEvent
        _emitEvent(agentId, EVT_AGENT_WORKS_DATA_SET, msg.sender,
            abi.encode(AgentWorksDataSetData({
                productType: productType,
                dukiType: dukiType,
                pledgeUrl: pledgeUrl,
                tags: tags
            })));
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  METADATA — ERC-8004 on-chain KV store
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice ERC-8004: Set on-chain metadata. Cannot set reserved key "agentWallet".
    function setMetadata(uint256 agentId, string calldata metadataKey, bytes calldata metadataValue)
        external
    {
        _requireOwnerOrApproved(agentId);
        if (_isReservedKey(metadataKey)) revert ReservedMetadataKey(metadataKey);
        _metadata[agentId][metadataKey] = metadataValue;

        // ERC-8004 standard event
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);

        // Unified DukigenEvent
        _emitEvent(agentId, EVT_AGENT_METADATA_SET, msg.sender,
            abi.encode(AgentMetadataSetData({ key: metadataKey, value: metadataValue })));
    }

    /// @notice ERC-8004: Get on-chain metadata for an agent.
    function getMetadata(uint256 agentId, string calldata metadataKey)
        external view returns (bytes memory)
    {
        return _metadata[agentId][metadataKey];
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  AGENT WALLET — ERC-8004 with EIP-712 signature verification
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice ERC-8004: Set agentWallet with EIP-712 signature from newWallet.
    ///         The new wallet must sign a typed message proving control.
    ///         Supports both EOA (ECDSA) and smart contract wallets (ERC-1271).
    /// @param agentId    The agent to update
    /// @param newWallet  The new wallet address
    /// @param deadline   Signature expiry timestamp
    /// @param signature  EIP-712 signature from newWallet
    function setAgentWallet(
        uint256 agentId,
        address newWallet,
        uint256 deadline,
        bytes calldata signature
    ) external {
        _requireOwnerOrApproved(agentId);
        if (block.timestamp > deadline) revert SignatureExpired();

        // Verify EIP-712 signature from newWallet
        bytes32 structHash = keccak256(
            abi.encode(SET_AGENT_WALLET_TYPEHASH, agentId, newWallet, deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        if (!SignatureChecker.isValidSignatureNow(newWallet, digest, signature)) {
            revert InvalidSignature();
        }

        _metadata[agentId][AGENT_WALLET_KEY] = abi.encode(newWallet);

        // ERC-8004 standard event
        emit MetadataSet(agentId, AGENT_WALLET_KEY, AGENT_WALLET_KEY, abi.encode(newWallet));

        // Unified DukigenEvent
        _emitEvent(agentId, EVT_AGENT_WALLET_SET, msg.sender,
            abi.encode(AgentWalletSetData({ newWallet: newWallet })));
    }

    /// @notice ERC-8004: Clear the agentWallet (resets to owner's address).
    function unsetAgentWallet(uint256 agentId) external {
        _requireOwnerOrApproved(agentId);
        delete _metadata[agentId][AGENT_WALLET_KEY];

        // ERC-8004 standard event
        emit MetadataSet(agentId, AGENT_WALLET_KEY, AGENT_WALLET_KEY, "");

        // Unified DukigenEvent
        _emitEvent(agentId, EVT_AGENT_WALLET_UNSET, msg.sender, "");
    }

    /// @notice ERC-8004: Get the agent's wallet address (defaults to owner if unset).
    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _getAgentWallet(agentId);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  PUBLIC VIEW
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Check if an agentId is registered.
    function isRegistered(uint256 agentId) external view returns (bool) {
        return agentId > 0 && agentId <= _nextAgentId && _ownerOf(agentId) != address(0);
    }

    /// @notice Get the full agent record.
    function getAgent(uint256 agentId) external view returns (AgentRecord memory) {
        if (_ownerOf(agentId) == address(0)) revert AgentNotFound(agentId);
        return _agents[agentId];
    }

    /// @notice Get the agent's registration URI (ERC-8004: agentURI).
    function agentURI(uint256 agentId) external view returns (string memory) {
        return _agents[agentId].agentURI;
    }

    /// @notice Total number of registered agents.
    function totalAgents() external view returns (uint256) {
        return _nextAgentId;
    }

    /// @notice Current global event sequence number.
    function worldEvtSeq() external view returns (uint64) {
        return _evtSeq;
    }

    /// @notice ERC721 tokenURI override — returns agentURI (ERC-8004 compatible).
    function tokenURI(uint256 agentId) public view override returns (string memory) {
        if (_ownerOf(agentId) == address(0)) revert AgentNotFound(agentId);
        return _agents[agentId].agentURI;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  OWNER ADMIN
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Update the minter address. Re-approves payToken.
    function setMinter(address _minter) external onlyOwner {
        if (address(minter) != address(0)) {
            payToken.approve(address(minter), 0);
        }
        minter = IAlmWorldDukiMinter(_minter);
        payToken.approve(_minter, type(uint256).max);
    }

    /// @notice Approve a stablecoin for the minter (enables multi-stablecoin payments).
    ///         Must be called for each new stablecoin before it can be used with payTo().
    function approveTokenForMinter(address token) external onlyOwner {
        IERC20(token).approve(address(minter), type(uint256).max);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  ERC721 HOOKS — clear agentWallet on transfer (ERC-8004 requirement)
    // ══════════════════════════════════════════════════════════════════════════

    /// @dev ERC-8004: When agent NFT is transferred, agentWallet is automatically
    ///      cleared and must be re-verified by the new owner.
    function _update(address to, uint256 tokenId, address auth)
        internal override returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            delete _metadata[tokenId][AGENT_WALLET_KEY];
        }
        return super._update(to, tokenId, auth);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  INTERNAL
    // ══════════════════════════════════════════════════════════════════════════

    /// @dev Emit the unified DukigenEvent with auto-incrementing evtSeq.
    function _emitEvent(
        uint256 agentId,
        uint32 eventType,
        address ego,
        bytes memory eventData
    ) internal {
        uint64 seq = ++_evtSeq;
        emit DukigenEvent(agentId, seq, eventType, ego, uint64(block.timestamp), eventData);
    }

    function _requireOwnerOrApproved(uint256 agentId) internal view {
        if (_ownerOf(agentId) == address(0)) revert AgentNotFound(agentId);
        if (ownerOf(agentId) != msg.sender && getApproved(agentId) != msg.sender
            && !isApprovedForAll(ownerOf(agentId), msg.sender))
        {
            revert NotAgentOwner(agentId);
        }
    }

    function _isReservedKey(string calldata key) internal pure returns (bool) {
        return keccak256(bytes(key)) == keccak256(bytes(AGENT_WALLET_KEY));
    }

    function _validateDukiBpsConfig(uint16 min, uint16 max, uint16 defaultBps) internal pure {
        if (min < GLOBAL_MIN_DUKI_BPS || max > GLOBAL_MAX_DUKI_BPS
            || min > max || defaultBps < min || defaultBps > max)
        {
            revert InvalidDukiBpsConfig(min, max, defaultBps);
        }
    }

    function _getAgentWallet(uint256 agentId) internal view returns (address) {
        bytes memory walletBytes = _metadata[agentId][AGENT_WALLET_KEY];
        if (walletBytes.length == 0) return ownerOf(agentId);
        return abi.decode(walletBytes, (address));
    }
}
