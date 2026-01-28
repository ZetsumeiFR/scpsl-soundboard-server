import { Router } from "express";
import { requireAdmin } from "../middleware/adminAuth.js";
import {
  getAdminUsers,
  getUserById,
  updateUserAdmin,
  updateUserBanned,
  deleteUserWithSounds,
  deleteAnySound,
} from "../services/adminService.js";
import { getSettings, updateSettings } from "../services/settingsService.js";
import { partialSettingsSchema } from "../schemas/settings.js";

const router = Router();

// All admin routes require admin authentication
router.use(requireAdmin);

// GET /admin/users - List users with pagination, search, sort, filter
router.get("/users", async (req, res) => {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const search = req.query.q as string | undefined;
    const sortBy = req.query.sortBy as "username" | "createdAt" | "soundCount" | undefined;
    const sortOrder = req.query.sortOrder as "asc" | "desc" | undefined;
    const filter = req.query.filter as "all" | "admins" | "banned" | undefined;

    const result = await getAdminUsers({
      page,
      limit,
      search,
      sortBy,
      sortOrder,
      filter,
    });

    res.json(result);
  } catch (error) {
    console.error("Error fetching admin users:", error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" },
    });
  }
});

// GET /admin/users/:id - Get user details
router.get("/users/:id", async (req, res) => {
  try {
    const user = await getUserById(req.params.id);

    if (!user) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Utilisateur non trouvé" },
      });
    }

    res.json({ user });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" },
    });
  }
});

// PATCH /admin/users/:id - Update user (ban/admin status)
router.patch("/users/:id", async (req, res) => {
  try {
    const { isAdmin, isBanned } = req.body;
    const targetUserId = req.params.id;
    const adminUserId = req.user!.id;

    // Handle admin toggle
    if (typeof isAdmin === "boolean") {
      const result = await updateUserAdmin(targetUserId, isAdmin, adminUserId);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      return res.json({ user: result.user });
    }

    // Handle ban toggle
    if (typeof isBanned === "boolean") {
      const result = await updateUserBanned(targetUserId, isBanned, adminUserId);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      return res.json({ user: result.user });
    }

    res.status(400).json({
      error: { code: "INVALID_REQUEST", message: "Aucune modification fournie" },
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" },
    });
  }
});

// DELETE /admin/users/:id - Delete user and their sounds
router.delete("/users/:id", async (req, res) => {
  try {
    const result = await deleteUserWithSounds(req.params.id, req.user!.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      deletedSoundsCount: result.deletedSoundsCount,
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" },
    });
  }
});

// DELETE /admin/sounds/:id - Delete any sound
router.delete("/sounds/:id", async (req, res) => {
  try {
    const result = await deleteAnySound(req.params.id);

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting sound:", error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" },
    });
  }
});

// GET /admin/settings - Get current settings
router.get("/settings", async (_req, res) => {
  try {
    const settings = await getSettings();
    res.json({ settings });
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" },
    });
  }
});

// PUT /admin/settings - Update settings (partial)
router.put("/settings", async (req, res) => {
  try {
    const validation = partialSettingsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: validation.error.issues.map((e) => e.message).join(", "),
        },
      });
    }

    const result = await updateSettings(validation.data);

    if (!result.success) {
      return res.status(400).json({
        error: { code: "UPDATE_FAILED", message: result.error },
      });
    }

    res.json({ settings: result.settings });
  } catch (error) {
    console.error("Error updating settings:", error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" },
    });
  }
});

export default router;
