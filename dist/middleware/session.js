import { RedisStore } from "connect-redis";
import session from "express-session";
import { env } from "../config/env.js";
export function createSessionMiddleware(redisClient) {
    const redisStore = new RedisStore({
        client: redisClient,
        prefix: "scp-soundboard:",
    });
    return session({
        store: redisStore,
        secret: env.sessionSecret,
        resave: false,
        saveUninitialized: false,
        name: "scp.sid",
        cookie: {
            secure: env.isProd,
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
            sameSite: env.isProd ? "strict" : "lax",
        },
    });
}
