// config.ts

import { Chain } from "viem";
import { foundry, bscTestnet, bsc } from "viem/chains";

// transport: http("https://scroll-sepolia.g.alchemy.com/v2/uCE2GudcFVqI3OS1LYgYYdP3DQKW91_I"),
const FOUNDRY_RPC_URL = 'http://127.0.0.1:8545';
// const SCROLL_SEPOLIA_RPC_URL = 'https://scroll-sepolia.g.alchemy.com/v2/uCE2GudcFVqI3OS1LYgYYdP3DQKW91_I';
// const SCROLL_MAINNET_RPC_URL = 'https://scroll-mainnet.g.alchemy.com/v2/uCE2GudcFVqI3OS1LYgYYdP3DQKW91_I';
// const BSC_TESTNET_RPC_URL = 'https://data-seed-prebsc-1-s1.binance.org:8545';
// rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
// rpcUrl: 'https://bnb-testnet.g.alchemy.com/v2/dd7jSIeEr4Lg0U1vU2IvR',
const BSC_TESTNET_RPC_URL = 'https://bsc-testnet.infura.io/v3/90a9c3e2dac3411da08f7c2830716d82';
const BSC_RPC_URL = 'https://bsc-testnet.infura.io/v3/90a9c3e2dac3411da08f7c2830716d82';


const RPC_MAP = {
    "dev": { url: FOUNDRY_RPC_URL, startBlock: 0n },
    "test": { url: BSC_TESTNET_RPC_URL, startBlock: 64876514n },
    "prod": { url: BSC_RPC_URL, startBlock: 64876514n }
} as Record<string, { url: string, startBlock: bigint }>;



const CONTRACT_ADDRESS_MAP = {
    "dev": '0x8ce361602B935680E8DeC218b820ff5056BeB7af'.toLowerCase(),
    // "test": '0x62c57183174b02ab245471b5e72d86f2112aa428'.toLowerCase(),
    "test": '0xd492fa94aeab32280b34ac1540bba5971354a42a'.toLowerCase(),
    "prod": '0x9E51ad791feF3f217495Eb140d9c9Eb88cAA55bF'.toLowerCase(),
} as Record<string, `0x${string}`>;

const CHAIN_MAP = {
    "dev": foundry,
    "test": bscTestnet,
    "prod": bsc,
    "bsc-test": bscTestnet
} as Record<string, Chain>;

// const ENV: string = "dev";
// const ENV: string = "prod";
const ENV: string = "test";

export const CONFIG = {
    NONCE_TTL: 5 * 60, // 5 minutes in seconds
    NONCE_VALUE: "1",
    CACHE_TTL: 5 * 60, // 5 minutes in seconds
    COOKIE_NAME: 'auth_session',
    CONTRACT_ADDRESS: CONTRACT_ADDRESS_MAP[ENV],
    JWT_EXPIRY: 7 * 24 * 60 * 60, // 7 days in seconds
    RPC_URL: RPC_MAP[ENV].url,
    START_BLOCK: RPC_MAP[ENV].startBlock,
    CHAIN: CHAIN_MAP[ENV],
    ENV: ENV,
    IS_PROD: ENV === "prod",
    PROJECT_ID: '7afe6e71378d47cf212a953744904176',
    // SCRAPER_URL is now dynamic, accessed via env.SCRAPER_URL in the worker context
    // This static default is a fallback for local dev if not provided in .dev.vars
    DEFAULT_SCRAPER_URL: 'http://47.79.144.12:8000',
    MAX_ALLOWED_DELAY_EVENTS_COUNT: 1000n,
    MAX_BATCH_EVENTS_COUNT: 1000n
} as const;

export const CTX_JWT_PAYLOAD = 'jwtPayload';  // Use this instead of CTX_USER