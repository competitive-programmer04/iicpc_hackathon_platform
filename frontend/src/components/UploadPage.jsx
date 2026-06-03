import React, { useState, useRef } from "react";
import "./UploadPage.css"; // UI components standard separation

// FIX 1: Added 'onUploadSuccess' callback in destructured props
export default function UploadPage({ userToken, onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({
    success: null,
    message: "",
  });
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    // Client-side Sanitization check
    const ext = selectedFile.name.split(".").pop();
    const allowedExtensions = ["zip", ""]; // Extensionless binaries check

    // Minimal validation to give rapid UX feedback
    if (selectedFile.size > 50 * 1024 * 1024) {
      setUploadStatus({
        success: false,
        message: "File is too large! Maximum limit is 50MB.",
      });
      return;
    }

    setFile(selectedFile);
    setUploadStatus({ success: null, message: "" });
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setUploadStatus({
        success: false,
        message: "Please select a file to submit.",
      });
      return;
    }

    setLoading(true);
    setUploadStatus({
      success: null,
      message: "Uploading and scanning binary...",
    });

    const formData = new FormData();
    formData.append("submission_file", file);

    try {
      const response = await fetch(
        "http://localhost:3000/api/v1/submissions/submit",
        {
          method: "POST",
          headers: {
            // Send Bearer token verified from AuthPage/Firebase
            Authorization: `Bearer ${userToken}`,
          },
          body: formData,
        },
      );

      const result = await response.json();

      // FIX 2: Restructured success/failure conditional routing [2]
      if (response.ok && result.success) {
        setUploadStatus({
          success: true,
          message: `Submission successful! Safe file identified as: ${result.payload.filename}`,
        });
        setFile(null); // Clear input on success
        
        // Execute dynamic parent view transition if callback exists [2]
        if (onUploadSuccess) {
          onUploadSuccess(result.payload); 
        }
      } else {
        // This block now correctly catches server errors (400, 500, etc.) [2]
        setUploadStatus({
          success: false,
          message: result.error || "Upload failed.",
        });
      }
    } catch (error) {
      console.error("File submission connection error:", error);
      setUploadStatus({
        success: false,
        message: "Network connection lost. Server is unreachable.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-container">
      <div className="upload-card">
        <h2 className="upload-title">Secure Binary Submission</h2>
        <p className="upload-subtitle">
          Upload statically compiled Linux executables or ZIP files containing
          your codebase.
        </p>

        <form onSubmit={handleUploadSubmit} className="upload-form">
          <div
            className="drag-drop-zone"
            onClick={() => fileInputRef.current.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            <div className="cloud-icon">📤</div>
            {file ? (
              <p className="selected-file-name">
                Selected: <strong>{file.name}</strong>
              </p>
            ) : (
              <p>Drag & Drop your compiled binary or Click to browse.</p>
            )}
            <span className="file-limits">
              ZIP or executable file limits up to 50MB.
            </span>
          </div>

          <button
            type="submit"
            disabled={loading || !file}
            className={`submit-btn ${loading ? "loading" : ""}`}
          >
            {loading ? "Processing..." : "Run Stress Test Suite"}
          </button>
        </form>

        {uploadStatus.message && (
          <div
            className={`status-banner ${uploadStatus.success === true ? "success" : uploadStatus.success === false ? "error" : "info"}`}
          >
            {uploadStatus.message}
          </div>
        )}
      </div>
    </div>
  );
}