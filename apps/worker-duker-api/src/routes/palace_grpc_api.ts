import { Code, ConnectError, ConnectRouter, HandlerContext } from '@connectrpc/connect';
import { envStore, serviceLocatorStore } from '../store-context';
import { BaguaPalaceService, NonceUtils } from '@repo/apidefs';
import { CTX_JWT_PAYLOAD } from '../config';
import { ServiceLocator, JWTPayload } from '../types';
import { UserDbService, UserRow } from '../services/userDbService';

function getServiceLocator(ctx: HandlerContext): ServiceLocator {
    const serviceLocator = ctx.values.get(serviceLocatorStore);
    if (!serviceLocator) {
        console.error('services not found in context');
        throw new ConnectError('Internal Error', Code.Internal);
    }
    return serviceLocator;
}

function getJwtPayload(ctx: HandlerContext): JWTPayload | undefined {
    return ctx.values.get(CTX_JWT_PAYLOAD as any) as JWTPayload | undefined;
}

/**
 * Get user from JWT session (ego identity).
 * Falls back to auto-creating user if they're authenticated but don't exist yet.
 */
async function getAuthenticatedUser(ctx: HandlerContext, userDb: UserDbService): Promise<UserRow> {
    const jwt = getJwtPayload(ctx);
    if (!jwt || !jwt.ego) {
        throw new ConnectError('Unauthorized — please login', Code.Unauthenticated);
    }
    let user = await userDb.getUser(jwt.ego);
    if (!user) {
        // Auto-create user on first palace interaction
        user = await userDb.createUser(jwt.ego);
    }
    return user;
}

const palaceGrpcRoutes = ({ service }: ConnectRouter) => {
    service(BaguaPalaceService, {
        handleCmd: async (req, ctx) => {
            const clientLatestSeq = NonceUtils.fromNonce(req.clientNonce, true);
            if (clientLatestSeq < 0n) {
                throw new ConnectError('Invalid client nonce', Code.InvalidArgument);
            }

            const { userDbService, palaceAggService } = getServiceLocator(ctx);
            // Ego comes from JWT session, not request body
            const user = await getAuthenticatedUser(ctx, userDbService);

            // Override ego from session
            req.ego = user.ego;

            return palaceAggService.handleCmd(clientLatestSeq, req, user);
        },

        sync: async (req, ctx) => {
            const clientLatestSeq = NonceUtils.fromNonce(req.clientNonce, true);
            if (clientLatestSeq < 0n) {
                throw new ConnectError('Invalid client nonce', Code.InvalidArgument);
            }

            const { userDbService, palaceAggService } = getServiceLocator(ctx);
            // Ego comes from JWT session
            const user = await getAuthenticatedUser(ctx, userDbService);

            return palaceAggService.syncEvents(user.ego, BigInt(user.latest_evt_seq || 0), clientLatestSeq);
        },
    });
};

export { palaceGrpcRoutes };
