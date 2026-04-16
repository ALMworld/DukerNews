# DUKIGEN System 设计文档

> 本文档分为两部分：第一部分基于**已实现的代码**，第二部分为**未来规划**。

---

## 第一部分：DukerSystem — 用户身份层（已实现）

### 源码清单

| 文件 | 说明 |
|:---|:---|
| [DukerSystem.sol](file:///Users/beswarm/Developer/web3/dukernews/packages/contract-duker-system/contracts/DukerSystem.sol) | 主合约 (OApp + ERC721 + Soulbound) |
| [IDukerSystem.sol](file:///Users/beswarm/Developer/web3/dukernews/packages/contract-duker-system/contracts/interfaces/IDukerSystem.sol) | dApp 调用接口 |
| [IDukerSystemTypes.sol](file:///Users/beswarm/Developer/web3/dukernews/packages/contract-duker-system/contracts/interfaces/IDukerSystemTypes.sol) | DukerIdentity 结构体 |
| [IDukerSystemEvents.sol](file:///Users/beswarm/Developer/web3/dukernews/packages/contract-duker-system/contracts/interfaces/IDukerSystemEvents.sol) | 事件定义 |
| [IDukerSystemErrors.sol](file:///Users/beswarm/Developer/web3/dukernews/packages/contract-duker-system/contracts/interfaces/IDukerSystemErrors.sol) | 错误定义 |
| [DukerSystemTokenId.sol](file:///Users/beswarm/Developer/web3/dukernews/packages/contract-duker-system/contracts/libraries/DukerSystemTokenId.sol) | tokenId 编解码库 |

### 数据结构

```solidity
// IDukerSystemTypes.sol
struct DukerIdentity {
    string displayName;    // "alice" — 每条链唯一，不可修改
    uint32 originChainEid; // 首次铸造所在链的 LayerZero EID（也编码在 tokenId 里）
}
```

**tokenId 编码**: `originChainEid << 224 | localSequence` — 全局唯一。

**身份格式**: `displayName@originChainEid` — 如 `alice@30102`，类似 email。

### 合约继承

```
DukerSystem is OApp, ERC721, IDukerSystemEvents, IDukerSystemErrors
```
- `OApp` — LayerZero 跨链消息
- `ERC721` — NFT 标准（通过 `_update` override 实现 Soulbound）
- `IDukerSystemEvents` — 6 个事件
- `IDukerSystemErrors` — 9 个错误

### 状态变量

```solidity
uint32 public immutable localChainEid;           // 本链 EID
uint224 private _nextLocalSeq;                     // 自增序号
mapping(uint256 => DukerIdentity) _identities;     // tokenId → 身份记录
mapping(string => uint256) public nameToId;        // displayName → tokenId
mapping(address => uint256) public ownerToTokenId;  // 地址 → tokenId (反向索引)
mapping(bytes32 => PendingReplica) public pendingReplicas; // 待认领的跨地址投影
```

### 函数清单（代码实际状态）

#### 用户操作

| 函数 | 说明 |
|:---|:---|
| `mintUsername(displayName)` | 在本链注册身份，铸造 soulbound NFT |
| `replicateTo(dstEid)` | 将身份投影到另一条链（同地址，自动 mint） |
| `replicateTo(dstEid, toAddress)` | 将身份投影到另一条链（指定地址，需 claim） |
| `claimReplica(tokenId)` | 认领一个待定的跨地址投影 |
| `rejectReplica(tokenId)` | 拒绝一个待定的跨地址投影 |
| `burn()` | 在本链销毁身份（其他链不受影响） |
| `quoteReplicate(dstEid)` | 查询投影到目标链的 LZ 费用（同地址） |
| `quoteReplicate(dstEid, toAddress)` | 查询投影到目标链的 LZ 费用（指定地址） |

#### dApp 查询接口（IDukerSystem）

| 函数 | 返回值 |
|:---|:---|
| `ownerToTokenId(address)` | tokenId（0 = 无身份） |
| `getIdentity(tokenId)` | DukerIdentity struct |
| `displayNameOf(address)` | 显示名（"" = 无身份） |
| `fullIdOf(address)` | 完整 ID，如 "alice@30102" |
| `ownerOf(tokenId)` | NFT 持有者地址 |
| `originChainOf(tokenId)` | 出生链 EID |
| `sequenceOf(tokenId)` | 本地序号 |

#### 内部函数

| 函数 | 说明 |
|:---|:---|
| `_replicateTo(dstEid, toAddress)` | 两个 replicateTo 重载的共享实现 |
| `_quoteReplicate(dstEid, toAddress)` | 两个 quoteReplicate 重载的共享实现 |
| `_buildReplicatePayload(sender, toAddress, tokenId)` | 编码跨链消息（含 sender 用于区分同地址/跨地址） |
| `_lzReceive(...)` | LayerZero 接收端：同地址自动 mint，跨地址存 pending |
| `_mintReplica(toAddress, tokenId, displayName, originChainEid)` | 共享 mint 逻辑（auto-mint 和 claim 共用） |
| `_validateName(name)` | 用户名验证（长度、禁止@、防注入、防同形字攻击） |
| `_update(to, tokenId, auth)` | ERC721 override，强制 soulbound |

### 事件

```solidity
event UserMinted(address indexed user, uint256 indexed tokenId, string displayName, uint32 originChainEid)
event IdentityReplicateSent(address indexed user, uint256 indexed tokenId, uint32 dstChainEid)
event IdentityReplicateReceived(address indexed user, uint256 indexed tokenId, string displayName, uint32 originChainEid)
event IdentityBurned(address indexed user, uint256 indexed tokenId, uint32 chainEid)
event ReplicaPending(address indexed toAddress, uint256 indexed tokenId, string displayName, uint32 originChainEid)
event ReplicaRejected(address indexed user, uint256 indexed tokenId)
```

### 错误

```solidity
error InvalidName()
error NameTaken(string name)
error ZeroAddress()
error NoIdentity()
error NotTokenOwner(uint256 tokenId)
error NonexistentToken(uint256 tokenId)
error SoulboundToken()
error AlreadyHasIdentity()
error AlreadyReplicatedHere(uint256 tokenId)
error NoPendingReplica(uint256 tokenId)
```

### 安全机制

**Soulbound**: `_update()` 禁止除 mint/burn 以外的所有转账。

**跨地址投影防注入**:
```
replicateTo(dstEid)              → payload 含 sender == toAddress → 自动 mint
replicateTo(dstEid, toAddress)   → payload 含 sender != toAddress → 存 pendingReplicas
                                   → 接收方调用 claimReplica() 接受
                                   → 接收方调用 rejectReplica() 拒绝
```

**用户名验证** (`_validateName`):
- 长度: 1-192 bytes
- 禁止: `@` `"` `&` `'` `<` `>` 控制字符 DEL
- 防止: 零宽字符、方向覆盖符、组合附加符号
- 防同形字攻击: 禁止拉丁字母 + 西里尔字母混用

### 跨链消息格式

```solidity
// payload = abi.encode(sender, toAddress, tokenId, displayName, originChainEid)
// 类型:     (bytes32, bytes32, uint256, string, uint32)
```

### 待完成

- [ ] 编译验证
- [ ] 单元测试（mint、replicate 同地址、replicate 跨地址 + claim/reject、burn）
- [ ] 部署到测试网

---

## 第二部分：DukigenRegistry — Agent 注册表（未来规划）

> [!IMPORTANT]
> 以下内容为设计草案，**尚未编码**。

### 设计灵感

借鉴 [ERC-8004 (Trustless Agents)](https://eips.ethereum.org/EIPS/eip-8004) 的 Identity Registry 部分——链上极简（agentId + agentURI），链下丰富（JSON 注册文件描述能力）。

### 与 ERC-8004 的关系

| ERC-8004 组件 | DUKIGEN 方案 | 说明 |
|:---|:---|:---|
| Identity Registry | **DukigenRegistry** (待实现) | ERC-721 + agentURI + KV 元数据 |
| Reputation Registry | **ALMToken** (已有) | `balanceOf(agentWallet)` = 声誉 |
| Validation Registry | 暂不实现 | 未来有需要时再加 |

### Agent 注册文件格式（ERC-8004 兼容）

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "DukerNews",
  "description": "墨家兼爱精神的去中心化新闻平台",
  "image": "https://dukernews.com/logo.png",
  "services": [
    { "name": "web", "endpoint": "https://dukernews.com/" },
    { "name": "MCP", "endpoint": "https://mcp.dukernews.com/", "version": "2025-06-18" }
  ],
  "x402Support": true,
  "active": true,
  "registrations": [
    { "agentId": 1, "agentRegistry": "eip155:56:0x..." }
  ],
  "supportedTrust": ["reputation", "crypto-economic"]
}
```

### 信任层

```
"reputation"      → ALMToken.balanceOf(agentWallet)       — 已有，OFT 跨链
"crypto-economic" → DukigenRegistry.stakedAmount(agentId)  — 待实现，DUKI 质押
```

### 待设计

- [ ] IDukigenRegistry 接口定义
- [ ] DukigenRegistry 合约（ERC-721 + URIStorage + KV 元数据）
- [ ] DUKI 质押 / slash 机制
- [ ] 是否要求注册者持有 DukerSystem 身份
- [ ] 跨链投影（复用 DukerSystem 的 OApp 模式）

---

## 第三部分：生态架构（全局视图）

```
┌──────────────────────────────────────────────────────────┐
│  身份     DukerSystem       → "WHO" — 用户是谁 (已实现)   │
│  Agent   DukigenRegistry   → "WHAT" — 什么 dApp (待实现) │
│  声誉     ALMToken          → "TRUST" — 可信度 (已有)      │
│  经济     DUKIToken          → "VALUE" — 质押/结算 (已有)  │
│  基础设施  LayerZero         → 所有跨链统一走 OApp/OFT    │
└──────────────────────────────────────────────────────────┘
```

### 支付原则

各链本地稳定币收款，钱不跨链：

| 链 | 稳定币 | 注意 |
|:---|:---|:---|
| BSC | USDT (Binance-Peg) / USD1 | 18 decimals |
| X Layer | USDT0 (LayerZero OFT) | — |
| Arbitrum | USDT | 6 decimals |
| Base | USDC | 6 decimals |

> [!WARNING]
> BSC 的 Binance-Peg USDT 是 18 decimals，其他链通常是 6 decimals。支付代码必须动态读取 `decimals()`。
