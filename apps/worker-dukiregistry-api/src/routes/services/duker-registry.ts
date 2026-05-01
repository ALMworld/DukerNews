import { type ConnectRouter } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import {
    DukerRegistryService,
    GetUsernameRespSchema,
    CheckUsernameRespSchema,
} from '@repo/dukiregistry-apidefs';
import { _db, rowToIdentity } from '../shared';



export function registerDukerRegistryService(router: ConnectRouter) {
    // ── DukerRegistryService ────────────────────────────────

    router.service(DukerRegistryService, {
        async getUsername(req) {
            let query = 'SELECT * FROM duker_users WHERE ego = ? COLLATE NOCASE AND active = ?'
            const params: any[] = [req.address, 1]

            if (req.chainEid > 0) {
                query += ' AND chain_eid = ?'
                params.push(req.chainEid)
            }
            query += ' ORDER BY chain_eid ASC'

            const result = await _db.prepare(query).bind(...params).all<any>()
            return create(GetUsernameRespSchema, {
                identities: (result.results ?? []).map(rowToIdentity),
            })
        },

        async checkUsername(req) {
            const row = await _db.prepare(
                'SELECT * FROM duker_users WHERE username = ? COLLATE NOCASE AND active = ? LIMIT 1'
            ).bind(req.username, 1).first<any>()

            if (row) {
                return create(CheckUsernameRespSchema, {
                    available: false,
                    owner: rowToIdentity(row),
                })
            }
            return create(CheckUsernameRespSchema, { available: true })
        },

        async getIdentitiesByToken(req) {
            const result = await _db.prepare(
                'SELECT * FROM duker_users WHERE token_id = ? AND active = ? ORDER BY chain_eid ASC'
            ).bind(req.tokenId, 1).all<any>()

            return create(GetUsernameRespSchema, {
                identities: (result.results ?? []).map(rowToIdentity),
            })
        },

    })


}
