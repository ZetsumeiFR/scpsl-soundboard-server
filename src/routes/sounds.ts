import { Router } from "express";
import fs from "node:fs";
import type { Request, Response } from "express";
import { uploadSound, handleMulterError } from "../middleware/upload.js";
import { requireAuth } from "../middleware/auth.js";
import { requireUploadRateLimit } from "../middleware/rateLimiter.js";
import {
  createSound,
  deleteSound,
  renameSound,
  getUserSounds,
  getUserSoundCount,
  getSoundById,
  getSoundFilePath,
} from "../services/soundService.js";
import { UPLOAD_CONFIG } from "../config/upload.js";
import { notifyPlayerSoundsUpdated } from "../socket/index.js";

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /sounds - List user's sounds with pagination and search
router.get("/", async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    // Parse query params
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.q as string) || undefined;

    const result = await getUserSounds(user.id, { page, limit, search });
    const totalCount = await getUserSoundCount(user.id);

    res.json({
      sounds: result.sounds,
      count: result.count,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      totalCount,
      maxSounds: UPLOAD_CONFIG.MAX_SOUNDS_PER_USER,
    });
  } catch (error) {
    console.error("Error fetching sounds:", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Erreur lors de la récupération des sons",
      },
    });
  }
});

// POST /sounds - Upload a new sound
router.post("/", requireUploadRateLimit, uploadSound, handleMulterError, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const file = req.file;
    const name = req.body.name as string | undefined;

    // Validate file presence
    if (!file) {
      return res.status(400).json({
        error: {
          code: "NO_FILE",
          message: "Aucun fichier audio fourni",
        },
      });
    }

    // Validate name presence
    if (!name || typeof name !== "string") {
      return res.status(400).json({
        error: {
          code: "NO_NAME",
          message: "Le nom du son est requis",
        },
      });
    }

    // Create the sound
    const result = await createSound(user.id, user.steamId64, name, file);

    if (!result.success) {
      // Map error codes to HTTP status codes
      const statusMap: Record<string, number> = {
        FILE_TOO_LARGE: 413,
        INVALID_FILE_TYPE: 415,
        INVALID_AUDIO_FORMAT: 415,
        INVALID_AUDIO: 422,
        DURATION_TOO_LONG: 422,
        NAME_TOO_SHORT: 400,
        NAME_TOO_LONG: 400,
        QUOTA_EXCEEDED: 403,
      };

      const status = statusMap[result.error!.code] || 400;
      return res.status(status).json({ error: result.error });
    }

    // Notify connected plugin of new sound
    notifyPlayerSoundsUpdated(user.steamId64).catch(console.error);

    res.status(201).json({ sound: result.sound });
  } catch (error) {
    console.error("Error uploading sound:", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Erreur lors de l'upload du son",
      },
    });
  }
});

// GET /sounds/:id/stream - Stream audio file
router.get("/:id/stream", async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const soundId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    // Find the sound
    const sound = await getSoundById(user.id, soundId);
    if (!sound) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Son non trouvé",
        },
      });
    }

    // Get file path and stream
    const filePath = await getSoundFilePath(user.steamId64, sound.filename);

    // Check file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: {
          code: "FILE_NOT_FOUND",
          message: "Fichier audio non trouvé",
        },
      });
    }

    // Set headers for audio streaming
    res.setHeader("Content-Type", "audio/ogg");
    res.setHeader("Content-Length", sound.size);
    res.setHeader("Accept-Ranges", "bytes");

    // Stream the file
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (error) {
    console.error("Error streaming sound:", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Erreur lors de la lecture du son",
      },
    });
  }
});

// PATCH /sounds/:id - Rename a sound
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const soundId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const { name } = req.body as { name?: string };

    // Validate name presence
    if (!name || typeof name !== "string") {
      return res.status(400).json({
        error: {
          code: "NO_NAME",
          message: "Le nom du son est requis",
        },
      });
    }

    const result = await renameSound(user.id, soundId, name);

    if (!result.success) {
      // Map error codes to HTTP status codes
      const statusMap: Record<string, number> = {
        NAME_TOO_SHORT: 400,
        NAME_TOO_LONG: 400,
        NOT_FOUND: 404,
      };

      const status = statusMap[result.error!.code] || 400;
      return res.status(status).json({ error: result.error });
    }

    // Notify connected plugin of renamed sound
    notifyPlayerSoundsUpdated(user.steamId64).catch(console.error);

    res.json({ sound: result.sound });
  } catch (error) {
    console.error("Error renaming sound:", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Erreur lors du renommage du son",
      },
    });
  }
});

// DELETE /sounds/:id - Delete a sound
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const soundId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    const result = await deleteSound(user.id, user.steamId64, soundId);

    if (!result.success) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: result.error,
        },
      });
    }

    // Notify connected plugin of deleted sound
    notifyPlayerSoundsUpdated(user.steamId64).catch(console.error);

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting sound:", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Erreur lors de la suppression du son",
      },
    });
  }
});

export default router;
