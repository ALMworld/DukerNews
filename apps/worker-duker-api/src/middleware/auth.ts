// middleware/auth.ts
import { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import { CONFIG, CTX_JWT_PAYLOAD } from '../config';
import { JWTPayload } from '../types';

export const authMiddleware: MiddlewareHandler = async (c, next) => {
    const token = getCookie(c, CONFIG.COOKIE_NAME);
    if (!token) {
        console.log("there is no token for ", CONFIG.COOKIE_NAME);
        return c.json({ success: false, message: "not login" }, 401);
    }

    try {
        const payload = await verify(token, c.env.JWT_SECRET) as JWTPayload;
        console.log("payload in authMiddleware", payload);
        // const currentTime = Math.floor(Date.now() / 1000);

        c.set(CTX_JWT_PAYLOAD, payload);
        await next();
    } catch (err) {
        return c.json({ success: false, message: 'Invalid token' }, 401);
    }
};