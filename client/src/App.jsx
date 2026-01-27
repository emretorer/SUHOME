import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, useLocation, useNavigate } from "react-router-dom";
import Header from "./components/layout/Header";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import ChatButton from "./components/chat/ChatButton";
import AppRouter from "./router/AppRouter";
import { useAuth } from "./context/AuthContext";
import { useTheme } from "./context/ThemeContext";
import MiniCartPreview from "./components/cart/MiniPreview";

import "./styles/globals.css";

function AdminTopbar() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = () => {
    logout();
    navigate("/login");
  };

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        background: "#0f172a",
        color: "white",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontWeight: 800 }}>
        <img
          src="https://raw.githubusercontent.com/aslikoturoglu/CS308-Project/main/suhome_logo_1.png"
          alt="SUHome"
          style={{ height: 34, objectFit: "contain" }}
        />
        <span>SUHome</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => navigate("/products")}
          style={{
            background: "rgba(255,255,255,0.16)",
            color: "white",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 10,
            padding: "8px 12px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Categories
        </button>
        <button
          onClick={handleSignOut}
          style={{
            background: "rgba(255,255,255,0.12)",
            color: "white",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 10,
            padding: "8px 14px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Sign out{user?.email ? ` (${user.email})` : ""}
        </button>
      </div>
    </header>
  );
}

function AppChrome() {
  const location = useLocation();
  const hideShell = location.pathname.startsWith("/admin");
  const { theme, isDark, setTheme } = useTheme();
  const { user } = useAuth();
  const hideMiniCart =
    location.pathname.startsWith("/checkout") ||
    location.pathname.startsWith("/payment-");
  const [showMiniCart, setShowMiniCart] = useState(false);
  const openMiniCart = () => setShowMiniCart(true);
  const adminShellStyle = { background: "#0b0f14" };

  useEffect(() => {
    document.body.classList.toggle("admin-dark", hideShell);
    return () => document.body.classList.remove("admin-dark");
  }, [hideShell]);

  useEffect(() => {
    if (!user?.role) return;
    const customerThemeKey = "theme_customer";
    if (user.role !== "customer") {
      try {
        window.localStorage.setItem(customerThemeKey, theme);
      } catch {
        // ignore storage errors
      }
      if (isDark) {
        setTheme("light");
      }
      return;
    }
    try {
      const stored = window.localStorage.getItem(customerThemeKey);
      if (stored === "dark" || stored === "light") {
        setTheme(stored);
      }
    } catch {
      // ignore storage errors
    }
  }, [user?.role, theme, isDark, setTheme]);

  useEffect(() => {
    if (hideMiniCart && showMiniCart) {
      setShowMiniCart(false);
    }
  }, [hideMiniCart, showMiniCart]);

  return (
    <>
      {hideShell ? (
        <div className="app-shell admin-shell" style={adminShellStyle}>
          <AdminTopbar />
          <div className="app-content" style={adminShellStyle}>
            <AppRouter />
          </div>
        </div>
      ) : (
        <div className="app-shell">
          <Header />

          <Navbar
            showMiniCart={!hideMiniCart && showMiniCart}
            setShowMiniCart={setShowMiniCart}
          />

          {!hideMiniCart && (
            <MiniCartPreview
              open={showMiniCart}
              onClose={() => setShowMiniCart(false)}
            />
          )}

          <div className="app-content">
            <AppRouter openMiniCart={openMiniCart} />
          </div>

          <ChatButton />
          <Footer />
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <Router>
      <AppChrome />
    </Router>
  );
}

export default App;
