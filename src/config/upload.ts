import { env } from "./env.js";

export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 1 * 1024 * 1024, // 1 Mo
  MAX_DURATION_SECONDS: 10,
  MAX_SOUNDS_PER_USER: env.maxSoundsPerUser,
  ALLOWED_MIME_TYPES: [
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/wave",
    "audio/x-wav",
  ],
  ALLOWED_EXTENSIONS: [".mp3", ".wav", ".ogg"],
  UPLOAD_DIR: "uploads",
  NAME_MAX_LENGTH: 32,
  NAME_MIN_LENGTH: 1,
} as const;
