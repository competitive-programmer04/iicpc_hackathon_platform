import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { initializeApp, cert } from "firebase-admin/app";
import { readFileSync, existsSync } from "fs";
import {createClient} from "redis"
import {Client as PostgresClient} from "pg";
import metricsRouter from "./routes/metrics.js";

// Routes Imports
import authRoutes from "./auth/routes.js";
import uploadRoutes from "./routes/upload.js"; // Note: Hum router import kar rahe hain (.js extension ke sath)
import streamRoutes from "./routes/stream.js"; // SSE routes for telemetry streaming

// ── Firebase Admin SDK init ─────────────────────────────────────────
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
let initialized = false;

export const redisClient=createClient({url:"redis://localhost:6379"});
export const tsClient=new PostgresClient({connectionString:"postgresql://postgres:password@localhost:5433/iicpc_hackathon"});


try{
  await redisClient.connect();
  console.log("connected with redisdb server running at port 6379");
  await tsClient.connect();
  console.log("connected with timescaledb server running at port 5432");
  console.log("creating tables inside my iicpc_hackathon database");
  const creatingTable=`
  create table if not exists metrics_trading_engine(
    id serial,
    submission_id varchar(50) not null,
    recorded_at timestamptz not null,
    time_second int not null,
    tps int,
    p50_lat float,
    p99_lat float,
    accuracy float,
    primary key (id,recorded_at)
);

select create_hypertable('metrics_trading_engine','recorded_at', if_not_exists => TRUE);

create table if not exists submissions(
    id serial primary key,
    team_id varchar(30),
    submission_id varchar(50)
);`;
await tsClient.query(creatingTable);
console.log("successfully created tables");
  try {
  if (serviceAccountPath && existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));
    initializeApp({ credential: cert(serviceAccount) });
    initialized = true;
    console.log("✓ Firebase Admin initialized");
  } else if (process.env.FIREBASE_PROJECT_ID) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
    initialized = true;
    console.log("✓ Firebase Admin initialized with environment variables.");
  } else {
    console.warn(
      "⚠ Warning: No Firebase credentials found. Running in offline/development mode."
    );
  }
} catch (err) {
  console.error("⚠ Firebase Admin Initialization Error:", err.message);
}

// ======= Express App Setup =======
const app = express();
const PORT = process.env.PORT || 3000;

// 1. GLOBAL MIDDLEWARES (Humesha Routes se pehle aane chahiye!)

// Security headers
app.use(helmet());

// CORS config - Local frontend requests ko allow karne ke liye
const frontendOrigin = process.env.FRONTEND_URL || [/^http:\/\/localhost(:\d+)?$/];
app.use(
  cors({
    origin: frontendOrigin,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body Parser with strict limit (For JSON requests)
app.use(express.json({ limit: "16kb" }));

// Context Injector Middleware
app.use((req, res, next) => {
  req.firebaseInitialized = initialized;
  next();
});

// 2. ROUTES MOUNTING (Clean modular routing structure)

// Authenticaton Routes (/auth/...)
app.use("/auth", authRoutes);

// File Upload Submissions Route (/api/v1/submissions/submit)
// Note: Is ek line se routes/upload.js ke saare internal routes (jaise "/submit") automatically bind ho jayenge.
app.use("/api/v1/submissions", uploadRoutes);

// SSE Routes for Telemetry Streaming
app.use("/api/v1/submissions", streamRoutes);

// Base route for server health check
app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "icpc-hackathon-auth-and-benchmark",
    firebaseConfigured: initialized,
  });
});

app.use("/api/v1/submissions",metricsRouter)

// 3. LISTEN TO PORT
app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
});

}catch(err){
  console.log("not connected with database due to the error ",err)
}
