import React, { useState } from "react";
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  isFirebaseConfigured,
} from "../firebase";
import "./AuthPage.css";

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: string }
  const [user, setUser] = useState(null); // Verified user returned from backend

  // Client-side field-level validation errors
  const [errors, setErrors] = useState({});

  // Helper to validate inputs on the frontend
  const validateForm = () => {
    const newErrors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (isSignUp && !name.trim()) {
      newErrors.name = "Name is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Backend round-trip verification call
  const verifyTokenWithBackend = async (idToken, userEmail, endpoint) => {
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
    
    const response = await fetch(`${apiUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idToken,
        email: userEmail,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Backend verification failed.");
    }
    return data;
  };

  // Google Sign-In click
  const handleGoogleSignIn = async () => {
    if (!isFirebaseConfigured) {
      setMessage({
        type: "error",
        text: "Cannot sign in: Firebase environment variables are not configured",
      });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      // 1. Google authenticate on frontend
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      
      // 2. Main auth logic & verification on backend
      const backendResult = await verifyTokenWithBackend(
        idToken,
        result.user.email,
        "/auth/google"
      );

      setUser(backendResult.user);
      setMessage({
        type: "success",
        text: `Welcome, ${backendResult.user.name || "User"}! Successfully signed in with Google and verified by backend server.`,
      });
    } catch (err) {
      console.error(err);
      setMessage({
        type: "error",
        text: err.message || "Failed to sign in with Google.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Email Submit
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (!isFirebaseConfigured) {
      setMessage({
        type: "error",
        text: "Cannot sign in: Firebase environment variables are not configured",
      });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const sanitizedEmail = email.trim();
      let credential;

      if (isSignUp) {
        // Create user with Firebase Auth
        credential = await createUserWithEmailAndPassword(auth, sanitizedEmail, password);
        // Set display name in Firebase if provided
        if (name.trim() && auth.currentUser) {
          // Typically we would updateProfile here, but since the backend is the source of truth,
          // we pass the client-entered display name directly.
        }
      } else {
        // Sign in with Firebase Auth
        credential = await signInWithEmailAndPassword(auth, sanitizedEmail, password);
      }

      const idToken = await credential.user.getIdToken();

      // Send to backend for full JWT verification, input sanitization, and session registration
      const backendResult = await verifyTokenWithBackend(
        idToken,
        sanitizedEmail,
        "/auth/email-signin"
      );

      // If sign up, customize the name using frontend input if backend returned empty
      const verifiedUser = backendResult.user;
      if (isSignUp && name.trim()) {
        verifiedUser.name = name.trim();
      }

      setUser(verifiedUser);
      setMessage({
        type: "success",
        text: isSignUp
          ? `Account successfully registered and verified by backend server!`
          : `Welcome back, ${verifiedUser.name || verifiedUser.email}! Successfully verified by backend server.`,
      });
    } catch (err) {
      console.error(err);
      let errorText = err.message;
      if (err.code === "auth/email-already-in-use") {
        errorText = "This email is already in use. Please sign in instead.";
      } else if (err.code === "auth/invalid-credential") {
        errorText = "Invalid email or password.";
      }
      setMessage({
        type: "error",
        text: errorText || "Email authentication failed.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Log out
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setMessage({ type: "success", text: "Successfully signed out." });
      setEmail("");
      setPassword("");
      setName("");
      setErrors({});
    } catch (err) {
      setMessage({ type: "error", text: "Sign out failed." });
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        {/* Step 1: Missing Configuration Warning Banner */}
        {!isFirebaseConfigured && !user && (
          <div className="auth-message alert">
            <strong>⚠ Configuration Required:</strong>
            <p style={{ margin: "4px 0 0", fontSize: "12px", lineHeight: "1.4" }}>
              Please configure your Firebase credentials in a <code>.env</code> file under <code>TEST-2/frontend/</code> to enable full authentication.
            </p>
          </div>
        )}

        {/* Step 2: Show Logged In Profile if user is verified */}
        {user ? (
          <div className="user-profile-card">
            <div className="auth-header">
              <h1>Verified Session</h1>
              <p>Secure round-trip authentication complete</p>
            </div>
            
            {user.picture ? (
              <img src={user.picture} alt={user.name || "User"} className="user-avatar" />
            ) : (
              <div className="user-avatar-placeholder">
                {(user.name || user.email || "U")[0].toUpperCase()}
              </div>
            )}

            <h3>{user.name || "Anonymous User"}</h3>
            <p>{user.email}</p>

            <div className="auth-message success" style={{ marginBottom: "24px" }}>
              Verified UID: {user.uid.slice(0, 12)}...
            </div>

            <button onClick={handleLogout} className="auth-submit-btn">
              Sign Out
            </button>
          </div>
        ) : (
          /* Step 3: Normal Form / Login buttons */
          <div>
            <div className="auth-header">
              <div className="auth-icon-container">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                  />
                </svg>
              </div>
              <span className="auth-tag">Secure access</span>
              <h1>{isSignUp ? "Create account" : "Welcome back"}</h1>
              <p>{isSignUp ? "Sign up to get started" : "Please sign in to your session"}</p>
            </div>

            {/* Google Sign In button */}
            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="auth-google-btn"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </button>

            <div className="auth-divider">
              <span>or</span>
            </div>

            {/* Email form */}
            <form onSubmit={handleEmailSubmit} className="auth-form">
              {isSignUp && (
                <div className="auth-field fade-in">
                  <label htmlFor="name-input">Full Name</label>
                  <input
                    id="name-input"
                    type="text"
                    placeholder="Enter your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={errors.name ? "input-error" : ""}
                    disabled={loading}
                  />
                  {errors.name && <p className="field-error">{errors.name}</p>}
                </div>
              )}

              <div className="auth-field">
                <label htmlFor="email-input">Email Address</label>
                <input
                  id="email-input"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={errors.email ? "input-error" : ""}
                  disabled={loading}
                />
                {errors.email && <p className="field-error">{errors.email}</p>}
              </div>

              <div className="auth-field">
                <label htmlFor="password-input">Password</label>
                <input
                  id="password-input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={errors.password ? "input-error" : ""}
                  disabled={loading}
                />
                {errors.password && <p className="field-error">{errors.password}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="auth-submit-btn"
              >
                {loading && <span className="auth-spinner"></span>}
                {isSignUp ? "Sign Up" : "Sign In"}
              </button>
            </form>

            {message && (
              <div
                className={`auth-message ${message.type}`}
                style={{ marginTop: "20px" }}
              >
                {message.text}
              </div>
            )}

            <div className="auth-toggle">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setMessage(null);
                  setErrors({});
                }}
                disabled={loading}
              >
                {isSignUp ? "Sign In" : "Sign Up"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}