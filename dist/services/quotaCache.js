import { getRedisClient } from "../config/redis.js";
const QUOTA_KEY_PREFIX = "quota:count:";
const QUOTA_TTL_SECONDS = 300; // 5 minutes
function getQuotaKey(userId) {
    return `${QUOTA_KEY_PREFIX}${userId}`;
}
export async function getCachedQuotaCount(userId) {
    try {
        const redis = await getRedisClient();
        const cached = await redis.get(getQuotaKey(userId));
        return cached !== null ? parseInt(cached, 10) : null;
    }
    catch (error) {
        console.warn("Failed to get cached quota count:", error);
        return null;
    }
}
export async function setCachedQuotaCount(userId, count) {
    try {
        const redis = await getRedisClient();
        await redis.setEx(getQuotaKey(userId), QUOTA_TTL_SECONDS, count.toString());
    }
    catch (error) {
        console.warn("Failed to set cached quota count:", error);
    }
}
export async function invalidateQuotaCache(userId) {
    try {
        const redis = await getRedisClient();
        await redis.del(getQuotaKey(userId));
    }
    catch (error) {
        console.warn("Failed to invalidate quota cache:", error);
    }
}
