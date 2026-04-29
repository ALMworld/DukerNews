# duker-registry-worker

Cloudflare Worker for indexing DukerRegistry + DukigenRegistry events into D1.

## Stack

- **Hono** — HTTP framework
- **ConnectRPC** — gRPC-compatible RPC layer (`@repo/dukiregistry-apidefs`)
- **D1** — Cloudflare's SQLite database
- **viem** — Ethereum tx receipt parsing

## Development

```bash
npx wrangler dev --local
```

## Local Integration Testing

Full e2e test: deploy contracts to Anvil → start worker → mint username → notify → verify queries.

### Step 1: Start Anvil

```bash
anvil --chain-id 31337
```

### Step 2: Deploy contracts

```bash
pnpm test:deploy
```
This deploys EndpointV2Mock + DukerRegistry (UUPS proxy) + MockUSDT to your local Anvil.
Addresses are saved to `scripts/.deploy-local.json`.

### Step 3: Start worker + apply schema

```bash
# Terminal 1: start worker
pnpm dev

# Terminal 2: apply D1 schema
pnpm test:schema
```

### Step 4: Run E2E test

```bash
pnpm test:e2e
```

This will:
1. Health-check the worker
2. Inject deployed addresses via `/_dev/config`
3. Approve stablecoin + mint username "alice" on Anvil
4. Notify the worker about the mint tx
5. Query `GetUsername` and verify the identity was indexed
6. Query `GetIdentitiesByToken` and verify cross-reference

### Manual testing

Use `test.http` (VS Code REST Client) for ad-hoc API calls.

## Proto / Codegen

Proto definitions live in `packages/dukiregistry-apidefs/proto/`. To regenerate:

```bash
pnpm --filter @repo/dukiregistry-apidefs build
```

## RPC Endpoints

| Service | Method | Description |
|---------|--------|-------------|
| `DukerRegistryService` | `GetUsername` | Lookup identity by wallet address |
| `DukerRegistryService` | `GetIdentitiesByToken` | Get all chain presences for a token ID |
| `DukigenRegistryService` | `GetAgent` | Query agent by ID |
| `DukigenRegistryService` | `GetAgents` | List agents (paginated) |
| `AlmWorldMinterService` | `GetAgentDeals` | List deals for an agent |
| `AlmWorldMinterService` | `GetRecentDeals` | List recent deal mint events |
| `AlmWorldMinterService` | `GetWalletDeals` | List deals involving a wallet |
| `BlockchainSyncService` | `NotifyTx` | Pull + index one tx for a `ContractType` |
| `BlockchainSyncService` | `SyncEvents` | Catch up one contract using on-chain checkpoints |

## Dev-Only Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/_dev/config` | Inject chain config at runtime (blocked in production) |
