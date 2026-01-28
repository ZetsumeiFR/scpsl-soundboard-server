import connectPgSimple from "connect-pg-simple";
import session from "express-session";
import type pg from "pg";
import { env } from "../config/env.js";

export function createSessionMiddleware(pool: pg.Pool) {
  const PgStore = connectPgSimple(session);

  return session({
    store: new PgStore({
      pool,
      createTableIfMissing: true,
    }),
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: "scp.sid",
    cookie: {
      secure: env.isProd,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      sameSite: env.isProd ? "none" : "lax",
      domain: env.isProd ? ".soundboard.zetsumei.xyz" : undefined,
    },
  });
}
