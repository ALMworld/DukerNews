import { UserDbService, UserRow } from './userDbService';
import { CacheService } from './cacheService';
import {
    PalaceCmd, PalaceDeltaEvents, PalaceDeltaEventsSchema,
    PalaceEvent, PalaceEventSchema,
    PalaceEventType, PalaceCmdType,
    PalaceSyncStatus,
    CreatePoiPayload, AmendPoiPayload,
    CreateHookPayload, AmendHookPayload, DeleteHookPayload,
    BaguaRole,
    NonceUtils,
    PalaceEventDataSchema,
} from '@repo/apidefs';
import { create, toBinary } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { CONFIG } from '../config';
import { logger } from '@repo/hono-helpers';

/**
 * PalaceAggService — handles palace command → event conversion
 * 
 * Mirrors EgoAggService pattern but for palace-specific commands:
 * - POI (Point of Interest): Create, Amend
 * - Hook: Create, Amend, Delete
 */
export class PalaceAggService {
    private userDb: UserDbService;
    private cache: CacheService;

    constructor(userDb: UserDbService, cache: CacheService) {
        this.userDb = userDb;
        this.cache = cache;
    }

    async handleCmd(clientSeq: bigint, cmd: PalaceCmd, user: UserRow): Promise<PalaceDeltaEvents> {
        if (!user.ego) {
            throw new ConnectError('user invalid', Code.InvalidArgument);
        }

        const serverSeq = BigInt(user.latest_evt_seq || 0);

        if (clientSeq > serverSeq) {
            logger.error(`Client nonce invalid (client: ${clientSeq}, server: ${serverSeq})`);
            throw new ConnectError('Client nonce invalid', Code.InvalidArgument);
        }

        if ((clientSeq + CONFIG.MAX_ALLOWED_DELAY_EVENTS_COUNT) < serverSeq) {
            return this.syncEvents(user.ego, serverSeq, clientSeq);
        }

        // Process Command → Events
        const events = this.cmdToEvents(cmd, serverSeq);

        // Persist
        await this.userDb.batchSavePalaceEvent(cmd.ego, events, serverSeq);

        if (clientSeq === serverSeq) {
            const newCursor = events[events.length - 1].evtSeq;
            return create(PalaceDeltaEventsSchema, {
                syncStatus: PalaceSyncStatus.PALACE_SYNC_CONTINUE,
                clientNonce: NonceUtils.toNonce(newCursor, cmd.ego),
                events,
            });
        } else {
            const newServerSeq = events[events.length - 1].evtSeq;
            return this.syncEvents(user.ego, newServerSeq, clientSeq);
        }
    }

    async syncEvents(ego: string, serverLatestSeq: bigint, clientLatestSeq: bigint): Promise<PalaceDeltaEvents> {
        if (!ego) {
            return create(PalaceDeltaEventsSchema, {
                events: [],
                clientNonce: NonceUtils.FIXED_ZERO_NONCE,
            });
        }

        if (clientLatestSeq > serverLatestSeq) {
            throw new ConnectError('invalid clientNonce', Code.InvalidArgument);
        }

        const maxFetchSeq = (clientLatestSeq + CONFIG.MAX_BATCH_EVENTS_COUNT) > serverLatestSeq
            ? serverLatestSeq
            : clientLatestSeq + CONFIG.MAX_BATCH_EVENTS_COUNT;

        const events = await this.userDb.getPalaceEvents(ego, clientLatestSeq, maxFetchSeq);

        const newCursor = events.length > 0 ? events[events.length - 1].evtSeq : clientLatestSeq;

        return create(PalaceDeltaEventsSchema, {
            syncStatus: PalaceSyncStatus.PALACE_PULL_THEN_CONTINUE,
            clientNonce: NonceUtils.toNonce(newCursor, ego),
            events,
        });
    }

    private cmdToEvents(cmd: PalaceCmd, serverSeq: bigint): PalaceEvent[] {
        if (!cmd.data) throw new ConnectError('Missing payload', Code.InvalidArgument);

        const payload = cmd.data.payload;
        const now = BigInt(Date.now());

        switch (payload.case) {
            case 'createPoi': {
                const p = payload.value as CreatePoiPayload;
                if (!p.pid) throw new ConnectError('Missing pid', Code.InvalidArgument);
                return [create(PalaceEventSchema, {
                    ego: cmd.ego,
                    evtSeq: serverSeq + 1n,
                    evtType: PalaceEventType.POI_CREATED,
                    evtTime: now,
                    data: { payload: { case: 'poiCreated', value: { pid: p.pid, lat: p.lat, lng: p.lng, name: p.name } } },
                    baguaRole: BaguaRole.Earth_Kun_0_ALM_World,
                    createTime: now,
                })];
            }
            case 'amendPoi': {
                const p = payload.value as AmendPoiPayload;
                if (!p.pid) throw new ConnectError('Missing pid', Code.InvalidArgument);
                return [create(PalaceEventSchema, {
                    ego: cmd.ego,
                    evtSeq: serverSeq + 1n,
                    evtType: PalaceEventType.POI_AMENDED,
                    evtTime: now,
                    data: { payload: { case: 'poiAmended', value: { pid: p.pid, lat: p.lat, lng: p.lng, name: p.name } } },
                    baguaRole: BaguaRole.Earth_Kun_0_ALM_World,
                    createTime: now,
                })];
            }
            case 'createHook': {
                const p = payload.value as CreateHookPayload;
                if (!p.pid) throw new ConnectError('Missing pid', Code.InvalidArgument);
                const hid = crypto.randomUUID();
                return [create(PalaceEventSchema, {
                    ego: cmd.ego,
                    evtSeq: serverSeq + 1n,
                    evtType: PalaceEventType.HOOK_CREATED,
                    evtTime: now,
                    data: {
                        payload: {
                            case: 'hookCreated',
                            value: { pid: p.pid, hid, hookType: p.hookType, content: p.content, tags: p.tags },
                        },
                    },
                    baguaRole: BaguaRole.Earth_Kun_0_ALM_World,
                    createTime: now,
                })];
            }
            case 'amendHook': {
                const p = payload.value as AmendHookPayload;
                if (!p.pid || !p.hid) throw new ConnectError('Missing pid or hid', Code.InvalidArgument);
                return [create(PalaceEventSchema, {
                    ego: cmd.ego,
                    evtSeq: serverSeq + 1n,
                    evtType: PalaceEventType.HOOK_AMENDED,
                    evtTime: now,
                    data: { payload: { case: 'hookAmended', value: { pid: p.pid, hid: p.hid, content: p.content, tags: p.tags } } },
                    baguaRole: BaguaRole.Earth_Kun_0_ALM_World,
                    createTime: now,
                })];
            }
            case 'deleteHook': {
                const p = payload.value as DeleteHookPayload;
                if (!p.pid || !p.hid) throw new ConnectError('Missing pid or hid', Code.InvalidArgument);
                return [create(PalaceEventSchema, {
                    ego: cmd.ego,
                    evtSeq: serverSeq + 1n,
                    evtType: PalaceEventType.HOOK_DELETED,
                    evtTime: now,
                    data: { payload: { case: 'hookDeleted', value: { pid: p.pid, hid: p.hid } } },
                    baguaRole: BaguaRole.Earth_Kun_0_ALM_World,
                    createTime: now,
                })];
            }
            default:
                throw new ConnectError('Invalid command type', Code.InvalidArgument);
        }
    }
}
