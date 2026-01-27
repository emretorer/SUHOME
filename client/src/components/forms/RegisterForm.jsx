import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { registerUser } from "../../services/authService";

function RegisterForm({ onSuccess }) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { login } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [taxId, setTaxId] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const isDark = typeof document !== "undefined" && document.body.classList.contains("theme-dark");
  const hasPendingWishlist = () => {
    if (typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem("pending-wishlist:guest");
      const pending = raw ? JSON.parse(raw) : [];
      return Array.isArray(pending) && pending.length > 0;
    } catch (error) {
      return false;
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setInfo("");

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please check again.");
      addToast("Passwords do not match", "error");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      addToast("Password must be at least 6 characters", "error");
      return;
    }

    if (!taxId.trim()) {
      setError("Tax ID is required.");
      addToast("Tax ID is required", "error");
      return;
    }

    if (!emailPattern.test(email.trim())) {
      setError("Enter a valid email address.");
      addToast("Enter a valid email address", "error");
      return;
    }

    registerUser({
      fullName,
      email: email.trim(),
      password,
      taxId: taxId.trim(),
    })
      .then((data) => {
        setError("");
        if (data?.user) {
          login(data.user);
        }
        setInfo("Account created! Redirecting you to the homepage...");
        addToast("Account created, signing you in", "info");
        setTimeout(() => {
          if (typeof onSuccess === "function") {
            onSuccess();
          } else {
            navigate(hasPendingWishlist() ? "/wishlist" : "/");
          }
        }, 1200);
      })
      .catch((apiError) => {
        const msg = apiError.message || "Registration failed";
        setError(msg);
        addToast(msg, "error");
      });
  };

  return (
    <div
      style={{
        backgroundColor: isDark ? "#0f172a" : "#ffffff",
        borderRadius: "16px",
        boxShadow: isDark ? "0 12px 30px rgba(0,0,0,0.6)" : "0 12px 30px rgba(0,0,0,0.08)",
        padding: "36px 32px",
        width: "100%",
        maxWidth: 420,
        borderTop: isDark ? "6px solid #38bdf8" : "6px solid #0058a3",
      }}
    >
      <h2
        style={{
          color: isDark ? "#7dd3fc" : "#0058a3",
          marginBottom: 24,
          fontWeight: 700,
        }}
      >
        Create Account
      </h2>

      {error && (
        <p style={{ color: "#c62828", marginBottom: 16, fontSize: "0.9rem" }}>{error}</p>
      )}

      {info && (
        <p style={{ color: "#0f9d58", marginBottom: 16, fontSize: "0.9rem" }}>{info}</p>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: "0.85rem", fontWeight: 600, color: isDark ? "#e2e8f0" : "#1a1a1a" }}>
          Full Name
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            placeholder="Jane Doe"
            style={{
              width: "100%",
              padding: 10,
              marginTop: 6,
              borderRadius: 8,
              border: isDark ? "1px solid #1f2937" : "1px solid #d4d7dd",
              fontSize: "0.95rem",
              background: isDark ? "#0b0f14" : "#ffffff",
              color: isDark ? "#e2e8f0" : "#1a1a1a",
            }}
          />
        </label>

        <label style={{ fontSize: "0.85rem", fontWeight: 600, color: isDark ? "#e2e8f0" : "#1a1a1a" }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="ornek@mail.com"
            style={{
              width: "100%",
              padding: 10,
              marginTop: 6,
              borderRadius: 8,
              border: isDark ? "1px solid #1f2937" : "1px solid #d4d7dd",
              fontSize: "0.95rem",
              background: isDark ? "#0b0f14" : "#ffffff",
              color: isDark ? "#e2e8f0" : "#1a1a1a",
            }}
          />
        </label>

        <label style={{ fontSize: "0.85rem", fontWeight: 600, color: isDark ? "#e2e8f0" : "#1a1a1a" }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
            placeholder="password"
            style={{
              width: "100%",
              padding: 10,
              marginTop: 6,
              borderRadius: 8,
              border: isDark ? "1px solid #1f2937" : "1px solid #d4d7dd",
              fontSize: "0.95rem",
              background: isDark ? "#0b0f14" : "#ffffff",
              color: isDark ? "#e2e8f0" : "#1a1a1a",
            }}
          />
        </label>

        <label style={{ fontSize: "0.85rem", fontWeight: 600, color: isDark ? "#e2e8f0" : "#1a1a1a" }}>
          Confirm Password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={6}
            required
            placeholder="password"
            style={{
              width: "100%",
              padding: 10,
              marginTop: 6,
              borderRadius: 8,
              border: isDark ? "1px solid #1f2937" : "1px solid #d4d7dd",
              fontSize: "0.95rem",
              background: isDark ? "#0b0f14" : "#ffffff",
              color: isDark ? "#e2e8f0" : "#1a1a1a",
            }}
          />
        </label>

        <label style={{ fontSize: "0.85rem", fontWeight: 600, color: isDark ? "#e2e8f0" : "#1a1a1a" }}>
          Tax ID
          <input
            type="text"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            required
            placeholder="Tax ID"
            style={{
              width: "100%",
              padding: 10,
              marginTop: 6,
              borderRadius: 8,
              border: isDark ? "1px solid #1f2937" : "1px solid #d4d7dd",
              fontSize: "0.95rem",
              background: isDark ? "#0b0f14" : "#ffffff",
              color: isDark ? "#e2e8f0" : "#1a1a1a",
            }}
          />
        </label>

        <button
          type="submit"
          style={{
            marginTop: 12,
            width: "100%",
            padding: "12px 12px",
            borderRadius: 8,
            border: "none",
            backgroundColor: isDark ? "#38bdf8" : "#0058a3",
            color: isDark ? "#0b0f14" : "white",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: "1rem",
            transition: "filter 0.2s ease",
          }}
        >
          Sign Up
        </button>
      </form>

      <p style={{ fontSize: "0.85rem", marginTop: 16, color: isDark ? "#cbd5e1" : "#4b5563" }}>
        Already have an account?{" "}
        <button
          type="button"
          onClick={() => navigate("/login")}
          style={{
            background: "none",
            border: "none",
            color: isDark ? "#7dd3fc" : "#0058a3",
            cursor: "pointer",
            fontWeight: 600,
            padding: 0,
          }}
        >
          Sign In
        </button>
      </p>
    </div>
  );
}

export default RegisterForm;
