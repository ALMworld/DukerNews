import type { Bindings } from '../types';
import { fromBinary, create, toBinary } from '@bufbuild/protobuf';

export type CacheType = 'latestEgoDaoEvents' | 'latestWorldDaoEvents' | 'allContractDaoEvents';

export class CacheService {
    private cache: Cache;
    private static CACHE_BASE_URL = 'https://cache.internal';

    constructor(cache: Cache) {
        this.cache = cache;
    }

    private getCacheUrl(key: string): string {
        return `${CacheService.CACHE_BASE_URL}/${key}`;
    }

    /**
     * General cache setter that stores data with timestamp and TTL
     * @param key - The cache key
     * @param data - The data to cache (Uint8Array)
     * @param maxAgeSeconds - Cache TTL in seconds (default: 360)
     */
    async cacheData(key: string, data: Uint8Array, headerMap: Record<string, string> = {}, maxAgeSeconds: number = 360) {
        const headers: Record<string, string> = {
            'X-Cache-Timestamp': Date.now().toString(),
            'Cache-Control': `max-age=${maxAgeSeconds}`,
            ...headerMap
        };

        const cacheResponse = new Response(data, {
            headers: headers
        });
        const cacheUrl = this.getCacheUrl(key);
        await this.cache.put(cacheUrl, cacheResponse);
    }

    /**
     * General cache getter that returns array buffer data and cache age
     * @param key - The cache key
     * @returns Object containing arrayBufferData and cacheAgeSeconds
     */
    async getCacheWithAge(key: string): Promise<{ arrayBufferData: Uint8Array | null, headerMap: Record<string, string> | null, cacheAgeSeconds: number | null }> {
        const cacheUrl = this.getCacheUrl(key);
        const cached = await this.cache.match(cacheUrl);

        if (cached) {
            const cachedBuffer = await cached.arrayBuffer();
            const arrayBufferData = new Uint8Array(cachedBuffer);

            // Calculate cache age from X-Cache-Timestamp header
            const cacheTimestamp = cached.headers.get('X-Cache-Timestamp');
            const cacheAgeSeconds = cacheTimestamp
                ? Math.floor((Date.now() - parseInt(cacheTimestamp)) / 1000)
                : null;

            const headerMap: Record<string, string> = {};
            cached.headers.forEach((value, key) => {
                headerMap[key] = value;
            });

            return { arrayBufferData, headerMap, cacheAgeSeconds };
        }

        return { arrayBufferData: null, headerMap: null, cacheAgeSeconds: null };
    }

    async getCache(key: string): Promise<Response | null> {
        const cacheUrl = this.getCacheUrl(key);
        const result = await this.cache.match(cacheUrl);
        return result ?? null;
    }

    async deleteEventsCache(type: CacheType, evolver?: string) {
        let cacheKey: string;
        if (type === 'latestEgoDaoEvents') {
            if (!evolver) throw new Error('evolver is required for ego cache deletes');
            cacheKey = `latestEgoDaoEvents:${evolver}`;
        } else if (type === 'latestWorldDaoEvents') {
            cacheKey = `latestWorldDaoEvents`;
        } else {
            // allContractDaoEvents
            cacheKey = `allContractDaoEvents`;
        }
        const cacheUrl = this.getCacheUrl(cacheKey);

        await this.cache.delete(this.getCacheUrl('latestWorldDaoEvents'));
        await this.cache.delete(this.getCacheUrl('allContractDaoEvents'));

        await this.cache.delete(cacheUrl);
    }

    /**
     * Get fetch permission status from cache
     * @param key - The cache key for the fetch permission
     * @returns true if fetch is in progress, false otherwise
     */
    async getFetchPermission(key: string): Promise<boolean> {
        const cacheUrl = this.getCacheUrl(key);
        const cached = await this.cache.match(cacheUrl);
        return cached !== undefined;
    }

    /**
     * Set fetch permission in cache with TTL
     * @param key - The cache key for the fetch permission
     * @param ttlSeconds - Time to live in seconds
     */
    async setFetchPermission(key: string, ttlSeconds: number = 60) {
        const cacheUrl = this.getCacheUrl(key);
        const response = new Response('true', {
            headers: {
                'Content-Type': 'text/plain',
                'X-Cache-Timestamp': Date.now().toString(),
                'Cache-Control': `max-age=${ttlSeconds}`
            }
        });
        await this.cache.put(cacheUrl, response);
    }

    /**
     * Delete fetch permission from cache
     * @param key - The cache key for the fetch permission
     */
    async deleteFetchPermission(key: string) {
        const cacheUrl = this.getCacheUrl(key);
        await this.cache.delete(cacheUrl);
    }
}
