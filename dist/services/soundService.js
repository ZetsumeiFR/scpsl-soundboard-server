import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../config/db.js";
import { UPLOAD_CONFIG } from "../config/upload.js";
import { convertToOggOpus } from "./ffmpeg.js";
import { validateAudioFile, validateSoundName } from "./audioValidator.js";
import { getCachedQuotaCount, setCachedQuotaCount, invalidateQuotaCache, } from "./quotaCache.js";
import { getSettings } from "./settingsService.js";
function toSoundDTO(sound) {
    return {
        id: sound.id,
        name: sound.name,
        filename: sound.filename,
        duration: sound.duration,
        size: sound.size,
        createdAt: sound.createdAt,
    };
}
function getUserUploadDir(steamId64) {
    return path.join(process.cwd(), UPLOAD_CONFIG.UPLOAD_DIR, steamId64);
}
async function ensureUserDir(steamId64) {
    const userDir = getUserUploadDir(steamId64);
    await fs.mkdir(userDir, { recursive: true });
    return userDir;
}
export async function getUserSoundCount(userId) {
    // Check cache first
    const cached = await getCachedQuotaCount(userId);
    if (cached !== null) {
        return cached;
    }
    // Query database and cache the result
    const count = await prisma.sound.count({
        where: { userId },
    });
    await setCachedQuotaCount(userId, count);
    return count;
}
export async function canUserUpload(userId) {
    const count = await getUserSoundCount(userId);
    const settings = await getSettings();
    return count < settings.maxSoundsPerUser;
}
export async function getUserSounds(userId, params = {}) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const search = params.search?.trim();
    const whereClause = {
        userId,
        ...(search && {
            name: {
                contains: search,
                mode: "insensitive",
            },
        }),
    };
    const [sounds, count] = await Promise.all([
        prisma.sound.findMany({
            where: whereClause,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.sound.count({
            where: whereClause,
        }),
    ]);
    return {
        sounds: sounds.map(toSoundDTO),
        count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
    };
}
export async function getSoundById(userId, soundId) {
    return prisma.sound.findFirst({
        where: {
            id: soundId,
            userId,
        },
    });
}
export async function getSoundFilePath(steamId64, filename) {
    return path.join(getUserUploadDir(steamId64), filename);
}
export async function createSound(userId, steamId64, name, file) {
    // 1. Validate name
    const nameValidation = validateSoundName(name);
    if (!nameValidation.valid) {
        return {
            success: false,
            error: nameValidation.error,
        };
    }
    // 2. Check quota with dynamic settings
    const settings = await getSettings();
    const count = await getUserSoundCount(userId);
    if (count >= settings.maxSoundsPerUser) {
        return {
            success: false,
            error: {
                code: "QUOTA_EXCEEDED",
                message: `Limite de ${settings.maxSoundsPerUser} sons atteinte`,
            },
        };
    }
    // 3. Ensure user directory exists
    const userDir = await ensureUserDir(steamId64);
    // 4. Save temp file for validation
    const tempId = uuidv4();
    const tempPath = path.join(userDir, `temp_${tempId}`);
    try {
        await fs.writeFile(tempPath, file.buffer);
        // 5. Validate audio file
        const validation = await validateAudioFile(file.buffer, tempPath);
        if (!validation.valid) {
            await fs.unlink(tempPath).catch(() => { });
            return {
                success: false,
                error: validation.error,
            };
        }
        // 6. Convert to OGG Opus
        const finalFilename = `${uuidv4()}.ogg`;
        const finalPath = path.join(userDir, finalFilename);
        await convertToOggOpus(tempPath, finalPath);
        // 7. Clean up temp file
        await fs.unlink(tempPath).catch(() => { });
        // 8. Get final file size
        const stats = await fs.stat(finalPath);
        // 9. Create database entry
        const sound = await prisma.sound.create({
            data: {
                name: name.trim(),
                filename: finalFilename,
                duration: validation.duration,
                size: stats.size,
                userId,
            },
        });
        // 10. Invalidate quota cache
        await invalidateQuotaCache(userId);
        return {
            success: true,
            sound: toSoundDTO(sound),
        };
    }
    catch (error) {
        // Clean up on error
        await fs.unlink(tempPath).catch(() => { });
        console.error("Error creating sound:", error);
        return {
            success: false,
            error: {
                code: "INTERNAL_ERROR",
                message: "Une erreur est survenue lors du traitement du fichier",
            },
        };
    }
}
export async function renameSound(userId, soundId, newName) {
    // 1. Validate the name
    const nameValidation = validateSoundName(newName);
    if (!nameValidation.valid) {
        return {
            success: false,
            error: nameValidation.error,
        };
    }
    // 2. Find and verify ownership
    const sound = await getSoundById(userId, soundId);
    if (!sound) {
        return {
            success: false,
            error: {
                code: "NOT_FOUND",
                message: "Son non trouvé",
            },
        };
    }
    // 3. Update the sound name
    const updatedSound = await prisma.sound.update({
        where: { id: soundId },
        data: { name: newName.trim() },
    });
    return {
        success: true,
        sound: toSoundDTO(updatedSound),
    };
}
export async function deleteSound(userId, steamId64, soundId) {
    // 1. Find the sound
    const sound = await getSoundById(userId, soundId);
    if (!sound) {
        return {
            success: false,
            error: "Son non trouvé",
        };
    }
    // 2. Delete file from filesystem
    const filePath = await getSoundFilePath(steamId64, sound.filename);
    try {
        await fs.unlink(filePath);
    }
    catch (error) {
        // Log but continue - file might already be deleted
        console.warn(`Could not delete file ${filePath}:`, error);
    }
    // 3. Delete from database
    await prisma.sound.delete({
        where: { id: soundId },
    });
    // 4. Invalidate quota cache
    await invalidateQuotaCache(userId);
    return { success: true };
}
