import { RateLimiterRedis } from "rate-limiter-flexible";
import { getRedisClient } from "../config/redis.js";
let uploadRateLimiter = null;
async function getUploadRateLimiter() {
    if (!uploadRateLimiter) {
        const redisClient = await getRedisClient();
        uploadRateLimiter = new RateLimiterRedis({
            storeClient: redisClient,
            keyPrefix: "ratelimit:upload",
            points: 5, // 5 uploads
            duration: 60, // per minute
            blockDuration: 0, // no additional blocking
        });
    }
    return uploadRateLimiter;
}
export async function requireUploadRateLimit(req, res, next) {
    const steamId64 = req.user?.steamId64;
    if (!steamId64) {
        // Should not happen since requireAuth runs first, but fail gracefully
        res.status(401).json({
            error: {
                code: "UNAUTHORIZED",
                message: "Authentification requise",
            },
        });
        return;
    }
    try {
        const rateLimiter = await getUploadRateLimiter();
        const rateLimiterRes = await rateLimiter.consume(steamId64);
        res.set("X-RateLimit-Remaining", String(rateLimiterRes.remainingPoints));
        next();
    }
    catch (error) {
        // Fallback graceful: if Redis is down, allow the upload
        if (error instanceof Error) {
            console.error("[RateLimiter] Redis error, bypassing rate limit:", error.message);
            next();
            return;
        }
        // Rate limit exceeded
        const rateLimiterRes = error;
        const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000);
        res.set("Retry-After", String(retryAfter));
        res.set("X-RateLimit-Remaining", "0");
        res.status(429).json({
            error: {
                code: "RATE_LIMIT_EXCEEDED",
                message: `Trop d'uploads. Réessayez dans ${retryAfter} secondes.`,
                retryAfter,
            },
        });
    }
}
