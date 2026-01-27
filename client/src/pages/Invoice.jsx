import { Link, useParams, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { formatOrderId, getOrderById } from "../services/orderService";
import { formatPrice } from "../utils/formatPrice";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

function Invoice() {
  const { id } = useParams();
  const location = useLocation();
  const decodedId = decodeURIComponent(id);
  const orderFromState = location.state?.order;
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [order, setOrder] = useState(orderFromState || getOrderById(decodedId));

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

  useEffect(() => {
    if (orderFromState?.items?.length) return;
    if (!user?.id) return;

    const controller = new AbortController();

    async function fetchOrder() {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/orders?user_id=${encodeURIComponent(user.id)}`,
          { signal: controller.signal }
        );
        const data = await res.json().catch(() => []);
        if (!Array.isArray(data)) return;

        const numericId = String(decodedId).match(/\d+/)?.[0];
        const match = data.find(
          (row) =>
            String(row.order_id ?? row.id) === numericId ||
            formatOrderId(row.order_id ?? row.id) === formatOrderId(decodedId)
        );

        if (match) {
          const items =
            Array.isArray(match.items) && match.items.length
              ? match.items.map((it, idx) => ({
                  id: it.product_id ?? it.id ?? idx,
                  name: it.name ?? it.product_name ?? "Item",
                  qty: Number(it.quantity ?? it.qty ?? 1) || 1,
                  price: Number(it.unit_price ?? it.price ?? 0),
                  originalPrice: Number(it.original_price ?? it.product_price ?? it.price ?? 0),
                }))
              : [];

          setOrder({
            ...match,
            id: match.order_id ?? match.id,
            order_id: match.order_id ?? match.id,
            items,
            total: Number(match.total_amount ?? match.total ?? 0),
            address: match.shipping_address ?? match.billing_address ?? match.address,
          });
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Invoice fetch failed", err);
        }
      }
    }

    fetchOrder();
    return () => controller.abort();
  }, [API_BASE_URL, decodedId, orderFromState, user]);

  if (!order) {
    return (
      <section style={pageStyle(isDark)}>
        <div style={cardStyle(isDark)}>
          <h1 style={{ marginTop: 0, color: "#b91c1c" }}>Order not found</h1>
          <p style={{ margin: 0, color: isDark ? "#a3b3c6" : "#475569" }}>
            We could not locate this order. Please check your order list.
          </p>
          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <Link to="/orders" style={linkPrimary(isDark)}>
              Go to Order History
            </Link>
            <Link to="/products" style={linkSecondary(isDark)}>
              Browse Products
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const normalizedItems = useMemo(
    () =>
      Array.isArray(order.items)
        ? order.items.map((item, idx) => ({
            id: item.id ?? idx,
            name: item.name,
            qty: Number(item.qty ?? item.quantity ?? 1) || 1,
            price: Number(item.price ?? 0),
            originalPrice: Number(item.originalPrice ?? item.original_price ?? item.product_price ?? item.price ?? 0),
          }))
        : [],
    [order.items]
  );

  const totalItems = normalizedItems.reduce(
    (sum, item) => sum + Number(item.qty || 1),
    0
  );
  const itemsSubtotal = normalizedItems.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1),
    0
  );
  const originalSubtotal = normalizedItems.reduce(
    (sum, item) =>
      sum + Number(item.originalPrice || item.price || 0) * Number(item.qty || 1),
    0
  );
  const discountAmount = Math.max(originalSubtotal - itemsSubtotal, 0);
  const explicitShippingFee = Number(order.shippingFee ?? order.shipping_fee ?? 0);
  const rawTotalPaid = Number(order.total ?? order.total_amount ?? 0);
  const shippingFee =
    Number.isFinite(explicitShippingFee) && explicitShippingFee > 0
      ? explicitShippingFee
      : Math.max(rawTotalPaid - itemsSubtotal, 0);
  const totalPaid =
    Number.isFinite(rawTotalPaid) && rawTotalPaid > 0
      ? rawTotalPaid
      : itemsSubtotal + shippingFee;
  const realOrderId = order.order_id ?? order.id;

  const displayId = formatOrderId(order.id);
  const displayDate = order.date
    ? new Date(order.date).toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : order.date;

  const handleDownloadPdf = async () => {
    const rawId = realOrderId ?? order.id;
    if (!rawId) return;
    const numeric = String(rawId).match(/\d+/);
    const cleanId = numeric ? numeric[0] : rawId;
    const url = `${API_BASE_URL}/api/orders/${encodeURIComponent(cleanId)}/invoice`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("Invoice download failed");
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `invoice_${cleanId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("Invoice download failed", err);
      alert("Invoice could not be downloaded.");
    }
  };

  const formatAddress = (raw) => {
    if (!raw) return "Saved default address";
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return formatAddress(parsed);
      } catch {
        return raw;
      }
    }
    if (typeof raw === "object") {
      const line1 =
        raw.address ||
        raw.street ||
        raw.line1 ||
        raw.addressLine ||
        raw.address_line;
      const city = raw.city || raw.town || raw.state;
      const postal = raw.postalCode || raw.zip || raw.zipCode;
      const parts = [line1, city, postal].filter(Boolean);
      return parts.join(", ") || "Saved default address";
    }
    return String(raw);
  };

  return (
    <section style={pageStyle(isDark)}>
      <div style={{ ...cardStyle(isDark), maxWidth: 980 }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <p style={{ margin: 0, letterSpacing: 1, color: isDark ? "#7dd3fc" : "#94a3b8" }}>
              PURCHASE COMPLETED
            </p>
            <h1 style={{ margin: "4px 0 6px", color: isDark ? "#7dd3fc" : "#0f172a" }}>
              Thank you for your order!
            </h1>
            <p style={{ margin: 0, color: isDark ? "#a3b3c6" : "#475569" }}>
              Your order is being processed for delivery. A receipt will be
              emailed shortly.
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, color: isDark ? "#a3b3c6" : "#94a3b8" }}>Order ID</p>
            <h2 style={{ margin: 0, color: isDark ? "#7dd3fc" : "#0f172a" }}>{displayId}</h2>
          </div>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginTop: 14,
          }}
        >
          <Info label="Date" value={displayDate} isDark={isDark} />
          <Info label="Status" value={order.status} isDark={isDark} />
          <Info label="Items" value={`${totalItems} pcs`} isDark={isDark} />
          <Info label="Total Paid" value={formatPrice(totalPaid)} isDark={isDark} />
          <Info label="Shipping Fee" value={formatPrice(shippingFee)} isDark={isDark} />
          <Info label="Tax ID" value={user?.taxId || "Not provided"} isDark={isDark} />
        </div>

        <div
          style={{
            marginTop: 18,
            border: isDark ? "1px solid #1f2937" : "1px solid #e2e8f0",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 0.7fr 1fr 1fr",
            gap: 8,
            background: isDark ? "#0b1220" : "#f8fafc",
            padding: "10px 12px",
            fontWeight: 700,
            color: isDark ? "#e2e8f0" : "#0f172a",
          }}
        >
          <span>Item</span>
          <span>Qty</span>
          <span>Unit price</span>
          <span>Total</span>
        </div>
        <div style={{ display: "grid", gap: 8, padding: "12px" }}>
          {normalizedItems.map((item) => (
            <div
              key={item.id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 0.7fr 1fr 1fr",
                alignItems: "center",
                gap: 8,
                border: isDark ? "1px solid #1f2937" : "1px solid #e2e8f0",
                borderRadius: 10,
                padding: "10px 12px",
                background: isDark ? "#0f172a" : "#ffffff",
              }}
            >
              <span style={{ fontWeight: 700, color: isDark ? "#e2e8f0" : "#0f172a" }}>
                {item.name}
              </span>
              <span style={{ color: isDark ? "#a3b3c6" : "#475569" }}>{item.qty}</span>
              <span style={{ color: isDark ? "#e2e8f0" : "#0f172a" }}>
                {formatPrice(item.originalPrice || item.price)}
              </span>
              <span style={{ fontWeight: 800, color: isDark ? "#e2e8f0" : "#0f172a" }}>
                {formatPrice(item.price * item.qty)}
              </span>
            </div>
          ))}
        </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "0 12px 12px",
            }}
          >
            <div
              style={{
                border: isDark ? "1px solid #1f2937" : "1px solid #e2e8f0",
                borderRadius: 10,
                padding: 12,
                minWidth: 240,
                background: isDark ? "#0f172a" : "#ffffff",
                display: "grid",
                gap: 6,
              }}
            >
              <Line label="Subtotal" value={formatPrice(originalSubtotal)} isDark={isDark} />
              <Line
                label="Discount"
                value={discountAmount > 0 ? `-${formatPrice(discountAmount)}` : formatPrice(0)}
                isDark={isDark}
              />
              <Line label="Items total" value={formatPrice(itemsSubtotal)} isDark={isDark} />
              <Line label="Shipping fee" value={formatPrice(shippingFee)} isDark={isDark} />
              <Line label="Total paid" value={formatPrice(totalPaid)} isDark={isDark} bold />
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
            marginTop: 18,
          }}
        >
          <div
            style={{
              border: isDark ? "1px solid #1f2937" : "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 12,
              background: isDark ? "#0f172a" : "transparent",
            }}
          >
            <h3 style={{ margin: "0 0 8px", color: isDark ? "#7dd3fc" : "#0f172a" }}>
              Billing & Shipping
            </h3>
            <p style={{ margin: "4px 0", color: isDark ? "#a3b3c6" : "#475569" }}>
              {formatAddress(order.address)}
            </p>
            <p style={{ margin: "4px 0", color: isDark ? "#a3b3c6" : "#475569" }}>
              Shipping Company: {order.shippingCompany ?? "SUExpress"}
            </p>
          </div>

          <div
            style={{
              border: isDark ? "1px solid #1f2937" : "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 12,
              display: "grid",
              gap: 8,
              background: isDark ? "#0f172a" : "transparent",
            }}
          >
            <h3 style={{ margin: 0, color: isDark ? "#7dd3fc" : "#0f172a" }}>Invoice Actions</h3>
            <button
              type="button"
              style={buttonPrimary(isDark)}
              onClick={handleDownloadPdf}
            >
              Download PDF
            </button>
            <div style={{ ...pillInfo(isDark) }}>
              Email has been sent to your address.
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <Link to="/orders" style={linkPrimary(isDark)}>
            View Order Status
          </Link>
          <Link to="/products" style={linkSecondary(isDark)}>
            Continue Shopping
          </Link>
          <Link
            to="/"
            state={location.state}
            style={{ ...linkSecondary(isDark), borderStyle: "dashed" }}
          >
            Back to Home
          </Link>
        </div>
      </div>
    </section>
  );
}

function Info({ label, value, isDark }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        border: isDark ? "1px solid #1f2937" : "1px solid #e2e8f0",
        background: isDark ? "#0b1220" : "#f8fafc",
      }}
    >
      <p style={{ margin: 0, color: isDark ? "#a3b3c6" : "#94a3b8", fontSize: "0.85rem" }}>
        {label}
      </p>
      <p
        style={{
          margin: "6px 0 0",
          color: isDark ? "#e2e8f0" : "#0f172a",
          fontWeight: 800,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function Line({ label, value, isDark, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: isDark ? "#a3b3c6" : "#64748b", fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ color: isDark ? "#e2e8f0" : "#0f172a", fontWeight: bold ? 800 : 700 }}>
        {value}
      </span>
    </div>
  );
}

const pageStyle = (isDark) => ({
  padding: "40px 20px",
  background: isDark ? "#0b0f14" : "#f5f7fb",
  minHeight: "70vh",
  display: "flex",
  justifyContent: "center",
});

const cardStyle = (isDark) => ({
  width: "100%",
  maxWidth: 720,
  background: isDark ? "#0f172a" : "white",
  borderRadius: 18,
  padding: 24,
  border: isDark ? "1px solid #1f2937" : "1px solid #e5e7eb",
  boxShadow: isDark ? "0 16px 40px rgba(0,0,0,0.6)" : "0 16px 40px rgba(15,23,42,0.08)",
});

const buttonPrimary = (isDark) => ({
  border: "none",
  background: isDark ? "#38bdf8" : "#0058a3",
  color: "white",
  padding: "10px 12px",
  borderRadius: 10,
  fontWeight: 800,
  cursor: "pointer",
});

const pillInfo = (isDark) => ({
  border: isDark ? "1px solid #1f2937" : "1px solid #cbd5e1",
  background: isDark ? "#0b1220" : "#f8fafc",
  color: isDark ? "#e2e8f0" : "#0f172a",
  padding: "10px 12px",
  borderRadius: 10,
  fontWeight: 700,
  textAlign: "center",
});

const linkPrimary = (isDark) => ({
  background: isDark ? "#38bdf8" : "#0058a3",
  color: "white",
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  fontWeight: 800,
});

const linkSecondary = (isDark) => ({
  border: isDark ? "1px solid #1f2937" : "1px solid #cbd5e1",
  color: isDark ? "#e2e8f0" : "#0f172a",
  padding: "10px 12px",
  borderRadius: 10,
  textDecoration: "none",
  fontWeight: 700,
  background: isDark ? "#0f172a" : "white",
});

export default Invoice;
