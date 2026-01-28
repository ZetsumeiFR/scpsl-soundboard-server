export function requireAdmin(req, res, next) {
    if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
    if (req.user.isBanned) {
        return res.status(403).json({ error: { code: "BANNED", message: "Your account has been banned" } });
    }
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin access required" } });
    }
    next();
}
