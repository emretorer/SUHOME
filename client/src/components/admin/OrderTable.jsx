import React from "react";

const sampleOrders = [
  {
    id: "#ORD-1001",
    customer: "Ayşe Demir",
    date: "2024-12-18",
    total: 28999,
    status: "Shipped",
  },
  {
    id: "#ORD-1002",
    customer: "Mehmet Kaya",
    date: "2024-12-19",
    total: 15999,
    status: "Pending",
  },
  {
    id: "#ORD-1003",
    customer: "Selin Yılmaz",
    date: "2024-12-20",
    total: 8299,
    status: "Delivered",
  },
  {
    id: "#ORD-1004",
    customer: "Kerem Çelik",
    date: "2024-12-21",
    total: 11999,
    status: "Preparing",
  },
];

function orderStatusStyle(status) {
  const styles = {
    Delivered: { background: "rgba(16,185,129,0.16)", color: "#047857" },
    Shipped: { background: "rgba(59,130,246,0.18)", color: "#1d4ed8" },
    Pending: { background: "rgba(245,158,11,0.16)", color: "#b45309" },
    Preparing: { background: "rgba(99,102,241,0.16)", color: "#4338ca" },
  };
  return styles[status] || styles.Pending;
}

function OrderTable({ orders = sampleOrders, onUpdateStatus = () => {} }) {
  const rows = orders.length ? orders : sampleOrders;

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
          <h3 style={{ margin: "0 0 4px", color: "#0f172a" }}>Orders</h3>
          <p style={{ margin: 0, color: "#6b7280" }}>Latest activity</p>
        </div>
        <span style={{ fontWeight: 700, color: "#0058a3" }}>{rows.length} records</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: 520,
          }}
        >
          <thead>
            <tr style={{ textAlign: "left", color: "#6b7280", fontWeight: 700 }}>
              <th style={{ padding: "10px 8px" }}>Order</th>
              <th style={{ padding: "10px 8px" }}>Customer</th>
              <th style={{ padding: "10px 8px" }}>Date</th>
              <th style={{ padding: "10px 8px" }}>Total</th>
              <th style={{ padding: "10px 8px" }}>Status</th>
              <th style={{ padding: "10px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((order) => (
              <tr
                key={order.id}
                style={{
                  borderTop: "1px solid #e5e7eb",
                  color: "#111827",
                }}
              >
                <td style={{ padding: "10px 8px", fontWeight: 700 }}>{order.id}</td>
                <td style={{ padding: "10px 8px" }}>{order.customer}</td>
                <td style={{ padding: "10px 8px", color: "#4b5563" }}>
                  {new Date(order.date).toLocaleDateString("tr-TR")}
                </td>
                <td style={{ padding: "10px 8px", color: "#0058a3", fontWeight: 700 }}>
                  ₺{order.total.toLocaleString("tr-TR")}
                </td>
                <td style={{ padding: "10px 8px" }}>
                  <span
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      ...orderStatusStyle(order.status),
                    }}
                  >
                    {order.status}
                  </span>
                </td>
                <td style={{ padding: "10px 8px" }}>
                  <button
                    type="button"
                    onClick={() => onUpdateStatus(order)}
                    style={{
                      background: "none",
                      border: "1px solid #d1d5db",
                      borderRadius: 10,
                      padding: "6px 10px",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Update
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

export default OrderTable;
