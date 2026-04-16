// routes/auth.ts
import { Hono, Context } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { CONFIG, CTX_JWT_PAYLOAD } from '../config';
import { Bindings, CommonResponse, createLazy, JWTPayload, NonceData, PageCacheData, ServiceLocator, HonoEnv } from '../types';
import { CacheManager, DatabaseManager } from '../managers';
import { serviceLocatorStore } from '../store-context';
import { createPublicClient, http, verifyMessage } from 'viem';
import { polygon } from 'viem/chains'
import { getClient, getExpireSecondsOfSubscription } from './contract_api';
import { corsMiddleware } from '../middleware/cors';
import { getNonceFromMessage, JSONParse, JSONStringify } from '../utils';
import {
    /* verifySignature, */
    getAddressFromMessage,
    getChainIdFromMessage,
} from '@reown/appkit-siwe';
import { Code } from '@connectrpc/connect';

// --- HMAC helpers for TRANSFER tokens ---
const TRANSFER_PREFIX = 'TRANSFER:';

async function hmacSign(secret: string, message: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacVerify(secret: string, message: string, signature: string): Promise<boolean> {
    const expected = await hmacSign(secret, message);
    return expected === signature;
}

function parseTransferMessage(message: string): { ego: string; expireAt: number } | null {
    if (!message.startsWith(TRANSFER_PREFIX)) return null;
    const parts = message.slice(TRANSFER_PREFIX.length).split(':');
    if (parts.length !== 2) return null;
    const ego = parts[0]!;
    const expireAt = parseInt(parts[1]!, 10);
    if (!ego || isNaN(expireAt)) return null;
    return { ego, expireAt };
}

const open = new Hono<HonoEnv>();

open.use('*', corsMiddleware);

open.post('/nonce', async (c) => {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const nonce = Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    await CacheManager.storeString(nonce, CONFIG.NONCE_VALUE, CONFIG.NONCE_TTL);
    // return c.text(nonce);
    let response: CommonResponse<NonceData> = { success: true, message: 'Nonce generated', data: { nonce } };
    return c.json(response);
});

// Helper to issue session cookie and return response
async function issueSession(
    c: any, ego: string, chainId: string, isNew: boolean, clientNonce: string, expirySecs?: number
): Promise<Response> {
    const jwtExpiry = expirySecs ?? CONFIG.JWT_EXPIRY;
    const resp_data: JWTPayload = {
        ego,
        chainId,
        expireAt: Math.floor(Date.now() / 1000) + jwtExpiry,
        clientNonce,
        isNew,
    };

    const token = await sign(resp_data, c.env.JWT_SECRET);
    const sameSiteSetting = (c.env.COOKIE_SAME_SITE as 'Strict' | 'Lax' | 'None' | undefined) || 'Lax';
    const domainSetting = c.env.COOKIE_DOMAIN ? c.env.COOKIE_DOMAIN : undefined;

    const isDev = c.env.ENVIRONMENT === 'development';

    setCookie(c, CONFIG.COOKIE_NAME, token, {
        httpOnly: true,
        secure: !isDev,
        sameSite: sameSiteSetting,
        domain: domainSetting,
        path: '/',
        maxAge: jwtExpiry,
    });

    return c.json({ success: true, message: 'ok', data: resp_data } as CommonResponse<JWTPayload>);
}

open.post('/login', async (c) => {
    const { message, signature } = await c.req.json();
    if (!message || !signature) {
        return c.json({ success: false, message: 'Message, signature are required' });
    }

    try {
        // --- TRANSFER login (QR code scan) ---
        const transfer = parseTransferMessage(message);
        if (transfer) {
            const valid = await hmacVerify(c.env.JWT_SECRET, message, signature);
            if (!valid) {
                return c.json({ success: false, message: 'Invalid transfer signature' });
            }
            // Check expiry
            if (transfer.expireAt < Math.floor(Date.now() / 1000)) {
                return c.json({ success: false, message: 'Transfer token expired' });
            }

            const userDbService = c.var.serviceLocator.userDbService;
            let user = await userDbService.getUser(transfer.ego);
            let is_new = false;
            if (!user) {
                user = await userDbService.createUser(transfer.ego, transfer.ego);
                is_new = true;
            }

            // Use the expiry from the transfer token
            const expirySecs = transfer.expireAt - Math.floor(Date.now() / 1000);
            return issueSession(c, transfer.ego, 'transfer', is_new, user.latest_evt_nonce, expirySecs);
        }

        // --- SIWE login (wallet) ---
        const address = getAddressFromMessage(message);
        let chainId = getChainIdFromMessage(message);
        const nonce = getNonceFromMessage(message);
        console.log('[login] address:', address, 'chainId:', chainId, 'nonce:', nonce);

        // Nonce Verification
        console.log('[login] step 1: nonce verification');
        const nonceValue = await CacheManager.retrieveString(nonce || '');
        if (!nonceValue || nonceValue !== CONFIG.NONCE_VALUE) {
            return c.json({ success: false, message: 'Invalid or expired nonce' });
        }
        await CacheManager.delete(nonce || '');

        // Verify wallet signature via viem
        const publicClient = createPublicClient({
            transport: http(
                `https://rpc.walletconnect.org/v1/?chainId=${chainId}&projectId=${CONFIG.PROJECT_ID}`
            ),
        });
        const success = await publicClient.verifyMessage({
            message,
            address: address as `0x${string}`,
            signature,
        });
        console.log('[login] step 3: verifyMessage result:', success);

        if (!success) {
            console.error('Verification failed:');
            return c.json({ success: false, message: 'Verification failed' });
        }

        // User Creation / Retrieval
        console.log('[login] step 4: getting user');
        const userDbService = c.var.serviceLocator.userDbService;
        let user = await userDbService.getUser(address);
        let is_new = false;
        if (!user) {
            user = await userDbService.createUser(address, address);
            is_new = true;
        }
        console.log('[login] step 5: issuing session');

        return issueSession(c, address, chainId, is_new, user.latest_evt_nonce);
    } catch (error) {
        console.error(error);
        return c.json({ success: false, message: 'Internal Error, please try again later' }, 200);
    }
});

open.post('/logout', async (c) => {
    const sameSiteSetting = (c.env.COOKIE_SAME_SITE as 'Strict' | 'Lax' | 'None' | undefined)
        || 'Lax';

    const domainSetting = c.env.COOKIE_DOMAIN ? c.env.COOKIE_DOMAIN : undefined;

    const isDev = c.env.ENVIRONMENT === 'development';

    deleteCookie(c, CONFIG.COOKIE_NAME, {
        path: '/',
        secure: !isDev,
        sameSite: sameSiteSetting,
        domain: domainSetting
    });
    return c.json({ success: true, message: "ok" });
});

open.post('/me', async (c) => {
    const token = getCookie(c, CONFIG.COOKIE_NAME);
    if (!token) {
        console.log('there is no token for', CONFIG.COOKIE_NAME);
        return c.json({ success: false, message: 'not login' }, 401);
    }

    try {
        const payload = await verify(token, c.env.JWT_SECRET) as JWTPayload;
        const currentTime = Math.floor(Date.now() / 1000);
        if (payload.expireAt < currentTime) {
            return c.json({ success: false, message: 'session expired' }, 401);
        }
        return c.json({ success: true, data: payload });
    } catch (err) {
        return c.json({ success: false, message: 'Invalid token' }, 401);
    }
});

/** Generate transfer token for QR code login. Requires active session. */
open.post('/me2', async (c) => {
    const token = getCookie(c, CONFIG.COOKIE_NAME);
    if (!token) {
        return c.json({ success: false, message: 'not login' }, 401);
    }

    try {
        const payload = await verify(token, c.env.JWT_SECRET) as JWTPayload;
        if (payload.expireAt < Math.floor(Date.now() / 1000)) {
            return c.json({ success: false, message: 'session expired' }, 401);
        }

        const { ttlDays = 90 } = await c.req.json().catch(() => ({ ttlDays: 90 }));
        const transferExpireAt = Math.floor(Date.now() / 1000) + ttlDays * 86400;
        const transferMessage = `${TRANSFER_PREFIX}${payload.ego}:${transferExpireAt}`;
        const transferSignature = await hmacSign(c.env.JWT_SECRET, transferMessage);

        return c.json({
            success: true,
            message: transferMessage,
            signature: transferSignature,
        });
    } catch (err) {
        return c.json({ success: false, message: 'Invalid token' }, 401);
    }
});



// // New public endpoint for fetching events by type
// open.post('/sync_events_template', async (c: Context<{ Bindings: Bindings }>) => {
//     if (true) {
//         // use it as an template
//         return c.json({ success: false, message: 'test error' }, 500);
//     }
//     const body = await c.req.json();
//     const { event_type, latest_block } = body;
//     const limit = 64; // Max limit

//     if (!latest_block) {
//         return c.json({ success: false, message: 'Missing required field: latest_block' }, 400);
//     }

//     const eventAbi = findEventAbi(event_type);
//     if (!eventAbi) {
//         return c.json({ success: false, message: `Unsupported event type: ${event_type}` }, 400);
//     }

//     const db = c.env.DB;
//     const cacheKey = `event:${event_type}:${latest_block}`;

//     try {
//         // Check cache first
//         const cachedData: { success: boolean, data: any[] } | null = await CacheManager.retrieveObject(cacheKey) as { success: boolean, data: any[] } | null;
//         if (cachedData) {
//             return c.json(cachedData);
//         }

//         // Find the latest block number stored in the DB for this event type
//         const maxBlockResult = await db.prepare(
//             `SELECT MAX(block_number) as max_block FROM dao_events WHERE event_type = ?`
//         ).bind(event_type).first<{ max_block: number | null }>();

//         const maxStoredBlock = maxBlockResult?.max_block ?? -1;

//         console.log(`Max stored block for ${event_type}: ${maxStoredBlock}, requested latest_block: ${latest_block}`);

//         // Fetch new logs from the blockchain only if latest_block is newer
//         if (latest_block > maxStoredBlock) {
//             const fromBlock = BigInt(maxStoredBlock + 1);
//             const toBlock = BigInt(latest_block); // Sync up to the provided latest block

//             console.log(`Syncing ${event_type} events from block ${fromBlock} to ${toBlock}`);

//             // Ensure we only query if the range is valid (toBlock >= fromBlock)
//             // This check might be redundant due to the outer if, but adds safety
//             if (toBlock >= fromBlock) {
//                 const client = getClient();
//                 const logs = await client.getLogs({
//                     address: CONFIG.CONTRACT_ADDRESS,
//                     event: eventAbi,
//                     fromBlock: fromBlock,
//                     toBlock: 'latest' // Use the provided latest_block as toBlock
//                 });

//                 console.log(`Fetched ${logs.length} new ${event_type} events.`);

//                 if (logs.length > 0) {
//                     // Begin transaction for all inserts
//                     await db.exec("BEGIN TRANSACTION");

//                     try {
//                         const batchSize = 100;
//                         const insertStmt = db.prepare(
//                             `INSERT OR IGNORE INTO dao_events (tx_hash, block_number, event_type, event_data) VALUES (?, ?, ?, ?)`
//                         );
//                         let batch: D1PreparedStatement[] = [];
//                         let totalInserted = 0;

//                         for (const log of logs) {
//                             // @ts-ignore - Adapt based on event structure if needed
//                             const tx_hash = log.transactionHash;
//                             const block_number = Number(log.blockNumber);
//                             const event_data = JSONStringify(log.args);

//                             batch.push(insertStmt.bind(tx_hash, block_number, event_type, event_data));

//                             if (batch.length >= batchSize) {
//                                 await db.batch(batch);
//                                 totalInserted += batch.length;
//                                 batch = [];
//                             }
//                         }

//                         if (batch.length > 0) {
//                             await db.batch(batch);
//                             totalInserted += batch.length;
//                         }

//                         // Commit the transaction
//                         await db.exec("COMMIT");
//                         console.log(`Inserted ${totalInserted} new ${event_type} events into DB in a single transaction.`);
//                     } catch (txError) {
//                         // Rollback on error
//                         console.error(`Error inserting ${event_type} events, rolling back:`, txError);
//                         await db.exec("ROLLBACK");
//                         throw txError;
//                     }
//                 }
//             } else {
//                 console.log(`Invalid block range for ${event_type}. fromBlock: ${fromBlock}, toBlock: ${toBlock}`);
//             }
//         } else {
//             console.log(`latest_block (${latest_block}) is not newer than maxStoredBlock (${maxStoredBlock}) for ${event_type}. Skipping blockchain sync.`);
//         }


//         // Query the latest events from the DB
//         const query = `
//             SELECT * FROM dao_events 
//             WHERE event_type = ?
//             ORDER BY block_number DESC 
//             LIMIT ?
//         `;
//         const params = [event_type, limit];
//         const { results: rawResults } = await db.prepare(query).bind(...params).all();

//         const results = rawResults ? rawResults.map((row: any) => ({
//             ...row,
//             event_data: row.event_data ? JSONParse(row.event_data) : null
//         })) : [];

//         // Store in cache (e.g., for 600 seconds)
//         const cacheValue: PageCacheData = {
//             success: true,
//             data: results || []
//         };
//         await CacheManager.storeObject(cacheKey, cacheValue, 600); // Cache for 10 minutes

//         return c.json(cacheValue);

//     } catch (err) {
//         console.error(`Error fetching ${event_type} events:`, err);
//         return c.json({
//             success: false,
//             message: `Failed to fetch ${event_type} events`,
//             error: (err as Error).message
//         }, 500);
//     }
// });

// // New public endpoint for fetching investors
// open.post('/investors', async (c: Context<{ Bindings: Bindings }>) => {
//     const body = await c.req.json();
//     const { latest_block } = body;

//     if (!latest_block) {
//         return c.json({ success: false, message: 'Missing required field: latest_block' }, 400);
//     }

//     const db = c.env.DB;
//     const cacheKey = `events:investors:${latest_block}`;
//     const CACHE_TTL = 30; // 30 seconds

//     try {
//         // Check cache first
//         const cachedData: { success: boolean, data: any[] } | null = await CacheManager.retrieveObject(cacheKey) as { success: boolean, data: any[] } | null;
//         if (cachedData) {
//             return c.json(cachedData);
//         }

//         // Query for invest events from the DB
//         const query = `
//             SELECT * FROM dao_events 
//             WHERE event_interact_type = 'invest'
//             ORDER BY block_number DESC 
//             LIMIT 64
//         `;
//         const { results: rawResults } = await db.prepare(query).all();

//         const results = rawResults ? rawResults.map((row: any) => ({
//             ...row,
//             event_data: row.event_data ? JSONParse(row.event_data) : null
//         })) : [];

//         // Store in cache for 30 seconds
//         const cacheValue: PageCacheData = {
//             success: true,
//             data: results || []
//         };
//         await CacheManager.storeObject(cacheKey, cacheValue, CACHE_TTL);

//         return c.json(cacheValue);

//     } catch (err) {
//         console.error('Error fetching investor events:', err);
//         return c.json({
//             success: false,
//             message: 'Failed to fetch investor events',
//             error: (err as Error).message
//         }, 500);
//     }
// });

// open.post('/latest_dao_events', async (c: Context<{ Bindings: Bindings }>) => {
//     const body = await c.req.json();
//     const { latest_block } = body;

//     if (!latest_block) {
//         return c.json({ success: false, message: 'Missing required field: latest_block' }, 400);
//     }

//     const db = c.env.DB;

//     const cacheKey = `latest_duki_in_action_events:${latest_block}`;
//     const cachedData: PageCacheData | null = await CacheManager.retrieveObject(cacheKey) as PageCacheData | null;
//     if (cachedData) {
//         return c.json(cachedData);
//     }

//     try {
//         // Find the latest block number stored in the DB for this event type
//         const maxBlockResult = await db.prepare(
//             `SELECT MAX(block_number) as max_block FROM dao_events limit 1`
//         ).first<{ max_block: number | null }>();

//         const maxStoredBlock = Math.max(maxBlockResult?.max_block ?? -1, latest_block - 1000); // Use -1 if no events stored yet

//         // --- Optimization: Skip blockchain query if latest_block is not newer ---
//         if (latest_block > maxStoredBlock) {
//             const fromBlock = BigInt(maxStoredBlock + 1);

//             const client = getClient(); // Assume getClient handles chain selection based on env/config
//             const logs = await client.getLogs({
//                 address: CONFIG.CONTRACT_ADDRESS,
//                 event: DukiInActionEventAbi,
//                 fromBlock: fromBlock,
//                 toBlock: 'latest'
//             });
//             console.log(`Syncing events from block ${fromBlock} to latest, ${logs.length} new DukiInActionEvent events.`);

//             if (logs.length > 0) {
//                 // Prepare statement 
//                 const insertStmt = db.prepare(
//                     `INSERT OR IGNORE INTO dao_events (tx_hash, diviner, block_number, event_type, event_interact_type, event_data) VALUES (?, ?, ?, ?, ?, ?)`
//                 );

//                 // Process in batches to avoid memory issues
//                 const batchSize = 100; // Adjust batch size as needed
//                 let batch: D1PreparedStatement[] = [];
//                 let totalInserted = 0;

//                 for (const log of logs) {
//                     // @ts-ignore - Assuming args exist and diviner is present for relevant events
//                     const diviner = log.args?.user || '0x'; // Adapt based on event structure
//                     // @ts-ignore
//                     const interact_type = log.args?.interactType === 2 ? 'invest' : null;

//                     const tx_hash = log.transactionHash;
//                     const block_number = Number(log.blockNumber); // Convert BigInt to Number for DB
//                     // Handle BigInt serialization in event_data
//                     const event_data = JSONStringify(log.args);
//                     batch.push(insertStmt.bind(tx_hash, diviner, block_number,
//                         DukiInActionEventType,
//                         interact_type,
//                         event_data));

//                     if (batch.length >= batchSize) {
//                         await db.batch(batch);
//                         totalInserted += batch.length;
//                         batch = []; // Reset batch
//                     }
//                 }

//                 // Insert remaining logs
//                 if (batch.length > 0) {
//                     await db.batch(batch);
//                     totalInserted += batch.length;
//                 }

//                 console.log(`Inserted ${totalInserted} new DukiInActionEvent events into DB.`);
//             }
//         } else {
//             console.log(`latest_block (${latest_block}) is not newer than maxStoredBlock (${maxStoredBlock}). Skipping blockchain sync.`);
//         }

//         // --- Pagination Query ---
//         const query = `
//             SELECT * FROM dao_events 
//             WHERE  event_type = 'DukiInAction'
//             ORDER BY block_number DESC 
//             LIMIT 64
//         `;
//         const { results: rawResults } = await db.prepare(query).all();

//         // Manually parse the event_data JSON string for each result
//         const results = rawResults ? rawResults.map((row: any) => ({
//             ...row,
//             event_data: row.event_data ? JSONParse(row.event_data) : null
//         })) : [];

//         // Mark as fresh in cache (e.g., for 600 seconds)
//         const cacheValue = {
//             success: true,
//             data: results || [],
//         };
//         await CacheManager.storeObject(cacheKey, cacheValue, 10);
//         return c.json(cacheValue);
//     } catch (err) {
//         console.error(`Error fetching latest events:`, err);
//         return c.json({
//             success: false,
//             message: `Failed to fetch latest events`,
//             error: (err as Error).message
//         }, 500);
//     }
// });

export default open;