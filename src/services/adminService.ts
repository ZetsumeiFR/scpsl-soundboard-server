import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../config/db.js";
import { UPLOAD_CONFIG } from "../config/upload.js";
import { invalidateQuotaCache } from "./quotaCache.js";

export interface AdminUser {
  id: string;
  steamId64: string;
  username: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: Date;
  soundCount: number;
}

export interface GetAdminUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: "username" | "createdAt" | "soundCount";
  sortOrder?: "asc" | "desc";
  filter?: "all" | "admins" | "banned";
}

export interface PaginatedAdminUsersResult {
  users: AdminUser[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getAdminUsers(
  params: GetAdminUsersParams = {}
): Promise<PaginatedAdminUsersResult> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const search = params.search?.trim();
  const sortBy = params.sortBy ?? "createdAt";
  const sortOrder = params.sortOrder ?? "desc";
  const filter = params.filter ?? "all";

  // Build where clause
  const whereClause: Record<string, unknown> = {};

  if (search) {
    whereClause.OR = [
      { username: { contains: search, mode: "insensitive" } },
      { steamId64: { contains: search } },
    ];
  }

  if (filter === "admins") {
    whereClause.isAdmin = true;
  } else if (filter === "banned") {
    whereClause.isBanned = true;
  }

  // Get users with sound count
  const [users, count] = await Promise.all([
    prisma.user.findMany({
      where: whereClause,
      include: {
        _count: {
          select: { sounds: true },
        },
      },
      orderBy:
        sortBy === "soundCount"
          ? { sounds: { _count: sortOrder } }
          : { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where: whereClause }),
  ]);

  return {
    users: users.map((user) => ({
      id: user.id,
      steamId64: user.steamId64,
      username: user.username,
      avatarUrl: user.avatarUrl,
      isAdmin: user.isAdmin,
      isBanned: user.isBanned,
      createdAt: user.createdAt,
      soundCount: user._count.sounds,
    })),
    count,
    page,
    limit,
    totalPages: Math.ceil(count / limit),
  };
}

export async function getUserById(userId: string): Promise<AdminUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: {
        select: { sounds: true },
      },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    steamId64: user.steamId64,
    username: user.username,
    avatarUrl: user.avatarUrl,
    isAdmin: user.isAdmin,
    isBanned: user.isBanned,
    createdAt: user.createdAt,
    soundCount: user._count.sounds,
  };
}

export interface UpdateUserResult {
  success: boolean;
  user?: AdminUser;
  error?: {
    code: string;
    message: string;
  };
}

export async function updateUserAdmin(
  userId: string,
  isAdmin: boolean,
  adminUserId: string
): Promise<UpdateUserResult> {
  // Prevent self-modification
  if (userId === adminUserId) {
    return {
      success: false,
      error: {
        code: "SELF_MODIFICATION",
        message: "Vous ne pouvez pas modifier vos propres droits admin",
      },
    };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Utilisateur non trouvé",
      },
    };
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { isAdmin },
    include: {
      _count: {
        select: { sounds: true },
      },
    },
  });

  return {
    success: true,
    user: {
      id: updatedUser.id,
      steamId64: updatedUser.steamId64,
      username: updatedUser.username,
      avatarUrl: updatedUser.avatarUrl,
      isAdmin: updatedUser.isAdmin,
      isBanned: updatedUser.isBanned,
      createdAt: updatedUser.createdAt,
      soundCount: updatedUser._count.sounds,
    },
  };
}

export async function updateUserBanned(
  userId: string,
  isBanned: boolean,
  adminUserId: string
): Promise<UpdateUserResult> {
  // Prevent self-modification
  if (userId === adminUserId) {
    return {
      success: false,
      error: {
        code: "SELF_MODIFICATION",
        message: "Vous ne pouvez pas vous bannir vous-même",
      },
    };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Utilisateur non trouvé",
      },
    };
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { isBanned },
    include: {
      _count: {
        select: { sounds: true },
      },
    },
  });

  return {
    success: true,
    user: {
      id: updatedUser.id,
      steamId64: updatedUser.steamId64,
      username: updatedUser.username,
      avatarUrl: updatedUser.avatarUrl,
      isAdmin: updatedUser.isAdmin,
      isBanned: updatedUser.isBanned,
      createdAt: updatedUser.createdAt,
      soundCount: updatedUser._count.sounds,
    },
  };
}

function getUserUploadDir(steamId64: string): string {
  return path.join(process.cwd(), UPLOAD_CONFIG.UPLOAD_DIR, steamId64);
}

export interface DeleteUserResult {
  success: boolean;
  deletedSoundsCount?: number;
  error?: {
    code: string;
    message: string;
  };
}

export async function deleteUserWithSounds(
  userId: string,
  adminUserId: string
): Promise<DeleteUserResult> {
  // Prevent self-deletion
  if (userId === adminUserId) {
    return {
      success: false,
      error: {
        code: "SELF_MODIFICATION",
        message: "Vous ne pouvez pas supprimer votre propre compte",
      },
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { sounds: true },
  });

  if (!user) {
    return {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Utilisateur non trouvé",
      },
    };
  }

  // Delete all sound files from filesystem
  const userDir = getUserUploadDir(user.steamId64);
  for (const sound of user.sounds) {
    const filePath = path.join(userDir, sound.filename);
    try {
      await fs.unlink(filePath);
    } catch {
      // File might already be deleted, continue
    }
  }

  // Try to remove the user directory if it's empty
  try {
    await fs.rmdir(userDir);
  } catch {
    // Directory might not be empty or doesn't exist, ignore
  }

  const soundsCount = user.sounds.length;

  // Delete user (cascade will delete sounds from DB)
  await prisma.user.delete({ where: { id: userId } });

  // Invalidate quota cache
  await invalidateQuotaCache(userId);

  return {
    success: true,
    deletedSoundsCount: soundsCount,
  };
}

export interface DeleteSoundResult {
  success: boolean;
  error?: {
    code: string;
    message: string;
  };
}

export async function deleteAnySound(soundId: string): Promise<DeleteSoundResult> {
  const sound = await prisma.sound.findUnique({
    where: { id: soundId },
    include: { user: true },
  });

  if (!sound) {
    return {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Son non trouvé",
      },
    };
  }

  // Delete file from filesystem
  const userDir = getUserUploadDir(sound.user.steamId64);
  const filePath = path.join(userDir, sound.filename);
  try {
    await fs.unlink(filePath);
  } catch {
    // File might already be deleted, continue
  }

  // Delete from database
  await prisma.sound.delete({ where: { id: soundId } });

  // Invalidate quota cache
  await invalidateQuotaCache(sound.userId);

  return { success: true };
}
