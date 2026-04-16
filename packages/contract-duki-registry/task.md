# DukerSystem Implementation Tasks

## Scaffolding
- [x] Scaffold ONFT721 project via `npx create-lz-oapp@latest`
- [x] Review generated structure and LZ test patterns
- [x] Fix foundry.toml (solc 0.8.28, via_ir = true)
- [x] Fix hardhat.config.ts (solc 0.8.28, viaIR, cancun)

## Contract Implementation
- [x] Create `contracts/interfaces/IDukerSystemTypes.sol`
- [x] Create `contracts/interfaces/IDukerSystemEvents.sol`
- [x] Create `contracts/interfaces/IDukerSystemErrors.sol`
- [x] Create `contracts/interfaces/IDukerSystem.sol`
- [x] Create `contracts/libraries/DukerSystemTokenId.sol`
- [x] Create `contracts/DukerSystem.sol` (main contract)
- [x] Port username validation from DukerNews
- [x] Implement mint (direct + x402)
- [x] Override `_debit` / `_credit` with cooldown + identity
- [x] Implement origin-chain tracking via `updateActiveChain`
- [x] Update mock: `contracts/mocks/DukerSystemMock.sol`

## Compilation
- [x] `npx hardhat compile` — 62 files, success
- [x] `forge build` — success (lint warnings only)

## Configuration
- [x] Update `package.json` name → `contract-duker-system`
- [ ] Add matching chains to `hardhat.config.ts` (BSC, X Layer, etc.)  — DONE
- [ ] Update `layerzero.config.ts` with DukerSystem pathways — DONE
- [ ] Update deploy script → `deploy/DukerSystem.ts` — DONE
- [ ] Create `.env` from `.env.example`

## Tests (TODO - future)
- [ ] Update foundry tests for DukerSystem
- [ ] Write mint tests
- [ ] Write cross-chain migration tests
- [ ] Write 64h cooldown tests

## DukerNews Integration (future)
- [ ] Refactor DukerNews to use IDukerSystem
