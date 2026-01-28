import "dotenv/config";
function requireEnv(key) {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}
export const env = {
    // Database
    databaseUrl: requireEnv("DATABASE_URL"),
    // Redis
    redisUrl: requireEnv("REDIS_URL"),
    // Steam
    steamApiKey: requireEnv("STEAM_API_KEY"),
    // Session
    sessionSecret: requireEnv("SESSION_SECRET"),
    // URLs
    frontendUrl: requireEnv("FRONTEND_URL"),
    backendUrl: requireEnv("BACKEND_URL"),
    // Server
    nodeEnv: process.env.NODE_ENV || "development",
    port: parseInt(process.env.PORT || "3001", 10),
    // Limits
    maxSoundsPerUser: parseInt(process.env.MAX_SOUNDS_PER_USER || "25", 10),
    // Derived
    get isDev() {
        return this.nodeEnv === "development";
    },
    get isProd() {
        return this.nodeEnv === "production";
    },
};
