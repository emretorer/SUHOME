import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { loginUser } from "../../services/authService";

function LoginForm({ onSuccess }) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { addToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email.trim())) {
      setError("Enter a valid email address.");
      addToast("Invalid email format", "error");
      return;
    }
    if (!password.trim()) {
      setError("Email and password are required.");
      addToast("Email and password are required", "error");
      return;
    }

    loginUser({ email: email.trim(), password })
      .then((data) => {
        const userPayload = data?.user;
        if (!userPayload) {
          throw new Error("Login response missing user");
        }
        setError("");
        login(userPayload);
        addToast("Logged in", "info");
        if (typeof onSuccess === "function") {
          onSuccess();
          return;
        }
        const role = userPayload.role;
        const isStaff = role === "admin" || role === "product_manager" || role === "sales_manager" || role === "support";
        if (!isStaff && hasPendingWishlist()) {
          navigate("/wishlist");
          return;
        }
        if (isStaff) {
          navigate("/admin");
        } else {
          navigate("/");
        }
      })
      .catch((apiError) => {
        const msg = apiError.message || "Invalid credentials.";
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
        maxWidth: 360,
        borderTop: isDark ? "6px solid #38bdf8" : "6px solid #0058a3",
      }}
    >
      <h2
        style={{
          color: isDark ? "#7dd3fc" : "#0058a3",
          marginBottom: 12,
          fontWeight: 700,
        }}
      >
        Sign In
      </h2>
      <p
        style={{
          marginTop: 0,
          marginBottom: 12,
          fontSize: "0.85rem",
          color: isDark ? "#cbd5e1" : "#475569",
          lineHeight: 1.4,
        }}
      >
        Demo creds: <br />
        Customer: demo@suhome.com / demo<br />
        Product Manager: demo1@suhome.com / demo1pass<br />
        Sales Manager: demo2@suhome.com / demo2pass<br />
        Support Agents: support@suhome.com / support<br />
        support2@suhome.com / support<br />
        support3@suhome.com / support<br />
        support4@suhome.com / support<br />
        support5@suhome.com / support
      </p>

      {error && (
        <div
          style={{
            background: "#fef2f2",
            color: "#b91c1c",
            border: "1px solid #fecdd3",
            padding: "10px 12px",
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ textAlign: "left", color: isDark ? "#e2e8f0" : "#1a1a1a", fontSize: "0.85rem", fontWeight: 600 }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="test@suhome.com"
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

        <label style={{ textAlign: "left", color: isDark ? "#e2e8f0" : "#1a1a1a", fontSize: "0.85rem", fontWeight: 600 }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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

        <button
          type="submit"
          style={{
            marginTop: 12,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "none",
            backgroundColor: isDark ? "#38bdf8" : "#0058a3",
            color: isDark ? "#0b0f14" : "#f8fafc",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: "1rem",
            transition: "filter 0.2s ease",
          }}
        >
          Sign In
        </button>
      </form>

      <button
        type="button"
        onClick={() => navigate("/forgot-password")}
        style={{
          marginTop: 10,
          background: "none",
          border: "none",
          color: isDark ? "#7dd3fc" : "#0058a3",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Forgot password?
      </button>

      <p style={{ fontSize: "0.85rem", marginTop: 16, color: isDark ? "#cbd5e1" : "#4b5563" }}>
        Don't have an account?{" "}
        <button
          type="button"
          onClick={() => navigate("/register")}
          style={{
            background: "none",
            border: "none",
            color: isDark ? "#7dd3fc" : "#0058a3",
            cursor: "pointer",
            fontWeight: 600,
            padding: 0,
          }}
        >
          Create one now.
        </button>
      </p>
    </div>
  );
}

export default LoginForm;
