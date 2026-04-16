import { JSONValue } from "hono/utils/types";
import { JSONStringify } from "./utils";

// managers.ts
export type DomainRecord = {
    domain: string | null;  // null means "no domain found"
    timestamp: number;
    address: string;
}


export const CacheManager = {
    BASE_URL: 'https://example.com/cache/',

    getCacheUrl(key: string): string {
        return new URL(encodeURIComponent(key), this.BASE_URL).toString();
    },

    async storeString(key: string, value: string, ttl?: number): Promise<void> {
        const cacheUrl = this.getCacheUrl(key);
        const headers: HeadersInit = {};

        if (ttl) {
            headers['Cache-Control'] = `max-age=${ttl}`;
        }

        await caches.default.put(
            new Request(cacheUrl),
            new Response(value, { headers })
        );
    },

    async retrieveString(key: string): Promise<string | null> {
        const cacheUrl = this.getCacheUrl(key);
        const cached = await caches.default.match(new Request(cacheUrl));

        if (!cached) {
            return null;
        }

        return cached.text();
    },

    async storeObject<T extends object>(key: string, value: T, ttl?: number): Promise<void> {
        const cacheUrl = this.getCacheUrl(key);
        const headers: HeadersInit = {
            'Content-Type': 'application/json'
        };

        if (ttl) {
            headers['Cache-Control'] = `max-age=${ttl}`;
        }

        await caches.default.put(
            new Request(cacheUrl),
            new Response(JSONStringify(value), { headers })
        );
    },

    async retrieveObject<T extends object>(key: string): Promise<JSONValue | null> {
        const cacheUrl = this.getCacheUrl(key);
        const cached = await caches.default.match(new Request(cacheUrl));

        if (!cached) {
            return null;
        }
        return cached.json();
    },

    async delete(key: string): Promise<boolean> {
        const cacheUrl = this.getCacheUrl(key);
        return await caches.default.delete(new Request(cacheUrl));
    }
};


export const DatabaseManager = {
    async getDomain(db: D1Database, address: string): Promise<DomainRecord | null> {
        const { results } = await db.prepare(
            'SELECT domain, timestamp FROM unstoppable_domains WHERE address = ?'
        )
            .bind(address.toLowerCase())
            .all();

        if (!results.length) return null;
        return {
            domain: results[0].domain as string,
            timestamp: results[0].timestamp as number,
            address: address
        };
    },

    async saveDomain(db: D1Database, record: DomainRecord): Promise<void> {
        await db.prepare(
            `INSERT OR REPLACE INTO unstoppable_domains (address, domain, timestamp) 
             VALUES (?, ?, ?)`
        )
            .bind(record.address.toLowerCase(), record.domain, record.timestamp)
            .run();
    }
};