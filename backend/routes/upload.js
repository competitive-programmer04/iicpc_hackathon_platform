import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { tsClient } from '../server.js';

// Core Middlewares & Utilities
import upload from '../middleware/upload.js'; 
import FileSanitizer from '../utils/sanitizer.js';
import { verifyToken } from '../auth/middleware.js'; 

// Imported our centralized FIFO Scheduler Queue
import queueInstance from '../services/queue.js'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

/**
 * POST /api/v1/submissions/submit
 * 
 * Secure API Endpoint to:
 * 1. Verify user authenticity (JWT token check).
 * 2. Accept and validate the binary upload payload size and extension [2].
 * 3. Sanitize file name against path-traversal attacks.
 * 4. Safely enqueue the job to the FIFO scheduler to run tests isolated [1, 2].
 */
router.post('/submit', verifyToken, upload.single('submission_file'), async (req, res) => {
  let tempPath;
  try {
    // 1. Verify file exists in request payload
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No binary file uploaded.' });
    }

    tempPath = req.file.path;
    let safeName;

    try {
      // 2. Strict filename sanitization
      safeName = FileSanitizer.sanitizeFilename(req.file.originalname);
    } catch (sanitizationError) {
      // Instantly delete un-sanitized temp file to avoid storage fill-up attacks
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      return res.status(400).json({ success: false, error: sanitizationError.message });
    }

    const finalPath = path.join(__dirname, '..', 'uploads', safeName);

    // 3. Move file from temp disk store to permanent uploads path
    fs.renameSync(tempPath, finalPath);

    //const teamId = req.user?.uid || 'anonymous';
    const teamId=req.user.email?req.user.email.split("@")[0]:"anonymous";
    const submissionId = Date.now().toString(); 

    // 4. ENQUEUE BENCHMARK JOB IN FIFO SCHEDULER
    // Instantly returns without blocking the main event-driven thread [2]
    queueInstance.enqueue({
      teamId: teamId,
      submissionId: submissionId,
      binaryPath: finalPath
    });

    await tsClient.query(`insert into submissions (team_id,submission_id) values($1,$2)`,[teamId,submissionId]);
    console.log("successfully created submissions table")

    // Fast, responsive payload returned to the frontend
    return res.status(201).json({
      success: true,
      message: 'Binary successfully submitted, verified, and placed in the evaluation queue.',
      payload: {
        filename: safeName,
        teamId: teamId,
        submissionId:submissionId,
        submittedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Upload & Queue scheduling route error:', error);
    // Cleanup residual files on unexpected runtime failures
    if (tempPath && fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    return res.status(500).json({ success: false, error: 'Internal sandbox processing error.' });
  }
});

// Multer error handling middleware for graceful API error responses
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
  next();
});

export default router;