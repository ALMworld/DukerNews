// types.ts
export type Bindings = {
    R2_BUCKET: R2Bucket;
    AI: any;
    // Cache: Cache; // Use caches.default instead of binding
    DB: D1Database;
    GQ_KEY: string;
    JWT_SECRET: string;
    DEEPSEEK_KEY: string;
    MY_BUCKET: R2Bucket;
    USERNAME: string;
    PASSWORD: string;
    UD_API_KEY: string;
    SCRAPER_URL: string;
    SCRAPER_API_KEY: string;
    CF_ACCESS_CLIENT_ID?: string;
    CF_ACCESS_CLIENT_SECRET?: string;
    CACHE: KVNamespace;
    COOKIE_SAME_SITE?: string;
    ALLOWED_ORIGINS?: string;
    COOKIE_DOMAIN?: string;
    ENVIRONMENT?: string;
    // R2 S3-compatible API credentials (for presigned URL generation)
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    CF_ACCOUNT_ID: string;
}

import { CacheService } from './services/cacheService';
import { UserDbService } from './services/userDbService';
import { PalaceAggService } from './services/palaceAggService';

export type ServiceLocator = {
    cacheService: CacheService;
    userDbService: UserDbService;
    palaceAggService: PalaceAggService;
}

export type HonoEnv = {
    Bindings: Bindings;
    Variables: {
        serviceLocator: ServiceLocator;
    };
};

export type JWTPayload = {
    ego: string;
    chainId: string;
    expireAt: number;
    clientNonce: string;
    isNew: boolean;
}

export type CommonResponse<T> = {
    success: boolean;
    message: string;
    data: T | null;
}

export type NonceData = {
    nonce: string;
}

export function createLazy<T>(factory: () => T) {
    let instance: T | null = null;

    return () => {
        if (!instance) {
            instance = factory();
        }
        return instance;
    };
}

export type PageCacheData = {
    success: boolean;
    data: any[];
    cursor?: number | null;
}
