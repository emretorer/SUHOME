import { Link, useNavigate } from "react-router-dom";
import CartItem from "../components/cart/CartItem";
import CartSummary from "../components/cart/CartSummary";
import { useCart } from "../context/CartContext";
import { useTheme } from "../context/ThemeContext";

function Cart() {
  const navigate = useNavigate();
  const { items, subtotal, increment, decrement, removeItem } = useCart();
  const { isDark } = useTheme();

  const handleIncrease = async (id) => {
    const item = items.find((p) => p.id === id);
    if (!item) return;

    // Stok kontrolü
    if (item.availableStock <= item.quantity) {
      alert("Not enough stock for this item.");
      return;
    }

    // cart'ta quantity +1
    increment(id);
  };

  const handleDecrease = async (id) => {
    const item = items.find((p) => p.id === id);
    if (!item) return;

    // quantity 1 ise, azaltmak yerine tamamen silip stoğa iade
    if (item.quantity <= 1) {
      removeItem(id);
      return;
    }

    // cart'ta quantity -1
    decrement(id);
  };

  const handleRemove = async (id) => {
    const item = items.find((p) => p.id === id);
    if (!item) return;

    removeItem(id);
  };

  const discount = 0;
  const total = Math.max(subtotal - discount, 0);

  const handleCheckout = () => {
    if (!items.length) {
      alert("Your cart is empty. Please add items before checking out.");
      return;
    }

    const merchandiseTotal = Math.max(subtotal - discount, 0);

    navigate("/checkout", {
      state: {
        items,
        subtotal,
        discount,
        merchandiseTotal,
      },
    });
  };

  if (items.length === 0) {
    return (
      <section
        style={{
          minHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          color: isDark ? "#e5e7eb" : "#0058a3",
          textAlign: "center",
          padding: 24,
          backgroundColor: isDark ? "#0b0f14" : "transparent",
        }}
      >
        <h2>Your cart is empty</h2>
        <p style={{ color: isDark ? "#94a3b8" : "#475569" }}>Browse popular items and add what you like.</p>
        <Link
          to="/products"
          style={{
            backgroundColor: isDark ? "#38bdf8" : "#0058a3",
            color: isDark ? "#0b0f14" : "white",
            padding: "10px 20px",
            borderRadius: 999,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Go to products
        </Link>
      </section>
    );
  }

  return (
    <section
      style={{
        padding: "40px 24px",
        backgroundColor: isDark ? "#0b0f14" : "#f5f7fb",
        minHeight: "70vh",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1 style={{ color: isDark ? "#e5e7eb" : "#0058a3", marginBottom: 24 }}>My Cart</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 320px",
          gap: 24,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {items.map((item) => (
            <CartItem
              key={item.id}
              item={item}
              onIncrease={handleIncrease}
              onDecrease={handleDecrease}
              onRemove={handleRemove}
            />
          ))}
        </div>

        <CartSummary
          subtotal={subtotal}
          discount={discount}
          total={total}
          onCheckout={handleCheckout}
        />
      </div>
    </section>
  );
}

export default Cart;


