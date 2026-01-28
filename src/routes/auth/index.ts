import { Router } from "express";
import { env } from "../../config/env.js";
import { passport } from "../../config/passport.js";
import { requireAuth } from "../../middleware/auth.js";

const router = Router();

// Initiate Steam login
router.get("/steam", passport.authenticate("steam"));

// Steam callback
router.get(
  "/steam/callback",
  passport.authenticate("steam", {
    failureRedirect: `${env.frontendUrl}/login?error=auth_failed`,
  }),
  (_req, res) => {
    // Successful authentication, redirect to soundboard
    res.redirect(`${env.frontendUrl}/soundboard`);
  },
);

// Get current user
router.get("/me", (req, res) => {
  if (req.isAuthenticated() && req.user) {
    res.json({
      user: {
        id: req.user.id,
        steamId64: req.user.steamId64,
        username: req.user.username,
        avatarUrl: req.user.avatarUrl,
        isAdmin: req.user.isAdmin,
      },
    });
  } else {
    res.json({ user: null });
  }
});

// Logout
router.post("/logout", requireAuth, (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        console.error("Session destroy error:", destroyErr);
      }
      res.clearCookie("scp.sid");
      res.json({ success: true });
    });
  });
});

export default router;
