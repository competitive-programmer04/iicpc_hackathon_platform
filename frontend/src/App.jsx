import React, { useState, useEffect } from "react";
// HashRouter guarantees perfect static reloading support in development and production [23]
import { HashRouter as Router, Routes, Route, useNavigate, Navigate, useLocation } from "react-router-dom"; 
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import AuthPage from "./components/AuthPage";
import UploadPage from "./components/UploadPage";
import DashboardPage from "./components/DashboardPage";
import "./App.css";
import LeaderboardPage from "./components/LeaderboardPage";

// ── INTERNAL APP CONTENT WRAPPER (Handles navigation state under Router context) ──
function AppContent() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const [activeTest, setActiveTest] = useState(null);

  const navigate = useNavigate();
  const location = useLocation(); // Useful to track and style active navigation tabs [25]

useEffect(() => {
  // Listen to Firebase Auth State changes
  const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
    if (currentUser) {
      setUser(currentUser);
      try {
        const idToken = await currentUser.getIdToken();
        setToken(idToken);
      } catch (error) {
        console.error("Error fetching token:", error);
      }
    } else {
      setUser(null);
      setToken(null);
    }
    
    setLoading(false); // Stop the loading spinner once Firebase replies
  });

  return () => unsubscribe();
}, []);

  const handleUploadSuccess = (payload) => {
    setActiveTest(payload);
    navigate("/dashboard"); // Redirect directly to live stream charts [25]
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // Triggered on landing hero primary CTA buttons
  const handleStartTestingClick = () => {
    if (user) {
      navigate("/upload");
    } else {
      navigate("/auth");
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loader"></div>
        <p>Verifying secure session parameters...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Dynamic Navbar */}
      <nav className="main-navbar">
        <div
          className="brand-title"
          onClick={() => navigate("/")} // Always navigate to Landing Page "/" [25]
          style={{ cursor: "pointer" }}
        >
          IICPC Benchmark 2026
        </div>
        <div className="nav-profile">
          {user ? (
            <>
              <span
                onClick={() => navigate("/leaderboard")}
                style={{
                  cursor: "pointer",
                  marginRight: "20px",
                  fontSize: "13px",
                  fontWeight: "600",
                  // Detect active routes using react-router location context [25]
                  color: location.pathname === "/leaderboard" ? "#818cf8" : "#aaa",
                }}
              >
                Leaderboard
              </span>
              {/* User Email Prefix Name Extraction logic preserved! */}
              <span className="user-email">{user.email.split("@")[0]}</span>
              <button onClick={handleLogout} className="signout-button">
                Sign Out
              </button>
            </>
          ) : (
            location.pathname !== "/auth" && (
              <button
                onClick={() => navigate("/auth")}
                className="login-nav-btn"
              >
                Sign In
              </button>
            )
          )}
        </div>
      </nav>

      {/* Main Content Area - Mapped cleanly via React Router [25] */}
      <main className="content-area">
        <Routes>
          {/* LANDING / HERO PAGE ROUTE [25] */}
          <Route path="/" element={
            <div className="hero-section">
              <video autoPlay muted playsInline className="hero-video">
                <source
                  src="/Firefly Prompt- A premium 3D motion graphics video designed for a website hero section background. A.mp4"
                  type="video/mp4"
                />
                Your browser does not support the video tag.
              </video>
              <div className="hero-content">
                <h1 className="hero-title">
                  Distributed Benchmarking & <br />
                  <span className="gradient-text">Hosting Platform</span>
                </h1>
                <p className="hero-subtitle">
                  Evaluate contestant-submitted trading infrastructure under
                  extreme market volatility. Secure sandboxing, dynamic load
                  generation, and live telemetry ingestion.
                </p>

                <div className="hero-cta-buttons">
                  <button
                    onClick={handleStartTestingClick}
                    className="cta-primary"
                  >
                    Run Stress Test Suite
                  </button>
                  <button
                    onClick={() =>
                      window.open("https://github.com/ASV-Group/IICPC-Hackathon")
                    }
                    className="cta-secondary"
                  >
                    Documentation
                  </button>
                </div>
              </div>

              {/* Feature Highlights Grid */}
              <div className="features-grid">
                <div className="feature-card">
                  <div className="feature-icon">🛡️</div>
                  <h3>Secure Sandboxing</h3>
                  <p>
                    Strict CPU pinning and memory limits inside hardened isolation
                    containers [1].
                  </p>
                </div>
                <div className="feature-card">
                  <div className="feature-icon">🚀</div>
                  <h3>Distributed Bot Fleet</h3>
                  <p>
                    Simulate volatile market movements with high-velocity
                    concurrent orders [1].
                  </p>
                </div>
                <div className="feature-card">
                  <div className="feature-icon">📊</div>
                  <h3>Live Telemetry</h3>
                  <p>
                    Track throughput limits, correctness priority, and latency
                    metrics in real-time [1].
                  </p>
                </div>
              </div>
            </div>
          } />

          {/* AUTHENTICATION ROUTE */}
          <Route path="/auth" element={
            user ? <Navigate to="/" /> : <AuthPage /> // Redirect if already logged-in [25]
          } />

          {/* SECURE BINARY UPLOAD ROUTE (Protected) [25] */}
          <Route path="/upload" element={
            user ? <UploadPage userToken={token} onUploadSuccess={handleUploadSuccess} /> : <Navigate to="/auth" />
          } />

          {/* LIVE TELEMETRY DASHBOARD ROUTE (Protected) [25] */}
           <Route path="/dashboard" element={
            user && activeTest ? (
              <DashboardPage
                activeTest={activeTest}
                userToken={token}
                onBackToUpload={() => {
                  setActiveTest(null); // 🧹 THE FIX: Clear the old test data!
                  navigate("/upload");
                }}
                onViewLeaderboard={() => navigate("/leaderboard")}
              />
            ) : (
              <Navigate to="/upload" />
            )
          } />

          {/* GLOBAL LEADERBOARD ROUTE */}
          <Route path="/leaderboard" element={
            user ? (
              <LeaderboardPage 
                onBackToUpload={() => {
                  setActiveTest(null); // 🧹 THE FIX: Clear it here too!
                  navigate("/upload");
                }} 
              />
            ) : (
              <Navigate to="/auth" />
            )
          } />

          {/* Fallback Catch-all Route [25] */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

// ── ROOT COMPONENT (Provides the Router context safely) ──
export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}