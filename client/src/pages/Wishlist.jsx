import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWishlist } from "../context/WishlistContext";
import { fetchProductsWithMeta } from "../services/productService";
import { useCart } from "../context/CartContext";
import { useTheme } from "../context/ThemeContext";

function Wishlist({ openMiniCart }) {
  const { items, removeItem: removeWishlistItem } = useWishlist();
  const {
    addItem,
    items: cartItems,
    increment,
    decrement,
    removeItem: removeCartItem,
  } = useCart();
  const { isDark } = useTheme();

  const [displayItems, setDisplayItems] = useState(items);

  useEffect(() => {
    setDisplayItems(items);
    if (!items.length) return undefined;
    const controller = new AbortController();
    let isActive = true;

    fetchProductsWithMeta(controller.signal)
      .then((products) => {
        if (!isActive) return;
        const byId = new Map(products.map((p) => [String(p.id), p]));
        setDisplayItems(items.map((item) => {
          const updated = byId.get(String(item.id));
          return updated ? { ...item, ...updated } : item;
        }));
      })
      .catch((error) => {
        console.error("Wishlist refresh failed", error);
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [items]);

  const cartQty = (id) => {
    const cartItem = cartItems.find((item) => item.id === id);
    return cartItem ? cartItem.quantity : 0;
  };

  const displayStock = (product) => {
    const baseStock = Number(product.availableStock || 0);
    const qty = cartQty(product.id);
    return Math.max(0, baseStock - qty);
  };

  const handleAddFirst = (product) => {
    if (displayStock(product) <= 0) return;
    addItem(product, 1);
    openMiniCart?.(product);
  };

  const handleIncrease = (product) => {
    if (displayStock(product) <= 0) return;
    const current = cartQty(product.id);
    if (Number.isFinite(product.availableStock) && current + 1 > product.availableStock) {
      alert("Not enough stock for this item.");
      return;
    }
    increment(product.id);
    openMiniCart?.(product);
  };

  const handleDecrease = (product) => {
    const current = cartQty(product.id);
    if (current <= 0) return;
    if (current === 1) {
      removeCartItem(product.id);
      return;
    }
    decrement(product.id);
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
          gap: 12,
          color: isDark ? "#e5e7eb" : "#0f172a",
          textAlign: "center",
          padding: 24,
          backgroundColor: isDark ? "#0b0f14" : "transparent",
        }}
      >
        <h2 style={{ margin: 0 }}>Your wishlist is empty</h2>
        <p style={{ margin: 0, color: isDark ? "#94a3b8" : "#475569" }}>
          Tap the heart icon on products to save your favorites.
        </p>
        <Link
          to="/products"
          style={{
            backgroundColor: isDark ? "#38bdf8" : "#0058a3",
            color: isDark ? "#0b0f14" : "white",
            padding: "10px 20px",
            borderRadius: 999,
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Browse products
        </Link>
      </section>
    );
  }

  return (
    <section style={{ padding: "40px 20px", background: "#f5f7fb", minHeight: "70vh" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 18,
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div>
            <p style={{ margin: 0, color: "#94a3b8", letterSpacing: 1 }}>WISHLIST</p>
            <h1 style={{ margin: "6px 0 8px", color: "#0f172a" }}>Wishlist</h1>
            <p style={{ margin: 0, color: isDark ? "#94a3b8" : "#475569" }}>
              Saved products ready to add to your cart.
            </p>
          </div>
          <Link
            to="/products"
            style={{
              color: "#0058a3",
              textDecoration: "none",
              fontWeight: 700,
              border: "1px solid #cbd5e1",
              borderRadius: 999,
              padding: "8px 14px",
              background: "white",
            }}
          >
            Back to products
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {displayItems.map((item) => {
            const qty = cartQty(item.id);
            const stockLeft = displayStock(item);
            const rating = Number.isFinite(Number(item.averageRating)) ? item.averageRating : 0;
            const ratingCount = Number.isFinite(Number(item.ratingCount)) ? item.ratingCount : 0;

            return (
              <article
                key={item.id}
                style={{
                  background: isDark ? "#2b2f36" : "#ffffff",
                  borderRadius: 16,
                  border: isDark ? "1px solid #3a4250" : "1px solid #e2e8f0",
                  boxShadow: isDark ? "0 14px 30px rgba(0,0,0,0.5)" : "0 14px 30px rgba(15,23,42,0.06)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Link to={`/products/${item.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{ position: "relative" }}>
                    <img
                      src={item.image}
                      alt={item.name}
                      style={{ width: "100%", height: 180, objectFit: "cover", borderRadius: "12px 12px 0 0" }}
                    />
                    {stockLeft <= 0 && (
                      <span
                        style={{
                          position: "absolute",
                          top: 10,
                          right: 10,
                          background: "#b91c1c",
                          color: isDark ? "#0b0f14" : "white",
                          padding: "6px 10px",
                          borderRadius: 12,
                          fontWeight: 800,
                          fontSize: "0.85rem",
                        }}
                      >
                        Out of stock
                      </span>
                    )}
                  </div>
                  <div style={{ padding: 14, display: "grid", gap: 6 }}>
                    <h3 style={{ margin: 0, color: isDark ? "#7dd3fc" : "#0f172a" }}>{item.name}</h3>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ color: "#f59e0b", fontWeight: 700 }}>
                        {"\u2B50"} {rating}
                      </span>
                      <span style={{ color: isDark ? "#cbd5e1" : "#64748b", fontSize: "0.9rem" }}>({ratingCount})</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <p style={{ margin: 0, fontWeight: 800, color: isDark ? "#e2e8f0" : "#0f172a" }}>
                        {`\u20BA${Number(item.price).toLocaleString("tr-TR")}`}
                      </p>
                      {item.hasDiscount && (
                        <>
                          <p style={{ margin: 0, color: isDark ? "#a3b3c6" : "#94a3b8", textDecoration: "line-through" }}>
                            {`\u20BA${Number(item.originalPrice).toLocaleString("tr-TR")}`}
                          </p>
                          <span style={{ color: "#059669", fontWeight: 800, fontSize: "0.9rem" }}>
                            {item.discountLabel}
                          </span>
                        </>
                      )}
                    </div>
                    <p
                      style={{
                        margin: 0,
                        color: stockLeft > 0 ? (isDark ? "#34d399" : "#059669") : "#b91c1c",
                        fontWeight: 700,
                      }}
                    >
                      {stockLeft > 0 ? `${stockLeft} in stock` : "Out of stock"}
                    </p>
                  </div>
                </Link>

                <div style={{ display: "flex", gap: 8, padding: "0 14px 14px" }}>
                  {qty === 0 ? (
                    <button
                      onClick={() => handleAddFirst(item)}
                      disabled={stockLeft <= 0}
                      style={{
                        flex: 1,
                        background: "#0058a3",
                        color: "#fff",
                        borderRadius: 10,
                        padding: "10px 12px",
                        fontWeight: 800,
                        cursor: stockLeft <= 0 ? "not-allowed" : "pointer",
                        opacity: stockLeft <= 0 ? 0.6 : 1,
                        border: "none",
                        transition: ".2s",
                      }}
                    >
                      {stockLeft <= 0 ? "Out of stock" : "Add to cart"}
                    </button>
                  ) : (
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "4px 12px",
                        borderRadius: 10,
                        background: "#0058a3",
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: "1rem",
                        transition: ".2s",
                      }}
                    >
                      <button
                        onClick={() => handleDecrease(item)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: "none",
                          background: "#fff",
                          color: "#0058a3",
                          fontWeight: 900,
                          cursor: "pointer",
                        }}
                      >
                        -
                      </button>
                      <span style={{ fontSize: "1rem", fontWeight: 900 }}>{qty}</span>
                      <button
                        onClick={() => handleIncrease(item)}
                        disabled={
                          stockLeft <= 0 ||
                          (Number.isFinite(item.availableStock) && qty >= item.availableStock)
                        }
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: "none",
                          background: "#fff",
                          color: "#0058a3",
                          fontWeight: 900,
                          cursor:
                            stockLeft <= 0 ||
                            (Number.isFinite(item.availableStock) && qty >= item.availableStock)
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            stockLeft <= 0 ||
                            (Number.isFinite(item.availableStock) && qty >= item.availableStock)
                              ? 0.6
                              : 1,
                        }}
                      >
                        +
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => removeWishlistItem(item.id)}
                    style={{
                      border: "1px solid #cbd5e1",
                      borderRadius: 10,
                      background: "#fff",
                      color: "#b91c1c",
                      padding: "0 12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default Wishlist;








