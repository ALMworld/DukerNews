import { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { NonceUtils, PalaceEvent, PalaceEventSchema, PalaceEventDataSchema } from '@repo/apidefs';
import { toBinary, fromBinary, create } from '@bufbuild/protobuf';
import { logger } from '@repo/hono-helpers';

export type UserRow = {
    ego: string;
    ego_owner: string;
    latest_evt_seq: number;
    latest_evt_nonce: string;
    create_time: number;
    update_time: number;
}

export type UserEventRow = {
    ego: string;
    evt_seq: number;
    evt_type: number;
    evt_time: number;
    bagua_role: number;
    create_time: number;
    payload: Uint8Array; // BLOB comes as buffer/array
}

export class UserDbService {
    private db: D1Database;

    constructor(db: D1Database) {
        this.db = db;
    }

    async getUser(ego: string): Promise<UserRow | null> {
        return this.db.prepare('SELECT * FROM users WHERE ego = ?').bind(ego).first<UserRow>();
    }

    async getUserByEgoOwner(address: string): Promise<UserRow | null> {
        return this.db.prepare('SELECT * FROM users WHERE ego_owner = ?').bind(address).first<UserRow>();
    }

    async createUser(ego: string, egoOwner: string = ''): Promise<UserRow> {
        const now = Date.now();
        const latest_evt_nonce = NonceUtils.toNonce(0, ego);
        await this.db.prepare(
            'INSERT OR IGNORE INTO users (ego, ego_owner, latest_evt_seq, latest_evt_nonce, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(ego, egoOwner, 0, latest_evt_nonce, now, now).run();
        return {
            ego: ego,
            ego_owner: egoOwner,
            latest_evt_seq: 0,
            latest_evt_nonce,
            create_time: now,
            update_time: now
        }
    }

    // ===== Palace Event Methods =====

    async batchSavePalaceEvent(ego: string, events: PalaceEvent[], serverSeq: bigint): Promise<void> {
        const now = Date.now();
        const statements: D1PreparedStatement[] = [];

        for (const event of events) {
            const serializedPayload = event.data ? toBinary(PalaceEventDataSchema, event.data) : new Uint8Array();
            const insertEvent = this.db.prepare(
                `INSERT INTO user_events (ego, evt_seq, evt_type, evt_time, bagua_role, create_time, payload)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).bind(
                ego,
                Number(event.evtSeq),
                event.evtType,
                Number(event.evtTime),
                event.baguaRole,
                now,
                serializedPayload
            );
            statements.push(insertEvent);
        }

        try {
            const oldSeq = Number(serverSeq);
            const newSeq = Number(events[events.length - 1].evtSeq);
            const updateUser = this.db.prepare(
                'UPDATE users SET latest_evt_seq = ?, update_time = ?, latest_evt_nonce = ? WHERE ego = ? AND latest_evt_seq = ?'
            ).bind(newSeq, now, NonceUtils.toNonce(newSeq, ego), ego, oldSeq);
            statements.push(updateUser);

            const result = await this.db.batch(statements);
            logger.log("palace batch result", result);
        } catch (e) {
            logger.error("palace batch error", e);
            throw e;
        }
    }

    async getPalaceEvents(ego: string, minSeq: bigint, maxSeq: bigint): Promise<PalaceEvent[]> {
        const { results } = await this.db.prepare(
            'SELECT * FROM user_events WHERE ego = ? AND evt_seq > ? AND evt_seq <= ? ORDER BY evt_seq ASC'
        ).bind(ego, Number(minSeq), Number(maxSeq)).all<UserEventRow>();

        return results.map(row => {
            const payloadBytes = new Uint8Array(row.payload);
            return create(PalaceEventSchema, {
                ego: row.ego,
                evtSeq: BigInt(row.evt_seq),
                evtType: row.evt_type,
                evtTime: BigInt(row.evt_time),
                baguaRole: row.bagua_role,
                createTime: BigInt(row.create_time),
                data: fromBinary(PalaceEventDataSchema, payloadBytes),
            });
        });
    }
}
