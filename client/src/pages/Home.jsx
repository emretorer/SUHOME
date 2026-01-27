import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchProductsWithMeta } from "../services/productService";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useTheme } from "../context/ThemeContext";
gsap.registerPlugin(ScrollTrigger);

const highlights = [
  {
    title: "Living Room Moments",
    desc: "Soft seating, warm lighting, and statement tables. click Living Room below to explore.",
    badge: "Living Room",
  },
  {
    title: "Bedroom Calm",
    desc: "Beds, textiles, and storage that slow everything down. click Bedroom below to browse.",
    badge: "Bedroom",
  },
  {
    title: "Workspace Focus",
    desc: "Desks, task lighting, and clean organization. Click Workspace below to start.",
    badge: "Workspace",
  },
];

const categories = [
  {
    name: "Living Room",
    room: "Living Room",
    image: "https://cdn.thecoolist.com/wp-content/uploads/2025/07/Total-Eclipse-Vibes.jpg",
  },
  {
    name: "Bedroom",
    room: "Bedroom",
    image: "https://i.pinimg.com/originals/e7/9c/f4/e79cf4a8c6520c22ce2d2083be9f0dcf.jpg",
  },
  {
    name: "Workspace",
    room: "Workspace",
    image: "https://woodpulse.com/cdn/shop/files/Small-Black-Vase-Black-Vase-Decor-Modern-Vases_57aa3ba1-fc05-4f53-b115-e65f6a7786d4.jpg?v=1691342414",
  },
];

function Home() {
  const [featured, setFeatured] = useState([]);
  const [lightPos, setLightPos] = useState({ x: "50%", y: "50%" });
  const { isDark } = useTheme();

  useEffect(() => {
    const controller = new AbortController();
    fetchProductsWithMeta(controller.signal)
      .then((items) => setFeatured(items.slice(0, 4)))
      .catch((err) => console.error("Featured products failed", err));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        gsap.fromTo(
          ".hero-item",
          {
            opacity: 0,
            y: 40,
          },
          {
            opacity: 1,
            y: 0,
            duration: 1,
            stagger: 0.2,
            ease: "power3.out",
          }
        );
      });
    });
  }, []);  

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
  
    setLightPos({
      x: `${x}%`,
      y: `${y}%`,
    });
  };  
  

  return (
    <main style={{ fontFamily: "Arial, sans-serif" }}>
      <section
      onMouseMove={handleMouseMove}
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: "80px 16px",
        color: "white",
        gap: 24,
        position: "relative",
        overflow: "hidden",
        background: "#14001f",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(
            circle at ${lightPos.x} ${lightPos.y},
            rgba(255,255,255,0.22),
            rgba(255,255,255,0.1) 25%,
            rgba(20,0,31,0.95) 50%
          )`,
          transition: "background 0.05s linear",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <p className="hero-item" style={{ letterSpacing: 2, fontSize: "0.95rem", margin: 0 }}>
          WELCOME
        </p>

        <h1 className="hero-item" style={{ fontSize: "3rem", maxWidth: 720, margin: 0 }}>
          The SUHome experience where refined living is shaped by timeless design and purpose
        </h1>

        <p className="hero-item" style={{ maxWidth: 720, lineHeight: 1.6, fontSize: "1.1rem" }}>
          From comfy sofas to smart storage, everything you are looking for is a click away.
          Don’t miss the new season offers.
        </p>
      </div>


        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <Link
            to="/products"
            style={{
              padding: "12px 26px",
              borderRadius: 999,
              backgroundColor: "#ffffff",
              color: "#0058a3",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Browse Products
          </Link>
          <a
            href="#ilham"
            style={{
              padding: "12px 26px",
              borderRadius: 999,
              border: "2px solid white",
              color: "white",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Get Inspired
          </a>
        </div>
      </section>

      <section style={{ padding: "50px 24px", backgroundColor: isDark ? "#0b0f14" : "#ffffff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 520 }}>
            <p style={{ margin: 0, letterSpacing: 1, color: isDark ? "#7dd3fc" : "#94a3b8" }}>FEATURED</p>
            <h2 style={{ margin: "6px 0 12px", color: isDark ? "#e2e8f0" : "#0f172a" }}>Handpicked for this week</h2>
            <p style={{ margin: "0 0 12px", color: isDark ? "#a3b3c6" : "#475569" }}>
              Limited stock picks with high ratings. Add to cart while they last.
            </p>
          </div>
          <Link
            to="/products"
            style={{
              alignSelf: "center",
              color: isDark ? "#7dd3fc" : "#0058a3",
              fontWeight: 800,
              textDecoration: "none",
              border: isDark ? "1px solid #1f2937" : "1px solid #cbd5e1",
              padding: "10px 14px",
              borderRadius: 10,
              background: isDark ? "#0f172a" : "transparent",
            }}
          >
            View all products →
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            maxWidth: 1100,
            margin: "20px auto 0",
          }}
        >
          {featured.map((item) => (
            <Link
              key={item.id}
              to={`/products/${item.id}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                background: isDark ? "#0f172a" : "#f8fafc",
                borderRadius: 14,
                border: isDark ? "1px solid #1f2937" : "1px solid #e2e8f0",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                boxShadow: isDark ? "0 12px 28px rgba(0,0,0,0.6)" : "0 12px 28px rgba(15,23,42,0.06)",
              }}
            >
              <img src={item.image} alt={item.name} style={{ width: "100%", height: 170, objectFit: "cover" }} />
              <div style={{ padding: 14, display: "grid", gap: 6 }}>
                <h4 style={{ margin: 0, color: isDark ? "#e2e8f0" : "#0f172a" }}>{item.name}</h4>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ color: "#f59e0b", fontWeight: 700 }}>⭐ {item.averageRating}</span>
                  <span style={{ color: isDark ? "#a3b3c6" : "#64748b", fontSize: "0.9rem" }}>({item.ratingCount})</span>
                </div>
                <p style={{ margin: 0, fontWeight: 800, color: isDark ? "#e2e8f0" : "#0f172a" }}>₺{Number(item.price || 0).toLocaleString("tr-TR")}</p>
                <p style={{ margin: 0, color: item.availableStock > 0 ? "#059669" : "#b91c1c", fontWeight: 700 }}>
                  {item.availableStock > 0 ? `${item.availableStock} in stock` : "Out of stock"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="ilham" style={{ padding: "60px 24px", backgroundColor: isDark ? "#0b0f14" : "#f8f9fa" }}>
        <h2 style={{ textAlign: "center", color: isDark ? "#7dd3fc" : "#0058a3", marginBottom: 32 }}>
          Ideas to elevate your home
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 20,
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          {highlights.map((item) => (
            <article
              key={item.title}
              style={{
                backgroundColor: isDark ? "#0f172a" : "white",
                borderRadius: 16,
                padding: 24,
                boxShadow: isDark ? "0 18px 35px rgba(0,0,0,0.6)" : "0 18px 35px rgba(0,0,0,0.05)",
                minHeight: 200,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  backgroundColor: "#0058a3",
                  color: "white",
                  padding: "4px 12px",
                  borderRadius: 999,
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  marginBottom: 14,
                }}
              >
                {item.badge}
              </span>
              <h3 style={{ margin: "0 0 8px", color: isDark ? "#e2e8f0" : "#0f172a" }}>{item.title}</h3>
              <p style={{ color: isDark ? "#a3b3c6" : "#4b5563", margin: 0 }}>{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ padding: "60px 24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 20,
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          {categories.map((category) => (
            <Link
              key={category.name}
              to={`/products?room=${encodeURIComponent(category.room)}`}
              aria-label={`Browse ${category.name} products`}
              style={{
                position: "relative",
                borderRadius: 16,
                overflow: "hidden",
                minHeight: 220,
                boxShadow: "0 18px 35px rgba(0,0,0,0.08)",
                backgroundColor: "#e5e7eb",
                textDecoration: "none",
                color: "inherit",
                display: "block",
              }}
            >
              <img
                src={`${category.image}?auto=format&fit=crop&w=600&q=60`}
                alt={category.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.6) 100%)",
                  color: "white",
                  display: "flex",
                  alignItems: "flex-end",
                  padding: 20,
                  fontSize: "1.2rem",
                  fontWeight: 700,
                }}
              >
                {category.name}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}



export default Home;



