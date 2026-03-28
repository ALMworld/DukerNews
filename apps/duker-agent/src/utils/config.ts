import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Load .env relative to the app root (2 levels up from src/utils/config.ts)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '..', '..', '.env')
dotenv.config({ path: envPath })

export const config = {
    apiUrl: process.env.DUKER_API_URL || 'http://localhost:3000/rpc',
    chainId: process.env.X_LAYER_CHAIN_ID || '196',
    usdtContract: process.env.USDT_CONTRACT_ADDRESS || '0x1e4a5963abfd975d8c9021ce480b4f0b4848d11d',
    dukerNewsContract: process.env.DUKERNEWS_CONTRACT_ADDRESS || '',
    /** Mint fee in USDT (human units, e.g. "1" = 1 USDT). Default: 1 */
    mintFeeUsdt: Number(process.env.MINT_FEE_USDT || '1'),
    /** DUKI treasury basis points (0-10000). Default: 7500 (75% treasury, 25% DukerNews) */
    dukiBps: Number(process.env.DUKI_BPS || '7500'),
} as const
