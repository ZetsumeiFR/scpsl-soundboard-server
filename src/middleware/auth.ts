import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
  }

  if (req.user.isBanned) {
    return res.status(403).json({ error: { code: "BANNED", message: "Your account has been banned" } });
  }

  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  // Just continue - user may or may not be authenticated
  next();
}
