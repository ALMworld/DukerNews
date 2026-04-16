// middleware/cors.ts
import { cors } from 'hono/cors';

export const corsMiddleware = cors({
    origin: (origin, c) => {
        const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',').map((o: string) => o.trim()) || [];

        // If no origin (e.g. server-to-server), default to the first allowed origin
        if (!origin) return allowedOrigins[0] || 'https://youlingua.world';

        for (const pattern of allowedOrigins) {
            // Exact match
            if (pattern === origin) return origin;
            // Wildcard match (e.g., https://*.pages.dev)
            if (pattern.includes('*')) {
                const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                if (regex.test(origin)) return origin;
            }
        }

        return allowedOrigins[0] || 'https://youlingua.world';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: [
        'Content-Type',
        'Authorization',
        'x-requested-with',
        'auth_session',
        'Access-Control-Allow-Origin',
        'Access-Control-Allow-Credentials',
        'Access-Control-Allow-Methods',
        'Access-Control-Allow-Headers',
        // ConnectRPC headers
        'connect-protocol-version',
        'connect-timeout-ms',
        'grpc-timeout',
        'x-grpc-web',
    ],
    exposeHeaders: ['Content-Type', 'Content-Length', 'auth_session', 'Set-Cookie', 'Content-Encoding'],
    maxAge: 6000,
    credentials: true,
});
