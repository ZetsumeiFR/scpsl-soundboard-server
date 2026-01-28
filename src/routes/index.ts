import { Router } from "express";
import authRoutes from "./auth/index.js";
import soundsRoutes from "./sounds.js";
import adminRoutes from "./admin.js";

const router = Router();

// Health check
router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Auth routes
router.use("/auth", authRoutes);

// Sounds routes
router.use("/sounds", soundsRoutes);

// Admin routes
router.use("/admin", adminRoutes);

export default router;
