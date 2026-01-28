import { fileTypeFromBuffer } from "file-type";
import { UPLOAD_CONFIG } from "../config/upload.js";
import { getAudioDuration } from "./ffmpeg.js";
import { getSettings } from "./settingsService.js";
import type { ValidationResult } from "../types/sound.js";

export async function validateAudioFile(
  buffer: Buffer,
  tempFilePath: string
): Promise<ValidationResult> {
  // Get dynamic settings
  const settings = await getSettings();

  // 1. Validate file size using dynamic setting
  if (buffer.length > settings.maxFileSize) {
    return {
      valid: false,
      error: {
        code: "FILE_TOO_LARGE",
        message: `Le fichier dépasse la taille maximale de ${(settings.maxFileSize / 1024 / 1024).toFixed(1)} Mo`,
      },
    };
  }

  // 2. Validate real MIME type using file-type
  const fileTypeResult = await fileTypeFromBuffer(buffer);

  if (!fileTypeResult) {
    return {
      valid: false,
      error: {
        code: "INVALID_FILE_TYPE",
        message: "Impossible de déterminer le type de fichier",
      },
    };
  }

  // Use dynamic allowed formats with fallback to include common audio MIME variants
  const allowedMimes = new Set<string>(settings.allowedFormats);
  // Add common variations for wav format
  if (allowedMimes.has("audio/wav")) {
    allowedMimes.add("audio/wave");
    allowedMimes.add("audio/x-wav");
  }

  if (!allowedMimes.has(fileTypeResult.mime)) {
    return {
      valid: false,
      error: {
        code: "INVALID_AUDIO_FORMAT",
        message: `Format audio non supporté. Formats acceptés : MP3, WAV, OGG`,
      },
    };
  }

  // 3. Validate duration using ffprobe with dynamic setting
  let duration: number;
  try {
    duration = await getAudioDuration(tempFilePath);
  } catch {
    return {
      valid: false,
      error: {
        code: "INVALID_AUDIO",
        message: "Impossible de lire le fichier audio",
      },
    };
  }

  if (duration > settings.maxDuration) {
    return {
      valid: false,
      error: {
        code: "DURATION_TOO_LONG",
        message: `La durée maximale est de ${settings.maxDuration} secondes (durée : ${duration.toFixed(1)}s)`,
      },
    };
  }

  return {
    valid: true,
    duration,
  };
}

export function validateSoundName(name: string): ValidationResult {
  const trimmedName = name.trim();

  if (trimmedName.length < UPLOAD_CONFIG.NAME_MIN_LENGTH) {
    return {
      valid: false,
      error: {
        code: "NAME_TOO_SHORT",
        message: `Le nom doit contenir au moins ${UPLOAD_CONFIG.NAME_MIN_LENGTH} caractère`,
      },
    };
  }

  if (trimmedName.length > UPLOAD_CONFIG.NAME_MAX_LENGTH) {
    return {
      valid: false,
      error: {
        code: "NAME_TOO_LONG",
        message: `Le nom ne peut pas dépasser ${UPLOAD_CONFIG.NAME_MAX_LENGTH} caractères`,
      },
    };
  }

  return { valid: true };
}
