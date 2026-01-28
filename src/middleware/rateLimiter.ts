import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import type { Request, Response, NextFunction } from "express";

const uploadRateLimiter = new RateLimiterMemory({
  keyPrefix: "ratelimit:upload",
  points: 5, // 5 uploads
  duration: 60, // per minute
  blockDuration: 0, // no additional blocking
});

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
    const rateLimiterRes = await uploadRateLimiter.consume(steamId64);
    res.set("X-RateLimit-Remaining", String(rateLimiterRes.remainingPoints));
    next();
  } catch (error) {
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
