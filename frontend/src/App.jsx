import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import AuthPage from "./components/AuthPage";
import UploadPage from "./components/UploadPage";
import DashboardPage from "./components/DashboardPage";
import "./App.css";
import LeaderboardPage from "./components/LeaderboardPage";

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Navigation State Management: 'LANDING' | 'AUTH' | 'UPLOAD' | 'DASHBOARD'
  const [currentView, setCurrentView] = useState("LANDING");
  const [activeTest, setActiveTest] = useState(null);

  useEffect(() => {
    // Listen to Firebase Auth State changes
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const idToken = await currentUser.getIdToken();
          setToken(idToken);
          setCurrentView("LANDING"); // If already logged in, redirect directly to Upload [2]
        } catch (error) {
          console.error("Error fetching token:", error);
        }
      } else {
        setUser(null);
        setToken(null);
        setCurrentView("LANDING"); // Show Hero landing page by default
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleUploadSuccess = (payload) => {
    setActiveTest(payload);
    setCurrentView("DASHBOARD");
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCurrentView("LANDING");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // Triggered when clicking CTA buttons on Landing Hero section
  const handleStartTestingClick = () => {
    if (user) {
      setCurrentView("UPLOAD"); // Redirect to Upload directly [2]
    } else {
      setCurrentView("AUTH"); // Prompt Login first [2]
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
          onClick={() =>
            user ? setCurrentView("LANDING") : setCurrentView("LANDING")
          }
          style={{ cursor: "pointer" }}
        >
          IICPC Benchmark 2026
        </div>
        <div className="nav-profile">
          {user ? (
            <>
              <span
                onClick={() => setCurrentView("LEADERBOARD")}
                style={{
                  cursor: "pointer",
                  marginRight: "20px",
                  fontSize: "13px",
                  color: currentView === "LEADERBOARD" ? "#818cf8" : "#aaa",
                }}
              >
                Leaderboard
              </span>
              <span className="user-email">{user.email.split("@")[0]}</span>
              <button onClick={handleLogout} className="signout-button">
                Sign Out
              </button>
            </>
          ) : (
            currentView !== "AUTH" && (
              <button
                onClick={() => setCurrentView("AUTH")}
                className="login-nav-btn"
              >
                Sign In
              </button>
            )
          )}
        </div>
      </nav>

      <main className="content-area">
        {/* LANDING / HERO SECTION VIEW */}
        {currentView === "LANDING" && (
          <div className="hero-section">
            <video autoPlay muted playsInline className="hero-video">
              <source
                src="/Firefly Prompt- A premium 3D motion graphics video designed for a website hero section background. A.mp4"
                type="video/mp4"
              />
              Your browser does not support the video tag.
            </video>
            <div className="hero-content">
              {/* <span className="badge-new">IICPC SUMMER HACKATHON 2026</span> */}
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
        )}

        {currentView === "AUTH" && <AuthPage />}

        {currentView === "UPLOAD" && (
          <UploadPage userToken={token} onUploadSuccess={handleUploadSuccess} />
        )}

        {currentView === "DASHBOARD" && activeTest && (
          <DashboardPage
            activeTest={activeTest}
            userToken={token}
            onBackToUpload={() => setCurrentView("UPLOAD")}
            onViewLeaderboard={() => setCurrentView("LEADERBOARD")}
          />
        )}
        {currentView === "LEADERBOARD" && (
          <LeaderboardPage onBackToUpload={() => setCurrentView("UPLOAD")} />
        )}
      </main>
    </div>
  );
}

export default App;