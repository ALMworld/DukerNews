// routes/api.ts
import { Hono, Context } from 'hono';
import { jwt } from 'hono/jwt';
import { getCookie } from 'hono/cookie';
import { Bindings, PageCacheData, HonoEnv } from '../types';
import { authMiddleware } from '../middleware/auth';
import { corsMiddleware } from '../middleware/cors';
import { CTX_JWT_PAYLOAD } from '../config';
import { CacheManager } from '../managers';
import { parseAbiItem } from 'viem';
import { getClient } from './contract_api';
import { CONFIG } from '../config';
import { JSONParse, JSONStringify } from '../utils';
import { AwsClient } from 'aws4fetch';

const api = new Hono<HonoEnv>();

// Protect all API routes
api.use('/*', authMiddleware);


api.delete('/cache/ego/:evolver', async (c) => {
    try {
        const evolver = c.req.param('evolver');
        const normalizedEvolver = evolver.toLowerCase();
        const { cacheService } = c.var.serviceLocator;

        await cacheService.deleteEventsCache('latestEgoDaoEvents', normalizedEvolver);
        await cacheService.deleteEventsCache('allContractDaoEvents');
        await cacheService.deleteEventsCache('latestWorldDaoEvents');
        return c.json({ success: true, message: 'Ego DAO cache deleted successfully' });
    } catch (error) {
        console.error('Error deleting ego DAO cache:', error);
        return c.json({ success: false, message: 'Failed to delete ego DAO cache' }, 500);
    }
});


// ─── R2 Presigned URL Endpoints ───

const UPLOAD_TOKEN_EXPIRY = 600; // 10 minutes
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function getR2Client(env: Bindings) {
    return new AwsClient({
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        service: 's3',
        region: 'auto',
    });
}

function getR2Endpoint(env: Bindings) {
    return `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

/**
 * POST /api/upload/token
 * Generate a presigned PUT URL for direct R2 upload.
 * Body: { filename: string, contentType: string }
 * Returns: { presignedUrl: string, key: string }
 *
 * Key = {ego}/{hash}.{ext}  — user-scoped, content-addressed.
 * Reads go through public custom domain (assets.bagua.world/{ego}/{hash}.{ext}).
 */
api.post('/upload/token', async (c) => {
    try {
        const jwtPayload = c.get(CTX_JWT_PAYLOAD);
        const ego = jwtPayload.ego;
        if (!ego) return c.json({ success: false, message: 'Missing ego' }, 400);

        const body = await c.req.json<{ filename: string; contentType: string }>();
        const { filename, contentType } = body;

        if (!filename || !contentType) {
            return c.json({ success: false, message: 'Missing filename or contentType' }, 400);
        }
        if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
            return c.json({ success: false, message: `Invalid content type. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}` }, 400);
        }

        const key = `${ego}/${filename}`;
        const r2Client = getR2Client(c.env);
        const endpoint = getR2Endpoint(c.env);
        const bucketName = 'bagua-world';

        const url = new URL(`${endpoint}/${bucketName}/${key}`);
        url.searchParams.set('X-Amz-Expires', String(UPLOAD_TOKEN_EXPIRY));

        const signed = await r2Client.sign(
            new Request(url.toString(), {
                method: 'PUT',
                headers: { 'Content-Type': contentType },
            }),
            { aws: { signQuery: true } },
        );

        return c.json({
            success: true,
            data: { presignedUrl: signed.url, key },
        });
    } catch (error) {
        console.error('Error generating upload token:', error);
        return c.json({ success: false, message: 'Failed to generate upload token' }, 500);
    }
});


export default api;
