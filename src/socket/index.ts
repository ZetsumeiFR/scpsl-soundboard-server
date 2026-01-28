import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { env } from "../config/env.js";
import { setupPluginNamespace } from "./pluginHandler.js";

let io: SocketIOServer | null = null;

export function initializeSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: [env.frontendUrl],
      credentials: true,
    },
    path: "/socket.io",
    transports: ["websocket", "polling"],
  });

  // Setup plugin namespace for LabAPI plugin connections
  setupPluginNamespace(io);

  console.log("[Socket.IO] Initialized");

  return io;
}

export function getSocketIO(): SocketIOServer | null {
  return io;
}

export { notifyPlayerSoundsUpdated, getConnectedPlayerCount } from "./pluginHandler.js";
