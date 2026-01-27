import { useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import { requestPasswordReset } from "../services/authService";

function ForgotPassword() {
  const { addToast } = useToast();
  const [email, setEmail] = useState("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [devToken, setDevToken] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setDevToken("");
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    setLoading(true);
    requestPasswordReset(email.trim())
      .then((data) => {
        setInfo("If this email exists, we sent a reset link.");
        addToast("Reset link sent if the email is registered.", "info");
        if (data?.token) {
          setDevToken(data.token);
        }
      })
      .catch((err) => {
        const msg = err.message || "Reset request failed";
        setError(msg);
        addToast(msg, "error");
      })
      .finally(() => setLoading(false));
  };

  return (
    <section
      style={{
        minHeight: "70vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "60px 16px",
        background: "linear-gradient(135deg, #f8f9fa 0%, #eef2f7 100%)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          background: "white",
          padding: 28,
          borderRadius: 14,
          boxShadow: "0 18px 40px rgba(0,0,0,0.06)",
          maxWidth: 420,
          width: "100%",
          display: "grid",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, color: "#0f172a" }}>Forgot Password</h2>
        <p style={{ margin: 0, color: "#475569" }}>
          Enter your email and we’ll send you a reset link.
        </p>
        {error && <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>}
        {info && <p style={{ color: "#059669", margin: 0 }}>{info}</p>}
        {devToken && (
          <p style={{ color: "#0ea5e9", margin: 0, fontSize: "0.9rem", wordBreak: "break-all" }}>
            Dev token: <Link to={`/reset-password/${devToken}`}>{devToken}</Link>
          </p>
        )}
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              border: "none",
              background: "#0058a3",
              color: "white",
              padding: "12px 14px",
              borderRadius: 10,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.8 : 1,
            }}
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>
        <Link to="/login" style={{ color: "#0058a3", fontWeight: 600 }}>
          Back to login
        </Link>
      </div>
    </section>
  );
}

export default ForgotPassword;
