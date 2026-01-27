import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useWishlist } from "../../context/WishlistContext";
import { useCart } from "../../context/CartContext";
import { useAuth } from "../../context/AuthContext";
import "../../styles/product.css";
import { fetchProductsWithMeta } from "../../services/productService";


function ProductGrid({openMiniCart}) {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const { toggleItem, inWishlist, queuePendingWishlist } = useWishlist();
  const { addItem, items: cartItems } = useCart();
  const { isAuthenticated, user } = useAuth();
  const isStaff = user?.role && user.role !== "customer";
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      try {
        // Use BASE_URL so the JSON file loads correctly even when the app is served from a sub-path (e.g., GitHub Pages).
        const data = await fetchProductsWithMeta(controller.signal);
        setProducts(data);
        setError("");
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("Products could not be loaded:", err);
        setError("Something went wrong while loading products. Please try again.");
      }
    }

    loadProducts();

    return () => controller.abort();
  }, []);

  return (
    <div className="product-grid">
      {error && <p>{error}</p>}

      {!error && products.length === 0 && <p>Loading products...</p>}

      {products.map((p) => (
        <div className="product-card" key={p.id}>
          <Link
            to={`/products/${p.id}`}
            style={{ textDecoration: "none", color: "inherit", display: "block" }}
          >
            <img src={p.image} alt={p.name} />
            <h3>{p.name}</h3>
            <p className="price">₺{p.price.toLocaleString("tr-TR")}</p>
            <p className="stock">Stock: {p.availableStock}</p>
            <p className="rating">⭐ {p.averageRating} ({p.ratingCount})</p>
            <div className="product-cta">View Details</div>
          </Link>
          {!isStaff && (
            <>
              <div className="product-actions">
                <button
                  type="button"
                  className="product-add"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const existingQty = cartItems.find((item) => item.id === p.id)?.quantity ?? 0;
                    if (existingQty + 1 > p.availableStock) {
                      alert("Not enough stock for this item.");
                      return;
                    }
                    addItem(p, 1);
                    openMiniCart?.();
                  }}
                  disabled={p.availableStock <= 0}
                >
                  {p.availableStock > 0 ? "Add to Cart" : "Out of stock"}
                </button>
              </div>
              <button
                type="button"
                className={`wishlist-btn ${isAuthenticated && inWishlist(p.id) ? "active" : ""}`}
                aria-label="Toggle wishlist"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!isAuthenticated) {
                    queuePendingWishlist(p);
                    navigate("/login", { state: { from: location } });
                    return;
                  }
                  toggleItem(p);
                }}
              >
                {isAuthenticated && inWishlist(p.id) ? "\u2665" : "\u2661"}
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export default ProductGrid;
