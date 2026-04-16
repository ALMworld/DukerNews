// index.ts
import { Hono } from 'hono';
import { Bindings } from './types';
import { corsMiddleware } from './middleware/cors';
import open from './routes/open';
import api from './routes/api';
import { authMiddleware } from './middleware/auth';
import { CONFIG, CTX_JWT_PAYLOAD } from './config';



import { showRoutes } from 'hono/dev'
import {
    UniversalHandler,
    universalServerRequestFromFetch,
    universalServerResponseToFetch,
} from "@connectrpc/connect/protocol";
import { createConnectRouter, createContextValues } from '@connectrpc/connect';
import { palaceGrpcRoutes } from './routes/palace_grpc_api';
import { envStore, serviceLocatorStore } from './store-context';


import { servicesMiddleware } from './middleware/services';
import { HonoEnv } from './types';

// globalThis.Buffer = Buffer; // Make Buffer globally available
const app = new Hono<HonoEnv>();

// Global CORS middleware
app.use('/*', corsMiddleware);
// Services middleware (DI)
app.use('/*', servicesMiddleware);

// Mount routes
app.route('/open', open);
app.route('/api', api);

// Palace routes
const palaceRouter = createConnectRouter({
    connect: true,
    requireConnectProtocolHeader: false,
    jsonOptions: { ignoreUnknownFields: true },
});
palaceGrpcRoutes(palaceRouter);

const paths = new Map<string, UniversalHandler>();
for (const uHandler of palaceRouter.handlers) {
    paths.set(uHandler.requestPath, uHandler);
    console.log(`Registered palace route: ${uHandler.requestPath}`);
}

// All routes use auth middleware
for (const [path, handler] of paths) {
    app.post(path, corsMiddleware, authMiddleware, async (c) => {
        try {
            console.log(`Request received for path: ${path}`);
            const uReq = {
                ...universalServerRequestFromFetch(c.req.raw, {}),
                contextValues: createContextValues()
                    .set(envStore, c.env)
                    .set(CTX_JWT_PAYLOAD as any, c.get(CTX_JWT_PAYLOAD))
                    .set(serviceLocatorStore, c.var.serviceLocator),
            };
            const uRes = await handler(uReq);
            return universalServerResponseToFetch(uRes);
        } catch (error) {
            console.error(`Error handling request for ${path}:`, error);
            console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
            return c.json({
                code: 'internal',
                message: error instanceof Error ? error.message : 'An unknown error occurred',
                details: error instanceof Error ? error.stack : String(error)
            }, 500);
        }
    });
}

showRoutes(app, {
    verbose: true,
})
export default app;