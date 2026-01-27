import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { fetchProductById } from "../services/productService";
import { useWishlist } from "../context/WishlistContext";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

import { addComment, fetchProductComments, hasDelivered } from "../services/commentService";

function ProductDetail({ openMiniCart }) {
  const { id } = useParams();          
  const productId = Number(id);        
  const navigate = useNavigate();
  const location = useLocation();
  const { addItem, items: cartItems } = useCart();
  const { toggleItem, inWishlist, queuePendingWishlist } = useWishlist();
  const { user, isAuthenticated } = useAuth();
  const { isDark } = useTheme();
  const isStaff = user?.role && user.role !== "customer";

  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [comments, setComments] = useState([]);
  const [ratingInput, setRatingInput] = useState(5);
  const [commentInput, setCommentInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [delivered, setDelivered] = useState(false);

  const approvedComments = useMemo(
    () => comments.filter((c) => (c.status || "approved") === "approved"),
    [comments]
  );

  const reviewCount = useMemo(
    () => (product?.ratingCount ?? approvedComments.length),
    [product, approvedComments]
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadProduct() {
      try {
        setLoading(true);
        setError("");
        const found = await fetchProductById(productId, controller.signal);
        if (!found) {
          setError("Product not found.");
        } else {
          setProduct(found);
          setError("");
        }
      } catch (err) {
        if (err.name !== "AbortError") setError("Failed to load product");
      } finally {
        setLoading(false);
      }
    }

    loadProduct();
    return () => controller.abort();
  }, [productId]);

  async function loadComments() {
    try {
      const list = await fetchProductComments(productId, { userId: user?.id });
      if (Array.isArray(list) && list.length > 0) {
        setComments(list);
        return;
      }
      setComments([]);
    } catch {
      setComments([]);
    }
  }

  useEffect(() => {
    loadComments();
  }, [productId, user?.id]);

  async function refreshProductMeta() {
    try {
      const updated = await fetchProductById(productId);
      setProduct(updated);
    } catch (err) {
      console.error("Product refresh failed", err);
    }
  }

  useEffect(() => {
    if (!user) {
      setDelivered(false);
      return;
    }

    async function checkDelivery() {
      try {
        const data = await hasDelivered(user.id, productId);
        setDelivered(data.delivered);
      } catch {
        setDelivered(false);
      }
    }

    checkDelivery();
  }, [productId, user]);


  const handleAddToCart = () => {
    if (!product) return;

    const qtyInCart =
      cartItems.find((it) => it.id === product.id)?.quantity ?? 0;

    if (qtyInCart + 1 > product.availableStock) {
      return alert("Not enough stock.");
    }

    addItem(product, 1);
    openMiniCart?.(product);
    setProduct((prev) =>
      prev
        ? { ...prev, availableStock: Math.max(0, Number(prev.availableStock || 0) - 1) }
        : prev
    );
    alert("Added to cart.");
  };

  const handleBuyNow = () => {
    if (!product) return;
    if (!product.availableStock) {
      alert("This product is out of stock.");
      return;
    }
    handleAddToCart();
    navigate("/checkout", {
      state: {
        items: [{ ...product, quantity: 1 }],
      },
    });
  };

  const handleSubmitComment = async () => {
    if (!user) return alert("You must log in to leave a review.");
    if (!delivered) return alert("You can only comment after delivery.");

    setSubmitting(true);

    try {
      const response = await addComment({
        userId: user.id,
        productId,
        rating: ratingInput,
        text: commentInput,
        name: user.name,
      });

      if (response?.status === "approved") {
        alert("Your rating has been submitted and applied.");
      } else {
        alert("Your comment has been submitted for approval.");
      }

      await refreshProductMeta();

      if (response?.averageRating !== undefined || response?.ratingCount !== undefined) {
        setProduct((prev) =>
          prev
            ? {
                ...prev,
                averageRating:
                  response.averageRating !== undefined
                    ? Number(response.averageRating)
                    : prev.averageRating,
                ratingCount:
                  response.ratingCount !== undefined
                    ? Number(response.ratingCount)
                    : prev.ratingCount,
              }
            : prev
        );
      }

      setRatingInput(5);
      setCommentInput("");

      loadComments();
    } catch (err) {
      alert("Failed to submit comment.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <section style={pageStyle}>
        <p>Loading product...</p>
      </section>
    );
  }

  if (error || !product) {
    return (
      <section style={pageStyle}>
        <p style={{ color: "red" }}>{error}</p>
        <button onClick={() => navigate(-1)}>Go Back</button>
      </section>
    );
  }

  const hasDiscount =
    Number(product.originalPrice || 0) > 0 &&
    Number(product.originalPrice) > Number(product.price);
  const priceLabel = `\u20BA${Number(product.price).toLocaleString("tr-TR")}`;
  const originalPriceLabel = `\u20BA${Number(product.originalPrice).toLocaleString("tr-TR")}`;

  return (
    <section style={pageStyle}>
      {/* HEADER */}
      <div style={headerRow}>
        <div>
          <p style={{ margin: 0 }}>Product #{product.id}</p>
          <h1>{product.name}</h1>

          <div style={{ display: "flex", gap: 8 }}>
            <strong style={{ color: "#f59e0b" }}>
              ⭐ {Number(product.averageRating ?? product.rating ?? 0).toFixed(1)}
            </strong>
            <span>({reviewCount} reviews)</span>
            <span
              style={{ color: product.availableStock ? "green" : "red" }}
            >
              {product.availableStock
                ? `${product.availableStock} in stock`
                : "Out of stock"}
            </span>
          </div>
        </div>

        <Link to="/products" style={backBtn}>
          ← Back
        </Link>
      </div>

      <div style={contentGrid}>
        <div style={imageCard}>
        <img
          src={product.image}
          alt={product.name}
          style={mainImage}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.transformOrigin = "center center";
          }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            e.currentTarget.style.transformOrigin = `${x}% ${y}%`;
          }}
        />
        </div>

        <div style={infoCard}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>{priceLabel}</h2>
            {hasDiscount && (
              <>
                <span
                  style={{
                    color: isDark ? "#94a3b8" : "#64748b",
                    textDecoration: "line-through",
                    fontWeight: 700,
                  }}
                >
                  {originalPriceLabel}
                </span>
                {product.discountLabel && (
                  <span style={{ color: "#059669", fontWeight: 800 }}>
                    {product.discountLabel}
                  </span>
                )}
              </>
            )}
          </div>

          {product.description && (
            <section
              style={{
                background: isDark ? "#0b0f14" : "#f8fafc",
                borderRadius: 12,
                padding: 12,
                border: isDark ? "1px solid #1f2937" : "1px solid #e2e8f0",
              }}
            >
              <h3 style={{ margin: 0, marginBottom: 6, color: isDark ? "#7dd3fc" : "#0f172a" }}>
                Description
              </h3>
              <p style={{ margin: 0, lineHeight: 1.5, color: isDark ? "#e2e8f0" : "#475569" }}>
                {product.description}
              </p>
            </section>
          )}

          <section
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 12,
              border: "1px solid #e2e8f0",
              display: "grid",
              gap: 8,
            }}
          >
            <h3 style={{ margin: 0, marginBottom: 4, color: "#0f172a" }}>Product Details</h3>

            <Info label="Material" value={product.material ?? "N/A"} />
            <Info label="Color" value={product.color ?? "N/A"} />
            <Info label="Category" value={product.category ?? "N/A"} />
            <Info label="Warranty" value={product.warranty ?? "Not specified"} />
            <Info label="Distributor" value={product.distributor ?? "Not specified"} />
          </section>
          
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 10,
              background: isDark ? "#0b0f14" : "#f8fafc",
              padding: 12,
              borderRadius: 12,
              border: isDark ? "1px solid #1f2937" : "1px solid #e2e8f0",
            }}
            >
            <Info label="Model" value={`SU-${String(product.id).padStart(4, "0")}`} />
            <Info
              label="Serial"
              value={product.serialNumber || product.serial_number || `SN-${product.id}-2026`}
            />
            <Info label="Distributor" value={product.distributor ?? "SUHome Logistics"} />
            </div>

            {!isStaff && (
              <div style={buttonRow}>
                <button
                  onClick={() => {
                    if (!isAuthenticated) {
                      queuePendingWishlist(product);
                      navigate("/login", { state: { from: location } });
                      return;
                    }
                    toggleItem(product);
                  }}
                  style={wishlistBtn(isAuthenticated && inWishlist(product.id), isDark)}
                >
                  <span style={{ color: inWishlist(product.id) ? "#e11d48" : (isDark ? "#7dd3fc" : "#1e293b") }}>
                    {isAuthenticated && inWishlist(product.id) ? "\u2665" : "\u2661"}
                  </span>
                </button>

                <button
                  onClick={handleAddToCart}
                  disabled={product.availableStock === 0}
                  style={{
                    ...addCartBtn,
                    cursor: product.availableStock === 0 ? "not-allowed" : "pointer",
                    opacity: product.availableStock === 0 ? 0.6 : 1,
                  }}
                >
                  {product.availableStock ? "Add to Cart" : "Out of stock"}
                </button>

                <button
                  onClick={handleBuyNow}
                  disabled={product.availableStock === 0}
                  style={{
                    ...buyNowBtn,
                    opacity: product.availableStock === 0 ? 0.6 : 1,
                    cursor: product.availableStock === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  Buy Now
                </button>
              </div>
            )}
        </div>
      </div>

      <section style={reviewCard(isDark)}>
        <h2 style={{ color: isDark ? "#7dd3fc" : "#0f172a" }}>Customer Reviews</h2>

        {comments.length === 0 && (
          <p style={{ color: isDark ? "#cbd5e1" : "#475569" }}>No reviews yet.</p>
        )}

        {comments.map((c) => {
          const status = c.status || "approved";
          const statusColor = statusColors[status] || "#475569";
          const createdLabel = c.created_at
            ? new Date(c.created_at).toLocaleString()
            : "";
          const hasText = (c.comment_text || "").trim().length > 0;

          return (
            <div key={c.comment_id} style={reviewBlock(isDark)}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <strong style={{ color: isDark ? "#e2e8f0" : "#0f172a" }}>
                  {c.display_name || "Verified buyer"}
                </strong>
                {hasText && user?.id === c.user_id && status !== "approved" && (
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 12,
                      backgroundColor: `${statusColor}1a`,
                      color: statusColor,
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      textTransform: "capitalize",
                    }}
                  >
                    {status}
                  </span>
                )}
              </div>

              <div style={stars}>
                {"?".repeat(Number(c.rating) || 0)}
                {"?".repeat(5 - (Number(c.rating) || 0))}
              </div>

              {c.comment_text ? (
                <p style={{ margin: "4px 0", color: isDark ? "#e2e8f0" : "#0f172a" }}>
                  {c.comment_text}
                </p>
              ) : (
                <p style={{ margin: "4px 0", color: isDark ? "#cbd5e1" : "#94a3b8" }}>
                  No comment text provided.
                </p>
              )}

              {createdLabel && (
                <span style={{ color: isDark ? "#cbd5e1" : "#94a3b8", fontSize: "0.85rem" }}>
                  {createdLabel}
                </span>
              )}
            </div>
          );
        })}

      </section>
    </section>
  );
}

function Info({ label, value }) {
  const { isDark } = useTheme();
  return (
    <div>
      <p style={{ margin: 0, color: isDark ? "#cbd5e1" : "#94a3b8", fontSize: "0.9rem" }}>
        {label}
      </p>
      <p
        style={{
          margin: "4px 0 0",
          color: isDark ? "#e2e8f0" : "#0f172a",
          fontWeight: 700,
        }}
      >
        {value}
      </p>
    </div>
  );
}


const pageStyle = {
  padding: "40px 24px",
  background: "#f5f7fb",
  minHeight: "80vh",
};

const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const backBtn = {
  padding: "8px 14px",
  borderRadius: 999,
  border: "1px solid #ddd",
  textDecoration: "none",
};

const contentGrid = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.8fr",
  gap: 24,
  marginTop: 20,
};

const imageCard = {
  background: "white",
  padding: 16,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  overflow: "hidden",
};

const mainImage = {
  width: "100%",
  borderRadius: 12,
  transition: "transform 0.2s ease",
  cursor: "zoom-in",
};

const infoCard = {
  background: "white",
  padding: 20,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const wishlistBtn = (active, isDark) => ({
  width: 42,
  height: 42,
  borderRadius: "50%",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",

  background: active ? "#ffe4e6" : (isDark ? "#0f172a" : "#ffffff"), 
  border: active ? "1px solid #e11d48" : (isDark ? "1px solid #1f2937" : "1px solid #e2e8f0"),

  cursor: "pointer",
  transition: "all 0.2s ease",
});


const addCartBtn = {
  background: "#0058a3",
  color: "white",
  textDecoration: "none",
  padding: "14px 28px",
  borderRadius: 10,
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
};

const buyNowBtn = {
  background: "#0ea5e9",
  color: "white",
  textDecoration: "none",
  padding: "14px 22px",
  borderRadius: 10,
  fontWeight: 700,
  border: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const buttonRow = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginTop: 8,
  flexWrap: "wrap",
};

const reviewCard = (isDark) => ({
  marginTop: 30,
  background: isDark ? "#0f172a" : "white",
  padding: 20,
  borderRadius: 12,
  border: isDark ? "1px solid #1f2937" : "1px solid #e5e7eb",
});

const reviewBlock = (isDark) => ({
  padding: 12,
  borderRadius: 10,
  border: isDark ? "1px solid #1f2937" : "1px solid #e2e8f0",
  marginBottom: 12,
  background: isDark ? "#0b0f14" : "#f8fafc",
});

const statusColors = {
  approved: "#15803d",
  pending: "#d97706",
  rejected: "#b91c1c",
};

const stars = {
  color: "#f59e0b",
  fontSize: "1rem",
};

const select = {
  display: "block",
  marginBottom: 10,
  padding: 10,
  borderRadius: 8,
  border: "1px solid #cbd5e1",
};

const textarea = {
  width: "100%",
  minHeight: 90,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  resize: "vertical",
  marginBottom: 12,
};

const submitBtn = {
  background: "#0058a3",
  color: "white",
  padding: "12px 16px",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 700,
};

export default ProductDetail;



