import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import type { Request, Response, NextFunction } from "express";
import { Redis } from "ioredis";
import { env } from "../config/env.js";

let uploadRateLimiter: RateLimiterRedis | null = null;
let ioRedisClient: Redis | null = null;

async function getUploadRateLimiter(): Promise<RateLimiterRedis> {
  if (!uploadRateLimiter) {
    // Use ioredis for rate-limiter-flexible (required for v9+ compatibility)
    ioRedisClient = new Redis(env.redisUrl, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });

    // Wait for ioredis to be ready before creating rate limiter
    // (rate-limiter-flexible registers custom Lua commands that require a ready client)
    await new Promise<void>((resolve, reject) => {
      ioRedisClient!.on("ready", resolve);
      ioRedisClient!.on("error", (err) => {
        reject(new Error(`Redis connection failed: ${err.message}`));
      });
    });

    uploadRateLimiter = new RateLimiterRedis({
      storeClient: ioRedisClient,
      keyPrefix: "ratelimit:upload",
      points: 5, // 5 uploads
      duration: 60, // per minute
      blockDuration: 0, // no additional blocking
    });
  }
  return uploadRateLimiter;
}

export async function requireUploadRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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
  } catch (error) {
    // Fallback graceful: if Redis is down, allow the upload
    if (error instanceof Error) {
      console.error(
        "[RateLimiter] Redis error, bypassing rate limit:",
        error.message
      );
      next();
      return;
    }

    // Rate limit exceeded
    const rateLimiterRes = error as RateLimiterRes;
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
