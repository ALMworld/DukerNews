import { createMiddleware } from 'hono/factory';
import { HonoEnv } from '../types';
import { CacheService } from '../services/cacheService';
import { UserDbService } from '../services/userDbService';
import { PalaceAggService } from '../services/palaceAggService';

export const servicesMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
    let _cache: CacheService | undefined;
    let _userDb: UserDbService | undefined;
    let _palaceAgg: PalaceAggService | undefined;

    const services = {
        get cacheService() {
            if (_cache) return _cache;
            const cacheParams = (c.env as any).CACHE || caches.default;
            _cache = new CacheService(cacheParams);
            return _cache;
        },
        get userDbService() {
            if (_userDb) return _userDb;
            _userDb = new UserDbService(c.env.DB);
            return _userDb;
        },
        get palaceAggService() {
            if (_palaceAgg) return _palaceAgg;
            _palaceAgg = new PalaceAggService(this.userDbService, this.cacheService);
            return _palaceAgg;
        },
    };

    c.set('serviceLocator', services);
    await next();
});
