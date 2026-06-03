import { getAuth } from "firebase-admin/auth";
import validator from "validator";

/**
 * Middleware: verify Firebase ID token from Authorization header.
 * Attaches decoded token to `req.user` on success.
 */
export async function verifyToken(req, res, next) {
  if (!req.firebaseInitialized) {
    return res.status(503).json({
      error: "Authentication service unavailable (Firebase Admin not configured on server)",
    });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const token = authHeader.split("Bearer ")[1];

  // Basic token format check — Firebase ID tokens are JWTs (3 dot-separated base64 segments)
  if (!token || !/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(token)) {
    return res.status(401).json({ error: "Invalid token format" });
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Middleware: sanitize all string fields in request body.
 * Trims whitespace, escapes HTML entities, and normalizes emails.
 */
export function sanitizeBody(req, _res, next) {
  if (!req.body || typeof req.body !== "object") {
    return next();
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(req.body)) {
    if (typeof value !== "string") {
      sanitized[key] = value;
      continue;
    }

    let clean = validator.trim(value);
    
    clean = validator.escape(clean);

    if (key.toLowerCase().includes("email")) {
      const rawEmail = validator.unescape(clean);
      if (validator.isEmail(rawEmail)) {
        const normalized = validator.normalizeEmail(rawEmail);
        if (normalized) {
          clean = validator.escape(normalized);
        }
      }
    }

    sanitized[key] = clean;
  }0

  req.body = sanitized;
  next();
}
