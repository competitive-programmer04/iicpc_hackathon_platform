import express from 'express';
import eventBus from '../utils/eventBus.js'; // Communication utility

const router = express.Router();

/**
 * GET /api/v1/submissions/stream
 * Server-Sent Events Endpoint to stream live telemetry metrics.
 */
router.get('/stream', (req, res) => {
  const { submissionId } = req.query; // Capture submissionId query param [2]

  if (!submissionId) {
    return res.status(400).json({ success: false, error: 'submissionId is required.' });
  }

  // 1. Establish SSE HTTP Headers [2]
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Handshake instantly [2]

  console.log(`[SSE] Client connected. Streaming submission: ${submissionId}`);

  // 2. Define standard event listener callback [2]
  const onTelemetryEvent = (data) => {
    // SSE data standard format: "data: <STRING_JSON>\n\n" [2]
    res.write(`data: ${JSON.stringify(data)}\n\n`);

    // Close stream on connection end [2]
    if (data.completed) {
      console.log(`[SSE] Stream complete for submission: ${submissionId}. Closing socket...`);
      eventBus.off(`stream:${submissionId}`, onTelemetryEvent); // Remove listener
      res.end();
    }
  };

  // 3. Subscribe listener to Event Bus [2]
  eventBus.on(`stream:${submissionId}`, onTelemetryEvent);

  // 4. Memory Leak Protection [2]
  // If user closes/refreshes the browser, cleanly remove listener from Event Bus [2]
  req.on('close', () => {
    console.log(`[SSE] Client disconnected mid-run. Cleaning up subscription for: ${submissionId}`);
    eventBus.off(`stream:${submissionId}`, onTelemetryEvent);
    res.end();
  });
});

export default router;