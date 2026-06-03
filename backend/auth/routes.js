import { Router } from "express";
import { getAuth } from "firebase-admin/auth";
import validator from "validator";
import { verifyToken, sanitizeBody } from "./middleware.js";

const router = Router();

/**
 * POST /auth/google
 * Verifies a Firebase ID token obtained from Google Sign-In on the client.
 * Body: { idToken: string }
 */
router.post("/google", sanitizeBody, async (req, res) => {
  try {
    if (!req.firebaseInitialized) {
      return res.status(503).json({
        error: "Authentication service unavailable (Firebase Admin not configured on server)",
      });
    }

    const { idToken } = req.body;

    if (!idToken || typeof idToken !== "string") {
      return res.status(400).json({ error: "idToken is required" });
    }

    const rawToken = validator.unescape(idToken);

    const decoded = await getAuth().verifyIdToken(rawToken);

    return res.json({
      verified: true,
      user: {
        uid: decoded.uid,
        email: decoded.email || null,
        name: decoded.name || null,
        picture: decoded.picture || null,
        provider: "google",
      },
    });
  } catch (err) {
    console.error("Google auth verification failed:", err.message);
    return res.status(401).json({ error: "Invalid Google token" });
  }
});

/**
 * POST /auth/email-signin
 * Verifies a Firebase ID token obtained from email/password sign-in/up on the client.
 * Body: { idToken: string, email: string }
 */
router.post("/email-signin", sanitizeBody, async (req, res) => {
  try {
    if (!req.firebaseInitialized) {
      return res.status(503).json({
        error: "Authentication service unavailable (Firebase Admin not configured on server)",
      });
    }

    const { idToken, email } = req.body;

    if (!idToken || typeof idToken !== "string") {
      return res.status(400).json({ error: "idToken is required" });
    }

    if (email) {
      const rawEmail = validator.unescape(email);
      if (!validator.isEmail(rawEmail)) {
        return res.status(400).json({ error: "Invalid email format" });
      }
    }

    const rawToken = validator.unescape(idToken);

    const decoded = await getAuth().verifyIdToken(rawToken);

    return res.json({
      verified: true,
      user: {
        uid: decoded.uid,
        email: decoded.email || null,
        name: decoded.name || decoded.email?.split("@")[0] || null,
        provider: "email",
      },
    });
  } catch (err) {
    console.error("Email auth verification failed:", err.message);
    return res.status(401).json({ error: "Invalid email auth token" });
  }
});

/**
 * GET /auth/me
 * Returns the current user info from a valid token.
 * Protected by verifyToken middleware.
 */
router.get("/me", verifyToken, (req, res) => {
  res.json({
    verified: true,
    user: {
      uid: req.user.uid,
      email: req.user.email || null,
      name: req.user.name || null,
      picture: req.user.picture || null,
    },
  });
});

export default router;
