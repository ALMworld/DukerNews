// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import { AgentRecord } from "./interfaces/IDukigenTypes.sol";
import { IDukigenRegistryEvents } from "./interfaces/IDukigenRegistryEvents.sol";
import { IDukigenRegistryErrors } from "./interfaces/IDukigenRegistryErrors.sol";
import { DukerNameValidator } from "./libraries/DukerNameValidator.sol";

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
///           - AgentRecord with name + originChainEid
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

    // ── State ───────────────────────────────────────────────────────────────

    /// @notice This chain's LayerZero Endpoint ID
    uint32 public immutable localChainEid;

    /// @notice Auto-incrementing agent ID counter
    uint256 private _nextAgentId;

    /// @notice agentId → agent record
    mapping(uint256 => AgentRecord) private _agents;

    /// @notice agentId → agentURI (off-chain registration file)
    mapping(uint256 => string) private _agentURIs;

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
        return _register("", _agentURI, GLOBAL_MIN_DUKI_BPS, GLOBAL_MIN_DUKI_BPS, GLOBAL_MAX_DUKI_BPS);
    }

    /// @notice ERC-8004: Register with no args. agentURI set later via setAgentURI().
    function register() external returns (uint256 agentId) {
        return _register("", "", GLOBAL_MIN_DUKI_BPS, GLOBAL_MIN_DUKI_BPS, GLOBAL_MAX_DUKI_BPS);
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
        return _register(agentName, _agentURI, defaultDukiBps, minDukiBps, maxDukiBps);
    }

    /// @notice DUKIGEN: Register with name + URI, default dukiBps.
    function register(string calldata agentName, string calldata _agentURI)
        external returns (uint256 agentId)
    {
        return _register(agentName, _agentURI, GLOBAL_MIN_DUKI_BPS, GLOBAL_MIN_DUKI_BPS, GLOBAL_MAX_DUKI_BPS);
    }

    /// @dev Shared registration logic.
    function _register(
        string memory agentName,
        string memory _agentURI,
        uint16 defaultDukiBps,
        uint16 minDukiBps,
        uint16 maxDukiBps
    ) internal returns (uint256 agentId) {
        // Name validation + uniqueness check (only if name is provided)
        if (bytes(agentName).length > 0) {
            DukerNameValidator.validate(agentName);
            if (nameToAgentId[agentName] != 0) revert AgentNameTaken(agentName);
        }

        agentId = ++_nextAgentId;
        _mint(msg.sender, agentId);

        _agents[agentId] = AgentRecord({
            name: agentName,
            originChainEid: localChainEid,
            defaultDukiBps: defaultDukiBps,
            minDukiBps: minDukiBps,
            maxDukiBps: maxDukiBps
        });

        _agentURIs[agentId] = _agentURI;
        if (bytes(agentName).length > 0) {
            nameToAgentId[agentName] = agentId;
        }
        _metadata[agentId][AGENT_WALLET_KEY] = abi.encode(msg.sender);

        // ERC-8004 standard event
        emit Registered(agentId, _agentURI, msg.sender);

        // agentWallet MetadataSet event (ERC-8004 requires this on register)
        emit MetadataSet(agentId, AGENT_WALLET_KEY, AGENT_WALLET_KEY, abi.encode(msg.sender));
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  PAY — route payments through dukiBps split (Revenue model)
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Pay an agent using the agent's default dukiBps.
    function pay(uint256 agentId, uint256 amount) external {
        AgentRecord storage agent = _agents[agentId];
        if (bytes(agent.name).length == 0 && agent.originChainEid == 0) revert AgentNotFound(agentId);
        _processPay(agentId, amount, agent.defaultDukiBps);
    }

    /// @notice Pay an agent with a custom dukiBps (within agent's allowed range).
    function pay(uint256 agentId, uint256 amount, uint16 dukiBps) external {
        AgentRecord storage agent = _agents[agentId];
        if (bytes(agent.name).length == 0 && agent.originChainEid == 0) revert AgentNotFound(agentId);
        if (dukiBps < agent.minDukiBps || dukiBps > agent.maxDukiBps) {
            revert DukiBpsOutOfRange(dukiBps, agent.minDukiBps, agent.maxDukiBps);
        }
        _processPay(agentId, amount, dukiBps);
    }

    /// @dev Shared payment logic.
    function _processPay(uint256 agentId, uint256 amount, uint16 dukiBps) internal {
        if (amount == 0) revert PaymentAmountZero();

        uint256 dukiAmount = (amount * dukiBps) / BPS_DENOMINATOR;
        uint256 agentAmount = amount - dukiAmount;

        address agentWallet = _getAgentWallet(agentId);

        // 1. Pull DUKI portion → this contract → minter → DUKI + ALM
        //    ALM yin → payer (user reputation)
        //    ALM yang → agentWallet (agent reputation)
        if (dukiAmount > 0) {
            bool ok1 = payToken.transferFrom(msg.sender, address(this), dukiAmount);
            if (!ok1) revert TransferFailed();
            minter.mint(address(payToken), msg.sender, agentWallet, dukiAmount);
        }

        // 2. Pull agent portion → directly to agentWallet
        if (agentAmount > 0) {
            bool ok2 = payToken.transferFrom(msg.sender, agentWallet, agentAmount);
            if (!ok2) revert TransferFailed();
        }

        emit PaymentProcessed(agentId, msg.sender, amount, dukiAmount, agentAmount, dukiBps);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  AGENT URI — ERC-8004 setAgentURI
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice ERC-8004: Update the agentURI (points to registration JSON).
    function setAgentURI(uint256 agentId, string calldata newURI) external {
        _requireOwnerOrApproved(agentId);
        _agentURIs[agentId] = newURI;
        emit URIUpdated(agentId, newURI, msg.sender);
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
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
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
        emit MetadataSet(agentId, AGENT_WALLET_KEY, AGENT_WALLET_KEY, abi.encode(newWallet));
    }

    /// @notice ERC-8004: Clear the agentWallet (resets to owner's address).
    function unsetAgentWallet(uint256 agentId) external {
        _requireOwnerOrApproved(agentId);
        delete _metadata[agentId][AGENT_WALLET_KEY];
        emit MetadataSet(agentId, AGENT_WALLET_KEY, AGENT_WALLET_KEY, "");
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
        return _agentURIs[agentId];
    }

    /// @notice Total number of registered agents.
    function totalAgents() external view returns (uint256) {
        return _nextAgentId;
    }

    /// @notice ERC721 tokenURI override — returns agentURI (ERC-8004 compatible).
    function tokenURI(uint256 agentId) public view override returns (string memory) {
        if (_ownerOf(agentId) == address(0)) revert AgentNotFound(agentId);
        return _agentURIs[agentId];
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
