import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { env } from "./config/env.js";
import { pool } from "./config/db.js";
import { configurePassport, passport } from "./config/passport.js";
import { createSessionMiddleware } from "./middleware/session.js";
import { corsMiddleware } from "./middleware/cors.js";
import routes from "./routes/index.js";
import { initializeSocketIO } from "./socket/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function bootstrap() {
  const app = express();

  // Trust proxy in production (required for secure cookies behind reverse proxy)
  if (env.isProd) {
    app.set("trust proxy", 1);
  }

  // Create HTTP server explicitly for Socket.IO
  const httpServer = createServer(app);

  // Configure Passport
  configurePassport();

  // Middleware
  app.use(corsMiddleware);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(createSessionMiddleware(pool));
  app.use(passport.initialize());
  app.use(passport.session());

  // API Routes
  app.use(routes);

  // Serve static client files in production
  if (env.isProd) {
    // Client build is at ../../scp-soundboard-client/dist relative to dist/
    const clientDistPath = join(__dirname, "../../scp-soundboard-client/dist");

    if (existsSync(clientDistPath)) {
      console.log(`Serving static files from: ${clientDistPath}`);
      app.use(express.static(clientDistPath));

      // SPA fallback - serve index.html for all non-API routes
      app.get("*", (req, res) => {
        res.sendFile(join(clientDistPath, "index.html"));
      });
    } else {
      console.warn(`Client dist not found at: ${clientDistPath}`);
    }
  }

  // Initialize Socket.IO
  initializeSocketIO(httpServer);

  // Start server
  httpServer.listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port}`);
    console.log(`Environment: ${env.nodeEnv}`);
    console.log(`WebSocket available at ws://localhost:${env.port}/socket.io`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down gracefully...");
    httpServer.close(async () => {
      await pool.end();
      console.log("Server closed");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.on("uncaughtException", (err) => {
    console.error("[FATAL] Uncaught exception:", err);
    shutdown();
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[FATAL] Unhandled rejection:", reason);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
