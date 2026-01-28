import { z } from "zod";

export const settingsSchema = z.object({
  maxSoundsPerUser: z.number().int().min(1).max(100),
  maxFileSize: z.number().int().min(102400).max(52428800), // 100KB - 50MB
  maxDuration: z.number().min(1).max(60),
  cooldownSeconds: z.number().int().min(0).max(300),
  allowedFormats: z.array(z.string()).min(1),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  maxSoundsPerUser: 25,
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxDuration: 10,
  cooldownSeconds: 0,
  allowedFormats: ["audio/ogg", "audio/mpeg", "audio/wav"],
};

export const partialSettingsSchema = settingsSchema.partial();

export type PartialSettings = z.infer<typeof partialSettingsSchema>;
