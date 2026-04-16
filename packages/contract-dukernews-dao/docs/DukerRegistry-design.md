# DukerRegistry — 用户名 NFT 合约设计

## 1. 概述

DukerRegistry 是 Duker News 的链上用户身份合约。用户支付 USDT 铸造一个**唯一、不可转移**的用户名 NFT（Soulbound Token），作为社区身份凭证。

### 核心特性

| 特性 | 说明 |
|------|------|
| **标准** | ERC-721 (Soulbound) |
| **支付** | USDT (ERC-20, 6 decimals) |
| **唯一性** | 每个地址最多 1 个用户名，用户名全局唯一 |
| **不可转移** | `transferFrom` 被禁止，只能通过 `migrate()` 迁移 |
| **迁移** | 8 USDT + 64 天冷却期 |
| **链上元数据** | SVG 图片 + JSON metadata 全部链上生成 |

---

## 2. 合约架构

```
DukerRegistry (ERC-721 + Ownable)
├── mintUsername(name, amount)     ← 用户调用，支付 USDT 铸造
├── migrate(newWallet)            ← 用户调用，迁移到新钱包
├── usernameOf(address)           ← 查询用户名
├── nameToId(name)                ← 查询用户名是否已注册
├── tokenURI(tokenId)             ← 链上 SVG 元数据
├── setMintFee(fee)               ← Owner 管理
├── setTreasury(addr)             ← Owner 管理
└── rescueERC20(token, amount)    ← Owner 紧急提取
```

### 存储结构

```
USDT (immutable)           → 支付代币地址
treasury                   → 收款地址
mintFee                    → 最低铸造费 (默认 1 USDT)
_nextId                    → 自增 tokenId (从 1 开始)
nameToId[string → uint256] → 用户名 → tokenId
idToName[uint256 → string] → tokenId → 用户名
lastMigratedAt[uint256]    → tokenId → 上次迁移时间
totalPaid[uint256]         → tokenId → 累计支付 USDT
```

---

## 3. 用户名规则

| 规则 | 值 |
|------|-----|
| 长度 | 2–32 字符 |
| 字符集 | `a-z` `0-9` `-` |
| 禁止 | 首尾不能是 `-` |

合法示例: `alice`, `duker-news`, `web3-2024`
非法示例: `A`, `-bad`, `好的`, `too-long-name-that-exceeds-32-chars`

---

## 4. 时序图

### 4.1 铸造用户名 (mintUsername)

→ [`docs/mint_username.puml`](mint_username.puml)

Frontend 发送两笔交易：先 `approve` USDT 授权，再调用 `mintUsername` 铸造。成功后同步后端。

### 4.2 迁移钱包 (migrate)

→ [`docs/migrate_wallet.puml`](migrate_wallet.puml)

旧钱包发起，先 `approve` 8 USDT 手续费，再调用 `migrate(newWallet)`。用户名 + NFT 迁移到新地址，64 天冷却。

### 4.3 Soulbound 转移保护

→ [`docs/soulbound_block.puml`](soulbound_block.puml)

`transferFrom` / `safeTransferFrom` 全部被阻止。OpenSea 等市场无法交易。唯一的转移路径是 `migrate()`。

---

## 5. 费用结构

| 动作 | 费用 | 去向 |
|------|------|------|
| 铸造用户名 | ≥ 1 USDT (用户自选) | 100% → Treasury |
| 迁移钱包 | 8 USDT (固定) | 100% → Treasury |

> 铸造费暂时全额进 Treasury。未来接入 DUKI 经济后，可按比例分配到平台和 DUKI 国库。

---

## 6. 安全考虑

| 风险 | 对策 |
|------|------|
| 重入攻击 | USDT 是标准 ERC-20，无回调风险 |
| 前端伪造用户名 | 合约层校验唯一性 |
| NFT 被交易 | Soulbound 机制阻止 |
| 短期投机迁移 | 64 天冷却 + 8 USDT 费用 |
| Owner 权限过大 | Owner 只能改 mintFee 和 treasury，无法动用户 NFT |
| USDT 误转到合约 | rescueERC20() 紧急提取 |

---

## 7. 合约文件

| 文件 | 路径 |
|------|------|
| 合约 | [`src/DukerRegistry.sol`](file:///Users/beswarm/Developer/web3/dukernews/packages/contract-duker-dao/src/DukerRegistry.sol) |
| 测试 USDT | [`src/MockUSDT.sol`](file:///Users/beswarm/Developer/web3/dukernews/packages/contract-duker-dao/src/MockUSDT.sol) |
| 部署脚本 | [`script/DeployDukerRegistry.s.sol`](file:///Users/beswarm/Developer/web3/dukernews/packages/contract-duker-dao/script/DeployDukerRegistry.s.sol) |
| 充值脚本 | [`script/FundAccount.s.sol`](file:///Users/beswarm/Developer/web3/dukernews/packages/contract-duker-dao/script/FundAccount.s.sol) |
| 充值 CLI | [`bin/fund.sh`](file:///Users/beswarm/Developer/web3/dukernews/packages/contract-duker-dao/bin/fund.sh) |

---

## 8. 部署地址 (Anvil localhost)

| 合约 | 地址 |
|------|------|
| MockUSDT | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| DukerRegistry | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| Treasury | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
