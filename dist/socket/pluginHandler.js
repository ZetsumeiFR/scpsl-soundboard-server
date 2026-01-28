import fs from "node:fs/promises";
import { prisma } from "../config/db.js";
import { getSoundFilePath } from "../services/soundService.js";
// Map steamId64 to socket for real-time updates
const connectedPlayers = new Map();
export function setupPluginNamespace(io) {
    const pluginNamespace = io.of("/plugin");
    pluginNamespace.on("connection", (socket) => {
        const socketData = {
            authenticated: false,
        };
        console.log(`[Plugin] New connection: ${socket.id}`);
        // Set a timeout for authentication
        const authTimeout = setTimeout(() => {
            if (!socketData.authenticated) {
                socket.emit("message", {
                    type: "auth_error",
                    error: "Authentication timeout",
                });
                socket.disconnect();
            }
        }, 10000);
        socket.on("message", async (message) => {
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
                        await handleAuth(socket, socketData, message, authTimeout);
                        break;
                    case "get_sounds":
                        await handleGetSounds(socket, socketData);
                        break;
                    case "play_sound":
                        await handlePlaySound(socket, socketData, message);
                        break;
                    default:
                        socket.emit("message", {
                            type: "error",
                            error: "Unknown message type",
                        });
                }
            }
            catch (error) {
                console.error("[Plugin] Error handling message:", error);
                socket.emit("message", {
                    type: "error",
                    error: "Internal server error",
                });
            }
        });
        socket.on("disconnect", () => {
            clearTimeout(authTimeout);
            if (socketData.steamId64) {
                connectedPlayers.delete(socketData.steamId64);
            }
            console.log(`[Plugin] Disconnected: ${socket.id}`);
        });
    });
}
function isValidMessage(message) {
    return (typeof message === "object" &&
        message !== null &&
        "type" in message &&
        typeof message.type === "string");
}
async function handleAuth(socket, socketData, message, authTimeout) {
    clearTimeout(authTimeout);
    const { steamId64 } = message;
    if (!steamId64 || typeof steamId64 !== "string") {
        socket.emit("message", {
            type: "auth_error",
            error: "Invalid SteamID64",
        });
        socket.disconnect();
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
            error: "User not found. Please login via web panel first.",
        });
        socket.disconnect();
        return;
    }
    if (user.isBanned) {
        socket.emit("message", {
            type: "auth_error",
            error: "Your account is banned",
        });
        socket.disconnect();
        return;
    }
    // Disconnect any existing connection for this player
    const existingSocket = connectedPlayers.get(steamId64);
    if (existingSocket) {
        existingSocket.emit("message", {
            type: "auth_error",
            error: "Connected from another location",
        });
        existingSocket.disconnect();
    }
    // Store connection
    socketData.authenticated = true;
    socketData.userId = user.id;
    socketData.steamId64 = user.steamId64;
    socketData.username = user.username;
    connectedPlayers.set(steamId64, socket);
    const sounds = user.sounds.map((s) => ({
        id: s.id,
        name: s.name,
        duration: s.duration,
    }));
    socket.emit("message", {
        type: "auth_success",
        username: user.username,
        sounds,
    });
    console.log(`[Plugin] Authenticated: ${user.username} (${steamId64})`);
}
async function handleGetSounds(socket, socketData) {
    if (!socketData.authenticated || !socketData.userId) {
        socket.emit("message", {
            type: "auth_error",
            error: "Not authenticated",
        });
        return;
    }
    const sounds = await prisma.sound.findMany({
        where: { userId: socketData.userId },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            name: true,
            duration: true,
        },
    });
    socket.emit("message", {
        type: "sounds_list",
        sounds: sounds.map((s) => ({
            id: s.id,
            name: s.name,
            duration: s.duration,
        })),
    });
}
async function handlePlaySound(socket, socketData, message) {
    if (!socketData.authenticated || !socketData.userId || !socketData.steamId64) {
        socket.emit("message", {
            type: "auth_error",
            error: "Not authenticated",
        });
        return;
    }
    const { soundId } = message;
    // Find the sound
    const sound = await prisma.sound.findFirst({
        where: {
            id: soundId,
            userId: socketData.userId,
        },
    });
    if (!sound) {
        socket.emit("message", {
            type: "sound_error",
            soundId,
            error: "Sound not found",
        });
        return;
    }
    // Read the audio file
    try {
        const filePath = await getSoundFilePath(socketData.steamId64, sound.filename);
        const audioBuffer = await fs.readFile(filePath);
        const audioBase64 = audioBuffer.toString("base64");
        socket.emit("message", {
            type: "sound_data",
            soundId: sound.id,
            name: sound.name,
            duration: sound.duration,
            audioBase64,
        });
    }
    catch (error) {
        console.error(`[Plugin] Error reading sound file:`, error);
        socket.emit("message", {
            type: "sound_error",
            soundId,
            error: "Failed to read sound file",
        });
    }
}
// Notify connected plugin when sounds are updated
export async function notifyPlayerSoundsUpdated(steamId64) {
    const socket = connectedPlayers.get(steamId64);
    if (!socket)
        return;
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
    if (!user)
        return;
    socket.emit("message", {
        type: "sounds_updated",
        sounds: user.sounds.map((s) => ({
            id: s.id,
            name: s.name,
            duration: s.duration,
        })),
    });
}
// Get connected player count (for stats)
export function getConnectedPlayerCount() {
    return connectedPlayers.size;
}
