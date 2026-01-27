import { Link } from "react-router-dom";

const quickLinks = [
  { title: "My Orders", to: "/orders", desc: "Check past purchases and shipment status." },
  { title: "Product Archive", to: "/products", desc: "Explore items in stock with filters." },
  { title: "My Profile", to: "/profile", desc: "Update addresses and preferences." },
];

const trendingSearches = ["Desk setup", "LED lighting", "Baby room", "Smart storage", "Nordic sofa"];

function NotFound() {
  return (
    <main
      style={{
        minHeight: "70vh",
        backgroundColor: "#f8f9fb",
        padding: "60px 16px 80px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <section
        style={{
          maxWidth: 920,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 32,
          alignItems: "center",
        }}
      >
        <div>
          <p style={{ margin: 0, letterSpacing: 4, color: "#94a3b8" }}>404</p>
          <h1 style={{ margin: "8px 0 16px", fontSize: "2.75rem", color: "#0f172a" }}>
            We couldn’t find the page you want
          </h1>
          <p style={{ marginBottom: 24, lineHeight: 1.6, color: "#475569" }}>
            The link may have changed or the page no longer exists. Use the quick links below to continue.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Link
              to="/"
              style={{
                backgroundColor: "#0058a3",
                color: "#ffffff",
                padding: "12px 24px",
                borderRadius: 999,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Go to homepage
            </Link>
            <Link
              to="/products"
              style={{
                border: "2px solid #0058a3",
                color: "#0058a3",
                padding: "12px 24px",
                borderRadius: 999,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Browse products
            </Link>
          </div>

          <div
            style={{
              marginTop: 32,
              display: "grid",
              gap: 12,
            }}
          >
            {quickLinks.map((link) => (
              <Link
                key={link.title}
                to={link.to}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: "14px 16px",
                  borderRadius: 14,
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  textDecoration: "none",
                  color: "#0f172a",
                }}
              >
                <strong style={{ fontSize: "1.05rem" }}>{link.title}</strong>
                <span style={{ color: "#475569", fontSize: "0.95rem", marginTop: 4 }}>{link.desc}</span>
              </Link>
            ))}
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#0f172a",
            color: "white",
            borderRadius: 28,
            padding: 32,
            boxShadow: "0 25px 60px rgba(15,23,42,0.25)",
          }}
        >
          <p style={{ marginTop: 0, marginBottom: 12, letterSpacing: 2, color: "#facc15" }}>TRENDING SEARCHES</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {trendingSearches.map((term) => (
              <span
                key={term}
                style={{
                  backgroundColor: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  padding: "8px 14px",
                  borderRadius: 999,
                }}
              >
                {term}
              </span>
            ))}
          </div>
          <div
            style={{
              marginTop: 32,
              padding: 16,
              borderRadius: 18,
              background: "rgba(255,255,255,0.08)",
              lineHeight: 1.5,
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>Need help?</p>
            <p style={{ margin: "6px 0 0", color: "rgba(255,255,255,0.8)" }}>
              Our live support team can help you reach the right page. Online on weekdays, 09:00 - 22:00.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default NotFound;
