import { createClient } from "redis";
import { env } from "./env.js";
let redisClient = null;
export async function getRedisClient() {
    if (!redisClient) {
        redisClient = createClient({
            url: env.redisUrl,
        });
        redisClient.on("error", (err) => {
            console.error("Redis Client Error:", err);
        });
        redisClient.on("connect", () => {
            console.log("Redis connected");
        });
        await redisClient.connect();
    }
    return redisClient;
}
export async function closeRedisClient() {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
    }
}
