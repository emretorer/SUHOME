import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { fetchProductsWithMeta } from "../services/productService";
import { getMainCategories } from "../services/mainCategoryService";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import Spinner from "../components/ui/Spinner";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";


const fallbackMainCategories = [
  "living room",
  "bedroom",
  "workspace",
  "seating",
  "tables",
  "storage",
  "lighting",
  "bedding",
];

const PAGE_SIZE = 12;

function ProductList({openMiniCart}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState("all");
  const [roomFilter, setRoomFilter] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState("popularity");
  const [mainCategoryOptions, setMainCategoryOptions] = useState([]);

  const { addItem, items: cartItems, increment, decrement, removeItem } = useCart();
  const { toggleItem, inWishlist, queuePendingWishlist } = useWishlist();
  const { user, isAuthenticated } = useAuth();
  const isStaff = user?.role && user.role !== "customer";

const cartQty = (id) => {
  const item = cartItems.find((i) => i.id === id);
  return item ? item.quantity : 0;
};

const handleAddFirst = (p) => {
  if (p.availableStock <= 0) return;

  addItem(p, 1);
  openMiniCart?.(p);

  setProducts((prev) =>
    prev.map((pr) =>
      pr.id === p.id
        ? { ...pr, availableStock: Math.max(0, Number(pr.availableStock || 0) - 1) }
        : pr
    )
  );
};


const handleIncrease = (p) => {
  if (p.availableStock <= 0) return;

  increment(p.id);
  openMiniCart?.(p);

  setProducts((prev) =>
    prev.map((pr) =>
      pr.id === p.id
        ? { ...pr, availableStock: Math.max(0, Number(pr.availableStock || 0) - 1) }
        : pr
    )
  );
};
const handleDecrease = (p) => {
  const current = cartQty(p.id);

  if (current <= 0) return;

  if (current === 1) {

    removeItem(p.id);            

    setProducts((prev) =>
      prev.map((pr) =>
        pr.id === p.id
          ? { ...pr, availableStock: Number(pr.availableStock || 0) + 1 }
          : pr
      )
    );
    return;
  }


  decrement(p.id);

  setProducts((prev) =>
    prev.map((pr) =>
      pr.id === p.id
        ? { ...pr, availableStock: Number(pr.availableStock || 0) + 1 }
        : pr
    )
  );
};

  const handleWishlist = (product) => {
    if (isStaff) return;
    if (!isAuthenticated) {
      queuePendingWishlist(product);
      navigate("/login", { state: { from: location } });
      return;
    }
    toggleItem(product);
  };




  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchProductsWithMeta(controller.signal)
      .then((items) => {
        setProducts(items);
        setError("");
      })
      .catch((err) => {
        console.error("Products load failed", err);
        setError("Products could not be loaded. Please try again.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getMainCategories(controller.signal)
      .then((data) => {
        const normalized = (data || [])
          .map((item) => String(item.name || "").trim().toLowerCase())
          .filter(Boolean);
        setMainCategoryOptions(normalized);
      })
      .catch(() => {
        setMainCategoryOptions([]);
      });
    return () => controller.abort();
  }, []);

  const categoryOptions = useMemo(() => {
    const source = mainCategoryOptions.length ? mainCategoryOptions : fallbackMainCategories;
    return ["all", ...source];
  }, [mainCategoryOptions]);

  const formatCategoryLabel = (value) => {
    if (value === "all") return "All";
    return value
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const term = params.get("search") || "";
    const room = params.get("room") || "";
    setSearchTerm(term);
    setRoomFilter(room);
    setPage(1);
  }, [location.search]);

  const filtered = useMemo(() => {
    let list = products;
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      
      const searchableFields = [
        "name",
        "description",
        "category",
        "material",
        "color",
        "mainCategory",
      ];
      
      list = list.filter((p) =>
        searchableFields.some((field) =>
          (Array.isArray(p[field]) ? p[field].join(" ") : p[field] || "")
            .toString()
            .toLowerCase()
            .includes(term)
        )
      );
  
    }
    if (roomFilter.trim()) {
      const normalizedRoom = roomFilter.trim().toLowerCase();
      if (normalizedRoom === "workspace") {
        const workspaceKeywords = [
          "desk",
          "table",
          "chair",
          "lamp",
          "lighting",
          "shelf",
          "storage",
          "work",
        ];
        const workspaceExclusions = [
          "aero curve spoon",
          "matte stone set",
        ];
        list = list.filter((p) => {
          const haystack = [
            p.name,
            p.category,
            p.description,
            Array.isArray(p.mainCategory) ? p.mainCategory.join(" ") : p.mainCategory,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (workspaceExclusions.some((kw) => haystack.includes(kw))) {
            return false;
          }
          if (haystack.includes("wardrobe")) {
            return false;
          }
          return workspaceKeywords.some((kw) => haystack.includes(kw));
        });
      } else {
        const roomExclusions = {
          "living room": ["midnight silk pillow", "noir carry box"],
          bedroom: [
            "velour noir sectional sofa",
            "lumin edge table",
            "soft round table",
            "velour executive desk",
          ],
        };
        const exclusions = roomExclusions[normalizedRoom] || [];
        list = list.filter((p) => {
          const haystack = [
            p.name,
            p.category,
            p.description,
            Array.isArray(p.mainCategory) ? p.mainCategory.join(" ") : p.mainCategory,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (normalizedRoom === "bedroom" && haystack.includes("box")) {
            return false;
          }
          if (exclusions.some((kw) => haystack.includes(kw))) {
            return false;
          }
          if (Array.isArray(p.mainCategory)) {
            return p.mainCategory.some((entry) => String(entry).toLowerCase().includes(normalizedRoom));
          }
          return (p.mainCategory || "").toLowerCase().includes(normalizedRoom);
        });
      }
    }
    if (category !== "all") {
      list = list.filter((p) => {
        if (Array.isArray(p.mainCategory)) {
          return p.mainCategory.some((entry) => String(entry).toLowerCase() === category);
        }
        return String(p.mainCategory || "").toLowerCase() === category;
      });
    }
    if (sort === "price-asc") {
      list = [...list].sort((a, b) => a.price - b.price);
    } else if (sort === "price-desc") {
      list = [...list].sort((a, b) => b.price - a.price);
    } else if (sort === "popularity") {
      // Higher average rating first; tie-breaker: more ratings
      list = [...list].sort((a, b) => {
        const avgDiff = (b.averageRating || 0) - (a.averageRating || 0);
        if (avgDiff !== 0) return avgDiff;
        return (b.ratingCount || 0) - (a.ratingCount || 0);
      });
    }
    return list;
  }, [category, products, roomFilter, searchTerm, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleAdd = async (product) => {
  // 1) Önce frontend stok kontrolü
  const existingQty = cartItems.find((item) => item.id === product.id)?.quantity ?? 0;

  if (existingQty + 1 > product.availableStock) {
    alert("Not enough stock for this item.");
    return;
  }

  // 2) Eğer stok 0 ise hiç ekleme yapma
  if (product.availableStock <= 0) {
    alert("This product is out of stock.");
    return;
  }

  // 3) Ürünü sepete ekle
  addItem(product, 1);
};


  return (
    <main style={{ padding: "30px 20px", background: "#f5f7fb", minHeight: "75vh" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 18 }}>
        <header style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, color: "#94a3b8", letterSpacing: 1 }}>CATEGORIES</p>
            <h1 style={{ margin: "6px 0 8px", color: "#0f172a" }}>Browse our products</h1>
            <p style={{ margin: 0, color: isDark ? "#7dd3fc" : "#475569" }}>
              Filter by category, search, sort, check stock, and jump into details.
            </p>
            {searchTerm && (
              <p style={{ margin: "6px 0 0", color: isDark ? "#e2e8f0" : "#0f172a", fontWeight: 700 }}>
                Showing results for "{searchTerm}"
              </p>
            )}
            {roomFilter && (
              <div style={{ margin: "6px 0 0", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#0f172a", fontWeight: 700 }}>
                  Room: {roomFilter}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(location.search);
                    params.delete("room");
                    const next = params.toString();
                    navigate({
                      pathname: location.pathname,
                      search: next ? `?${next}` : "",
                    });
                  }}
                  style={{
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#0f172a",
                    padding: "4px 10px",
                    borderRadius: 999,
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Clear room filter
                </button>
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 240, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {categoryOptions.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategory(cat);
                  setPage(1);
                }}
                style={{
                  border: "1px solid",
                  borderColor: cat === category ? (isDark ? "#38bdf8" : "#0058a3") : (isDark ? "#1f2937" : "#cbd5f5"),
                  background: isDark ? "#0f172a" : (cat === category ? "#0058a3" : "#ffffff"),
                  color: cat === category ? (isDark ? "#7dd3fc" : "#ffffff") : (isDark ? "#e5e7eb" : "#0f172a"),
                  padding: "8px 12px",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {formatCategoryLabel(cat)}
              </button>
            ))}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={{
                border: isDark ? "1px solid #1f2937" : "1px solid #cbd5e1",
                borderRadius: 10,
                padding: "8px 12px",
                fontWeight: 700,
                cursor: "pointer",
                background: isDark ? "#0f172a" : "white",
                color: isDark ? "#e5e7eb" : "#0f172a",
              }}
            >
              <option value="popularity">Sort: Popularity</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
            </select>
          </div>
        </header>

        {error && (
          <div
            style={{
              background: "#fef2f2",
              color: "#b91c1c",
              border: "1px solid #fecdd3",
              borderRadius: 12,
              padding: 16,
            }}
          >
            {error}
          </div>
        )}

        {loading && (
          <div style={{ color: "#475569", display: "flex", alignItems: "center", gap: 10 }}>
            <Spinner /> <span>Loading products...</span>
          </div>
        )}

        {!loading && !error && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
              }}
            >
              {paged.map((p) => (
                <article
                  key={p.id}
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
                  <Link
                    to={`/products/${p.id}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div style={{ position: "relative" }}>
                      <img
                        src={p.image}
                        alt={p.name}
                        style={{ width: "100%", height: 180, objectFit: "cover", borderRadius: "12px 12px 0 0" }}
                      />
                      {p.availableStock <= 0 && (
                        <span
                          style={{
                            position: "absolute",
                            top: 10,
                            right: 10,
                            background: "#b91c1c",
                            color: "white",
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
                      <h3 style={{ margin: 0, color: isDark ? "#e2e8f0" : "#0f172a" }}>{p.name}</h3>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ color: "#f59e0b", fontWeight: 700 }}>⭐ {p.averageRating}</span>
                        <span style={{ color: isDark ? "#cbd5e1" : "#64748b", fontSize: "0.9rem" }}>({p.ratingCount})</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                        <p style={{ margin: 0, fontWeight: 800, color: isDark ? "#e2e8f0" : "#0f172a" }}>
                          ₺{p.price.toLocaleString("tr-TR")}
                        </p>
                        {p.hasDiscount && (
                          <>
                            <p style={{ margin: 0, color: isDark ? "#a3b3c6" : "#94a3b8", textDecoration: "line-through" }}>
                              ₺{p.originalPrice.toLocaleString("tr-TR")}
                            </p>
                            <span style={{ color: "#059669", fontWeight: 800, fontSize: "0.9rem" }}>
                              {p.discountLabel}
                            </span>
                          </>
                        )}
                      </div>
                      <p style={{ margin: 0, color: p.availableStock > 0 ? "#059669" : "#b91c1c", fontWeight: 700 }}>
                        {p.availableStock > 0 ? `${p.availableStock} in stock` : "Out of stock"}
                      </p>
                    </div>
                  </Link>
                  {!isStaff && (
                    <>
                      {/* ---------- Add to cart buton alanı ---------- */}
                      <div style={{ display:"flex", gap:8, padding:"0 14px 14px" }}>

                        {cartQty(p.id) === 0 ? (
                          // ---------------- ADD TO CART (ba?lang??) ----------------
                          <>
                            <button
                              onClick={() => handleAddFirst(p)}
                              disabled={p.availableStock<=0}
                              style={{
                                flex:1,
                                background:"#0058a3",
                                color:"#fff",
                                borderRadius:10,
                                padding:"10px 12px",
                                fontWeight:800,
                                cursor:p.availableStock<=0?"not-allowed":"pointer",
                                opacity:p.availableStock<=0?0.6:1,
                                border:"none",
                                transition:".2s"
                              }}
                            >
                              {p.availableStock<=0 ? "Out of stock" : "Add to cart"}
                            </button>
                              <button
                                onClick={() => handleWishlist(p)}
                                style={{
                                  width:48,
                                  borderRadius:10,
                                  border: isDark ? "1px solid #3a4250" : "1px solid #cbd5e1",
                                  background: isAuthenticated && inWishlist(p.id)
                                    ? (isDark ? "#3b1f26" : "#fee2e2")
                                    : (isDark ? "#2b2f36" : "#fff"),
                                  cursor:"pointer",
                                  fontSize:"1.1rem",
                                  fontWeight:700,
                                  color: isDark ? "#cbd5e1" : "#0f172a"
                                }}
                              >
                                {isAuthenticated && inWishlist(p.id) ? "\u2665" : "\u2661"}
                              </button>
                          </>
                        ) : (

                          <>
                            {/* ---------------- Saya? g?r?n?m? ---------------- */}
                          <div style={{
                            flex:1,
                            display:"flex",
                            alignItems:"center",
                            justifyContent:"space-between",
                            padding:"4px 12px",
                            borderRadius:10,
                            background:"#0058a3",
                            color:"#fff",
                            fontWeight:800,
                            fontSize:"1rem",
                            transition:".2s"
                          }}>
                            
                            {/* - */}
                            <button
                              onClick={() => handleDecrease(p)}
                              style={{
                                width:28,
                                height:28,
                                borderRadius:6,
                                border:"none",
                                background:"#fff",
                                color:"#0058a3",
                                fontWeight:900,
                                cursor:"pointer"
                              }}
                            >
                              -
                            </button>

                            {/* sayı */}
                            <span style={{ fontSize:"1rem", fontWeight:900 }}>
                              {cartQty(p.id)}
                            </span>

                            {/* + */}
                            <button
                              onClick={() => handleIncrease(p)}
                              disabled={p.availableStock <= 0}
                              style={{
                                width:28,
                                height:28,
                                borderRadius:6,
                                border:"none",
                                background:"#fff",
                                color:"#0058a3",
                                fontWeight:900,
                                cursor: p.availableStock<=0?"not-allowed":"pointer",
                                opacity:p.availableStock<=0?.5:1
                              }}
                            >
                              +
                            </button>

                          </div>

                          <button
                            onClick={() => handleWishlist(p)}
                            style={{
                              width: 48,
                              borderRadius: 10,
                              border: isDark ? "1px solid #3a4250" : "1px solid #cbd5e1",
                              background: isAuthenticated && inWishlist(p.id)
                                ? (isDark ? "#3b1f26" : "#fee2e2")
                                : (isDark ? "#2b2f36" : "#fff"),
                              cursor: "pointer",
                              fontSize: "1.1rem",
                              fontWeight: 700,
                              color: isDark ? "#cbd5e1" : "#0f172a",
                            }}
                          >
                            {isAuthenticated && inWishlist(p.id) ? "\u2665" : "\u2661"}
                          </button>
                          </>
                        )}

                          
                      </div>
                    </>
                  )}

                </article>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 14,
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <p style={{ margin: 0, color: isDark ? "#7dd3fc" : "#475569" }}>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{
                    border: isDark ? "1px solid #1f2937" : "1px solid #cbd5e1",
                    background: isDark ? "#0f172a" : "#ffffff",
                    color: isDark ? "#e5e7eb" : "#0f172a",
                    padding: "8px 12px",
                    borderRadius: 10,
                    cursor: currentPage === 1 ? "not-allowed" : "pointer",
                  }}
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{
                    border: isDark ? "1px solid #1f2937" : "1px solid #cbd5e1",
                    background: isDark ? "#0f172a" : "#ffffff",
                    color: isDark ? "#e5e7eb" : "#0f172a",
                    padding: "8px 12px",
                    borderRadius: 10,
                    cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default ProductList;



