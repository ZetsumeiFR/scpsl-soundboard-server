import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Socket, Server as SocketIOServer } from "socket.io";
import { prisma } from "../config/db.js";
import { getSoundFilePath } from "../services/soundService.js";
import type {
  PluginSocketData,
  SoundInfo,
  PluginAuthMessage,
  PluginPlaySoundMessage,
} from "./types.js";

// Map steamId64 to socket for real-time updates
const connectedPlayers = new Map<string, Socket>();

export function setupPluginNamespace(io: SocketIOServer): void {
  const pluginNamespace = io.of("/plugin");

  pluginNamespace.on("connection", (socket: Socket) => {
    const socketData: PluginSocketData = {
      authenticatedPlayers: new Map(),
    };

    console.log(`[Plugin] New connection: ${socket.id}`);

    socket.on("message", async (message: unknown) => {
      try {
        if (!isValidMessage(message)) {
          socket.emit("message", {
            type: "error",
            error: "Invalid message format",
          });
          return;
        }

        switch (message.type) {
          case "auth":
            await handleAuth(socket, socketData, message as PluginAuthMessage);
            break;

          case "get_sounds":
            await handleGetSounds(socket, socketData);
            break;

          case "play_sound":
            await handlePlaySound(socket, socketData, message as PluginPlaySoundMessage);
            break;

          default:
            socket.emit("message", {
              type: "error",
              error: "Unknown message type",
            });
        }
      } catch (error) {
        console.error("[Plugin] Error handling message:", error);
        socket.emit("message", {
          type: "error",
          error: "Internal server error",
        });
      }
    });

    socket.on("disconnect", (reason) => {
      // Clean up all players authenticated on this socket
      for (const [steamId64, playerInfo] of socketData.authenticatedPlayers) {
        // Only remove from connectedPlayers if this socket is still the one registered
        if (connectedPlayers.get(steamId64) === socket) {
          connectedPlayers.delete(steamId64);
        }
        console.log(
          `[Plugin] Disconnected: ${playerInfo.username} (${socket.id}) - reason: ${reason}`
        );
      }

      if (socketData.authenticatedPlayers.size === 0) {
        console.log(
          `[Plugin] Disconnected (unauthenticated): ${socket.id} - reason: ${reason}`
        );
      }
    });
  });
}

function isValidMessage(message: unknown): message is { type: string } {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    typeof (message as { type: unknown }).type === "string"
  );
}

async function handleAuth(
  socket: Socket,
  socketData: PluginSocketData,
  message: PluginAuthMessage
): Promise<void> {
  const { steamId64 } = message;

  if (!steamId64 || typeof steamId64 !== "string") {
    socket.emit("message", {
      type: "auth_error",
      steamId64: steamId64 ?? "",
      error: "Invalid SteamID64",
    });
    return;
  }

  // Find user by steamId64
  const user = await prisma.user.findUnique({
    where: { steamId64 },
    include: {
      sounds: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          duration: true,
        },
      },
    },
  });

  if (!user) {
    socket.emit("message", {
      type: "auth_error",
      steamId64,
      error: "User not found. Please login via web panel first.",
    });
    return;
  }

  if (user.isBanned) {
    socket.emit("message", {
      type: "auth_error",
      steamId64,
      error: "Your account is banned",
    });
    return;
  }

  // Disconnect any existing connection for this player (from a different socket)
  const existingSocket = connectedPlayers.get(steamId64);
  if (existingSocket && existingSocket !== socket) {
    existingSocket.emit("message", {
      type: "auth_error",
      steamId64,
      error: "Connected from another location",
    });
    existingSocket.disconnect();
  }

  // Store connection
  socketData.authenticatedPlayers.set(steamId64, {
    userId: user.id,
    username: user.username,
  });
  connectedPlayers.set(steamId64, socket);

  const sounds: SoundInfo[] = user.sounds.map((s) => ({
    id: s.id,
    name: s.name,
    duration: s.duration,
  }));

  socket.emit("message", {
    type: "auth_success",
    steamId64,
    username: user.username,
    sounds,
  });

  console.log(`[Plugin] Authenticated: ${user.username} (${steamId64})`);
}

async function handleGetSounds(
  socket: Socket,
  socketData: PluginSocketData
): Promise<void> {
  // Send sounds for all authenticated players on this socket
  for (const [steamId64, playerInfo] of socketData.authenticatedPlayers) {
    const sounds = await prisma.sound.findMany({
      where: { userId: playerInfo.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        duration: true,
      },
    });

    socket.emit("message", {
      type: "sounds_list",
      steamId64,
      sounds: sounds.map((s) => ({
        id: s.id,
        name: s.name,
        duration: s.duration,
      })),
    });
  }
}

async function handlePlaySound(
  socket: Socket,
  socketData: PluginSocketData,
  message: PluginPlaySoundMessage
): Promise<void> {
  const { soundId } = message;

  // Find which authenticated player owns this sound
  const sound = await prisma.sound.findUnique({
    where: { id: soundId },
    select: {
      id: true,
      name: true,
      filename: true,
      duration: true,
      userId: true,
      user: { select: { steamId64: true } },
    },
  });

  if (!sound || !sound.user) {
    socket.emit("message", {
      type: "sound_error",
      steamId64: "",
      soundId,
      error: "Sound not found",
    });
    return;
  }

  const ownerSteamId64 = sound.user.steamId64;

  // Verify the player is authenticated on this socket
  const playerInfo = socketData.authenticatedPlayers.get(ownerSteamId64);
  if (!playerInfo || playerInfo.userId !== sound.userId) {
    socket.emit("message", {
      type: "sound_error",
      steamId64: ownerSteamId64,
      soundId,
      error: "Not authenticated",
    });
    return;
  }

  // Read the audio file
  try {
    const filePath = await getSoundFilePath(ownerSteamId64, sound.filename);

    if (!existsSync(filePath)) {
      console.error(`[Plugin] Sound file missing on disk: ${filePath}`);
      socket.emit("message", {
        type: "sound_error",
        steamId64: ownerSteamId64,
        soundId,
        error: "Sound file not found on server",
      });
      return;
    }
    const audioBuffer = await fs.readFile(filePath);
    const audioBase64 = audioBuffer.toString("base64");

    socket.emit("message", {
      type: "sound_data",
      steamId64: ownerSteamId64,
      soundId: sound.id,
      name: sound.name,
      duration: sound.duration,
      audioBase64,
    });
  } catch (error) {
    console.error(`[Plugin] Error reading sound file:`, error);
    socket.emit("message", {
      type: "sound_error",
      steamId64: ownerSteamId64,
      soundId,
      error: "Failed to read sound file",
    });
  }
}

// Notify connected plugin when sounds are updated
export async function notifyPlayerSoundsUpdated(steamId64: string): Promise<void> {
  const socket = connectedPlayers.get(steamId64);
  if (!socket) return;

  const user = await prisma.user.findUnique({
    where: { steamId64 },
    include: {
      sounds: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          duration: true,
        },
      },
    },
  });

  if (!user) return;

  socket.emit("message", {
    type: "sounds_updated",
    steamId64,
    sounds: user.sounds.map((s) => ({
      id: s.id,
      name: s.name,
      duration: s.duration,
    })),
  });
}

// Get connected player count (for stats)
export function getConnectedPlayerCount(): number {
  return connectedPlayers.size;
}
