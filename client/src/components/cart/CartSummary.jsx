import { formatPrice } from "../../utils/formatPrice";

function CartSummary({ subtotal, discount, total, onCheckout }) {
  const isDark = typeof document !== "undefined" && document.body.classList.contains("theme-dark");

  return (
    <aside
      style={{
        backgroundColor: isDark ? "#0f172a" : "#ffffff",
        borderRadius: 16,
        padding: 24,
        boxShadow: isDark ? "0 12px 30px rgba(0,0,0,0.6)" : "0 12px 30px rgba(0,0,0,0.08)",
        minWidth: 280,
        border: isDark ? "1px solid #1f2937" : "none",
      }}
    >
      <h3 style={{ marginTop: 0, color: isDark ? "#7dd3fc" : "#0058a3" }}>Order Summary</h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, color: isDark ? "#e2e8f0" : "#0f172a" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Subtotal</span>
          <strong>{formatPrice(subtotal)}</strong>
        </div>

        {discount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", color: isDark ? "#34d399" : "#059669" }}>
            <span>Discount</span>
            <strong>-{formatPrice(discount)}</strong>
          </div>
        )}

        <hr style={{ border: "none", borderTop: isDark ? "1px solid #1f2937" : "1px solid #e5e7eb" }} />

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.1rem" }}>
          <span>Total</span>
          <strong>{formatPrice(total)}</strong>
        </div>
      </div>

      <button
        type="button"
        onClick={onCheckout}
        style={{
          width: "100%",
          marginTop: 20,
          padding: "12px 16px",
          border: "none",
          borderRadius: 10,
          backgroundColor: isDark ? "#38bdf8" : "#0058a3",
          color: isDark ? "#0b0f14" : "white",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Proceed to Checkout
      </button>
    </aside>
  );
}

export default CartSummary;
