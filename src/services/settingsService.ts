import { getRedisClient } from "../config/redis.js";
import { prisma } from "../config/db.js";
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  partialSettingsSchema,
  type Settings,
  type PartialSettings,
} from "../schemas/settings.js";

const SETTINGS_CACHE_KEY = "settings:all";
const SETTINGS_TTL_SECONDS = 300; // 5 minutes

export async function getSettings(): Promise<Settings> {
  // 1. Try Redis cache
  try {
    const redis = await getRedisClient();
    const cached = await redis.get(SETTINGS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      const validated = settingsSchema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      }
    }
  } catch (error) {
    console.warn("Failed to get cached settings:", error);
  }

  // 2. Try database
  try {
    const dbSettings = await prisma.setting.findMany();
    if (dbSettings.length > 0) {
      const settingsObj: Record<string, unknown> = {};
      for (const setting of dbSettings) {
        settingsObj[setting.key] = setting.value;
      }

      // Merge with defaults for any missing keys
      const merged = { ...DEFAULT_SETTINGS, ...settingsObj };
      const validated = settingsSchema.safeParse(merged);

      if (validated.success) {
        // Cache the result
        await cacheSettings(validated.data);
        return validated.data;
      }
    }
  } catch (error) {
    console.warn("Failed to get settings from database:", error);
  }

  // 3. Fallback to defaults
  return DEFAULT_SETTINGS;
}

export async function updateSettings(
  partial: PartialSettings
): Promise<{ success: boolean; settings?: Settings; error?: string }> {
  // Validate partial input
  const validation = partialSettingsSchema.safeParse(partial);
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues.map((e) => e.message).join(", "),
    };
  }

  try {
    // Get current settings to merge
    const current = await getSettings();
    const updated = { ...current, ...validation.data };

    // Validate the merged result
    const fullValidation = settingsSchema.safeParse(updated);
    if (!fullValidation.success) {
      return {
        success: false,
        error: fullValidation.error.issues.map((e) => e.message).join(", "),
      };
    }

    // Upsert each changed setting to database
    const updates = Object.entries(validation.data) as [keyof Settings, Settings[keyof Settings]][];

    await prisma.$transaction(
      updates.map(([key, value]) =>
        prisma.setting.upsert({
          where: { key },
          create: { key, value: value as object },
          update: { value: value as object },
        })
      )
    );

    // Invalidate cache
    await invalidateSettingsCache();

    // Cache the new settings
    await cacheSettings(fullValidation.data);

    return {
      success: true,
      settings: fullValidation.data,
    };
  } catch (error) {
    console.error("Failed to update settings:", error);
    return {
      success: false,
      error: "Erreur lors de la mise à jour des paramètres",
    };
  }
}

async function cacheSettings(settings: Settings): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.setEx(
      SETTINGS_CACHE_KEY,
      SETTINGS_TTL_SECONDS,
      JSON.stringify(settings)
    );
  } catch (error) {
    console.warn("Failed to cache settings:", error);
  }
}

export async function invalidateSettingsCache(): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(SETTINGS_CACHE_KEY);
  } catch (error) {
    console.warn("Failed to invalidate settings cache:", error);
  }
}
