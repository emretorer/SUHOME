import React from "react";

const sampleProducts = [
  {
    id: "P-1023",
    name: "MALM Bed Frame",
    category: "Bedroom",
    stock: 42,
    price: 18999,
    status: "Published",
  },
  {
    id: "P-2045",
    name: "POÄNG Armchair",
    category: "Living Room",
    stock: 18,
    price: 7999,
    status: "Draft",
  },
  {
    id: "P-3502",
    name: "ALEX Drawer Unit",
    category: "Workspace",
    stock: 7,
    price: 5499,
    status: "Low stock",
  },
  {
    id: "P-4110",
    name: "BESTÅ Storage",
    category: "Storage",
    stock: 64,
    price: 9999,
    status: "Published",
  },
];

function statusStyle(status) {
  const styles = {
    Published: { background: "rgba(0,200,83,0.15)", color: "#0a7a3d" },
    Draft: { background: "rgba(59,130,246,0.15)", color: "#1d4ed8" },
    "Low stock": { background: "rgba(245,158,11,0.16)", color: "#b45309" },
    Archived: { background: "rgba(148,163,184,0.18)", color: "#475569" },
  };
  return styles[status] || styles.Published;
}

function ProductTable({ products = sampleProducts, onEdit = () => {}, onDelete = () => {} }) {
  const rows = products.length ? products : sampleProducts;

  return (
    <div
      style={{
        background: "white",
        borderRadius: 16,
        padding: 18,
        boxShadow: "0 18px 40px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div>
          <h3 style={{ margin: "0 0 4px", color: "#0f172a" }}>Products</h3>
          <p style={{ margin: 0, color: "#6b7280" }}>Inventory snapshot</p>
        </div>
        <button
          type="button"
          onClick={() => onEdit(null)}
          style={{
            backgroundColor: "#0058a3",
            color: "white",
            border: "none",
            padding: "10px 14px",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          + Add product
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: 600,
          }}
        >
          <thead>
            <tr style={{ textAlign: "left", color: "#6b7280", fontWeight: 700 }}>
              <th style={{ padding: "10px 8px" }}>ID</th>
              <th style={{ padding: "10px 8px" }}>Name</th>
              <th style={{ padding: "10px 8px" }}>Category</th>
              <th style={{ padding: "10px 8px" }}>Stock</th>
              <th style={{ padding: "10px 8px" }}>Price</th>
              <th style={{ padding: "10px 8px" }}>Status</th>
              <th style={{ padding: "10px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => (
              <tr
                key={product.id}
                style={{
                  borderTop: "1px solid #e5e7eb",
                  color: "#111827",
                }}
              >
                <td style={{ padding: "10px 8px", fontWeight: 700 }}>{product.id}</td>
                <td style={{ padding: "10px 8px" }}>{product.name}</td>
                <td style={{ padding: "10px 8px", color: "#374151" }}>{product.category}</td>
                <td style={{ padding: "10px 8px", fontWeight: 700 }}>{product.stock}</td>
                <td style={{ padding: "10px 8px", color: "#0058a3", fontWeight: 700 }}>
                  ₺{product.price.toLocaleString("tr-TR")}
                </td>
                <td style={{ padding: "10px 8px" }}>
                  <span
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      ...statusStyle(product.status),
                    }}
                  >
                    {product.status}
                  </span>
                </td>
                <td style={{ padding: "10px 8px", display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => onEdit(product)}
                    style={{
                      background: "none",
                      border: "1px solid #d1d5db",
                      borderRadius: 10,
                      padding: "6px 10px",
                      cursor: "pointer",
                      color: "#0058a3",
                      fontWeight: 700,
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(product.id)}
                    style={{
                      background: "#fee2e2",
                      border: "1px solid #fecaca",
                      borderRadius: 10,
                      padding: "6px 10px",
                      cursor: "pointer",
                      color: "#b91c1c",
                      fontWeight: 700,
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProductTable;
