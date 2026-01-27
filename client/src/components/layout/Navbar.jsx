import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useChat } from "../../context/ChatContext";
import "../../styles/navbar.css";
import { useAuth } from "../../context/AuthContext";
import MiniCartPreview from "../cart/MiniPreview";
import { useWishlist } from "../../context/WishlistContext";
import { fetchProductsWithMeta } from "../../services/productService";

const baseLinks = [
  { to: "/", label: "Home", end: true },
  { to: "/products", label: "Categories" },
  { to: "/cart", label: "Cart" },
  { to: "/wishlist", label: "Wishlist" },
  { to: "/profile", label: "Profile" },
  { to: "/login", label: "Login" },
];

function Navbar({showMiniCart, setShowMiniCart }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { openChat } = useChat();

  const { user, logout } = useAuth();
  const { items: wishlistItems } = useWishlist();
  const userLoggedIn = !!user;
  const isProductManager = user?.role === "product_manager";
  const isSalesManager = user?.role === "sales_manager";
  const isStaff = isProductManager || isSalesManager;
  const canAccessAdmin = ["admin", "product_manager", "sales_manager", "support"].includes(
    user?.role
  );
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!userLoggedIn) {
      setNotifications([]);
      return undefined;
    }
    if (!wishlistItems.length) {
      setNotifications([]);
      return undefined;
    }
    const controller = new AbortController();
    let isActive = true;

    fetchProductsWithMeta(controller.signal)
      .then((products) => {
        if (!isActive) return;
        const byId = new Map(products.map((product) => [String(product.id), product]));
        const matches = wishlistItems
          .map((item) => {
            const updated = byId.get(String(item.id));
            return updated ? { ...item, ...updated } : item;
          })
          .filter((item) => item.hasDiscount);
        setNotifications(matches);
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        console.error("Notification refresh failed", error);
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [userLoggedIn, wishlistItems]);

  const notificationCount = notifications.length;
  const notificationLabel = useMemo(
    () =>
      notifications.map((item) => ({
        id: item.id,
        name: item.name,
        discountLabel: item.discountLabel || "Discount",
      })),
    [notifications]
  );

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const handleNavClick = () => {
    setOpen(false);
    setNotificationsOpen(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const term = search.trim();
    if (!term) return;
    navigate(`/products?search=${encodeURIComponent(term)}`);
    setOpen(false);
  };

  return (
    <nav className="nav">
      <div className="nav__inner">
        <div className={`nav__brand ${userLoggedIn ? "logged-in-shadow" : ""}`}>
          {userLoggedIn ? `Welcome, ${user.name}` : "SUHome"}
        </div>

        <button
          type="button"
          className="nav__toggle"
          aria-label="Toggle menu"
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="nav__burger" />
          <span className="nav__burger" />
          <span className="nav__burger" />
        </button>

        <div className={`nav__links ${open ? "is-open" : ""}`}>
          {[...baseLinks, ...(canAccessAdmin ? [{ to: "/admin", label: "Admin" }] : [])]
            .filter((link) => {
              if (userLoggedIn && link.to === "/login") return false;
              if (!userLoggedIn && link.to === "/wishlist") return false;
              if (isStaff && (link.to === "/cart" || link.to === "/wishlist"))
                return false;
              if (isStaff && link.to === "/profile") return false;
              return true;
            })
            .map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => `nav__link ${isActive ? "active" : ""}`}
                onClick={handleNavClick}
              >
                {link.label}
              </NavLink>
            ))}

          {userLoggedIn && !isStaff && (
            <div className="nav__notifications">
              <button
                type="button"
                className="nav__bell"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                aria-label="Notifications"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="nav__bell-icon"
                >
                  <path
                    d="M12 22a2.3 2.3 0 0 0 2.2-2h-4.4A2.3 2.3 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z"
                    fill="currentColor"
                  />
                </svg>
                {notificationCount > 0 && (
                  <span className="nav__badge">{notificationCount}</span>
                )}
              </button>
              {notificationsOpen && (
                <div className="nav__dropdown">
                  <div className="nav__dropdown-title">Notifications</div>
                  {notificationCount === 0 ? (
                    <p className="nav__dropdown-empty">No notifications yet.</p>
                  ) : (
                    <ul className="nav__dropdown-list">
                      {notificationLabel.map((item) => (
                        <li key={item.id}>
                          <NavLink
                            to={`/products/${item.id}`}
                            className="nav__dropdown-link"
                            onClick={handleNavClick}
                          >
                            {item.discountLabel} on {item.name}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {userLoggedIn && (
            <a
              href="#"
              className="nav__link signout-link"
              onClick={(e) => {
                e.preventDefault();
                handleLogout();
              }}
            >
              Sign Out
            </a>
          )}

          <form className="nav__search" onSubmit={handleSearch}>
            <input
              type="search"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit">Search</button>
          </form>

          <button
            type="button"
            className="nav__chat"
            onClick={() => {
              openChat();
              setOpen(false);
            }}
          >
            Support Chat
          </button>
        </div>
      </div>

      {showMiniCart && !isStaff && (
        <MiniCartPreview
          onClose={() => setShowMiniCart(false)}
        />
      )}
    </nav>
  );
}

export default Navbar;
