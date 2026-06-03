import { initializeApp, getApps } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAaze7qLtu4x9bpLjZL3PU-RQHGz0xceGY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "icpc-d1eaf.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "icpc-d1eaf",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "icpc-d1eaf.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "951065712510",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:951065712510:web:d1f83a174d4adfc9f6052f",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-QXFVBJTZLF",
};

// Check if actual configuration exists
const isFirebaseConfigured =
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "placeholder-api-key" &&
  firebaseConfig.apiKey !== "";

let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Initialize Analytics if supported in environment (client-side browser check)
let analytics = null;
if (typeof window !== "undefined" && firebaseConfig.measurementId) {
  try {
    analytics = getAnalytics(app);
  } catch (err) {
    console.warn("Analytics initialization failed:", err.message);
  }
}

export {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  isFirebaseConfigured,
  analytics,
};

