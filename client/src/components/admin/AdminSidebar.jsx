import React from "react";

const navItems = [
  { key: "dashboard", label: "Dashboard", hint: "Overview & stats" },
  { key: "products", label: "Products", hint: "Inventory & pricing" },
  { key: "orders", label: "Orders", hint: "Fulfillment pipeline" },
  { key: "customers", label: "Customers", hint: "Loyalty & support" },
];

function AdminSidebar({ activeSection = "dashboard", onSelect }) {
  return (
    <aside
      style={{
        width: 260,
        backgroundColor: "#0f172a",
        color: "white",
        minHeight: "100%",
        borderRadius: 16,
        padding: 20,
        boxShadow: "0 18px 35px rgba(0,0,0,0.18)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "linear-gradient(135deg, #ffcc00, #f59e0b)",
            display: "grid",
            placeItems: "center",
            color: "#0f172a",
            fontWeight: 800,
          }}
        >
          A
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>Admin Center</div>
          <div style={{ opacity: 0.8, fontSize: "0.9rem" }}>SUHome</div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {navItems.map((item) => {
          const isActive = item.key === activeSection;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect?.(item.key)}
              style={{
                width: "100%",
                backgroundColor: isActive ? "rgba(255,204,0,0.14)" : "transparent",
                color: isActive ? "#f46a91" : "white",
                border: isActive ? "1px solid rgba(255,204,0,0.35)" : "1px solid rgba(255,255,255,0.1)",
                padding: "12px 14px",
                borderRadius: 12,
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
              <div style={{ opacity: 0.75, fontSize: "0.9rem" }}>{item.hint}</div>
            </button>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 28,
          padding: 14,
          borderRadius: 12,
          background: "linear-gradient(145deg, rgba(177, 48, 48, 0.08), rgba(255,255,255,0.02))",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Quick note</div>
        <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.85, lineHeight: 1.4 }}>
          Keep an eye on low-stock products and pending orders to ensure next-day delivery
          promises stay on track.
        </p>
      </div>
    </aside>
  );
}

export default AdminSidebar;
