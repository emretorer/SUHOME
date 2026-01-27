import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { fetchUserProfile, updateUserProfile } from "../services/userService";
import {
  cancelOrder,
  fetchUserOrders,
  formatOrderId,
  getOrders,
  requestReturn,
  fetchUserReturnRequests,
} from "../services/orderService";
import { formatPrice } from "../utils/formatPrice";
import { useTheme } from "../context/ThemeContext";


function Profile() {
  const { user, updateUser } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { addToast } = useToast();
  const canUseDarkMode = user?.role === "customer";
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

  // Product managers should stay on the admin dashboard
  if (user?.role === "product_manager") {
    return <Navigate to="/admin" replace />;
  }

  const storageKey = user ? `profile:${user.email}` : null;
  const [profile, setProfile] = useState(() =>
    storageKey
      ? loadProfile(storageKey, {
          name: user?.name ?? "Guest",
          email: user?.email ?? "guest@suhome.com",
          address: user?.address ?? "Not set",
          taxId: user?.taxId ?? "",
          memberSince: "2025",
          emailNotifications: true,
        })
      : null
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile || {});
  const [orders, setOrders] = useState([]);
  const [returnRequests, setReturnRequests] = useState([]);
  const [emailNotifications, setEmailNotifications] = useState(() => profile?.emailNotifications ?? true);

  useEffect(() => {
    if (profile && typeof profile.emailNotifications === "boolean") {
      setEmailNotifications(profile.emailNotifications);
    }
  }, [profile]);

  const handleToggleEmailNotifications = () => {
    const nextValue = !emailNotifications;
    setEmailNotifications(nextValue);
    if (storageKey) {
      const nextProfile = { ...(profile || {}), emailNotifications: nextValue };
      setProfile(nextProfile);
      saveProfile(storageKey, nextProfile);
    }
  };

const REFUND_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const getOrderDate = (order) => {
  const candidates = [
    order?.date,
    order?.orderDate,
    order?.order_date,
    order?.createdAt,
    order?.created_at,
    order?.deliveredAt,
    order?.statusUpdatedAt,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
};

const isRefundWindowOpen = (order) => {
  const orderDate = getOrderDate(order);
  if (!orderDate) return true;
  const diffDays = (Date.now() - orderDate.getTime()) / MS_PER_DAY;
  return diffDays <= REFUND_WINDOW_DAYS;
};

const canDownloadInvoice = (order) => {
  if (!order) return false;
  if (order.status !== "Delivered") return false;
  const orderDate = getOrderDate(order);
  if (!orderDate) return false;
  const diffDays = (Date.now() - orderDate.getTime()) / MS_PER_DAY;
  return diffDays <= REFUND_WINDOW_DAYS;
};

const getRefundState = (order) => {
  if (order?.status === "Refund Waiting") {
    return { allowed: false, label: "Refund in progress", reason: "Waiting for sales manager approval" };
  }
  if (order?.status === "Refunded") {
    return { allowed: false, label: "Refund accepted", reason: "Order already refunded" };
  }
  if (order?.status === "Refund Rejected") {
    return { allowed: false, label: "Refund Rejected", reason: "Refund request was rejected" };
  }
  if (order?.status === "Cancelled") {
    return { allowed: false, label: "Cannot be refunded", reason: "Cancelled orders cannot be refunded" };
  }
  if (order?.status === "Processing") {
    return { allowed: false, label: "Cannot be refunded", reason: "Processing orders cannot be refunded" };
  }
  if (order?.status !== "Delivered") {
    return { allowed: false, label: "Cannot be refunded", reason: "Only delivered orders can be refunded" };
  }
  if (!isRefundWindowOpen(order)) {
    return {
      allowed: false,
      label: "Refund expired",
      reason: "Refunds are only available within 30 days of the order date.",
    };
  }
  return { allowed: true, label: "Refund", reason: "Request refund" };
};

const getCancelState = (order) => {
  if (order?.status === "Processing") {
    return { allowed: true, label: "Cancel", reason: "Cancel this order" };
  }
  if (order?.status === "Cancelled") {
    return { allowed: false, label: "Cancelled", reason: "Order already cancelled" };
  }
  return { allowed: false, label: "Cancel", reason: "Only processing orders can be cancelled" };
};

const getDisplayStatus = (status) => {
  if (["Cancelled", "Canceled"].includes(status)) return "Cancelled";
  if (status === "Refund Waiting") return "Refund in progress";
  if (status === "Refunded") return "Refund accepted";
  if (status === "Refund Rejected") return "Refund Rejected";
  return status;
};

const formatReturnStatus = (value) => {
  const normalized = String(value || "").toLowerCase();
  if (["requested", "accepted", "received"].includes(normalized)) return "Refund in progress";
  if (normalized === "refunded") return "Refund accepted";
  if (normalized === "rejected") return "Refund Rejected";
  return value || "";
};

const handleCancelOrder = async (orderId) => {
  if (!window.confirm("Are you sure you want to cancel this order?")) return;

  try {
    await cancelOrder(orderId);

    setOrders(prev =>
      prev.map(o =>
        o.id === orderId
          ? { ...o, status: "Cancelled" }
          : o
      )
    );
  } catch (err) {
    alert(err?.message || "Only processing orders can be cancelled");
  }
};

const handleRefundOrder = async (order) => {
  if (!window.confirm("Request a return for delivered items?")) return;
  if (!order?.items?.length) {
    alert("No items found to return.");
    return;
  }

  const targets = order.items.filter((item) => item.orderItemId);
  if (!targets.length) {
    alert("Return request could not be created for this order.");
    return;
  }

  try {
    const results = await Promise.allSettled(
      targets.map((item) =>
        requestReturn({
          userId: user?.id,
          orderItemId: item.orderItemId,
          reason: null,
        })
      )
    );
    const hasSuccess = results.some((r) => r.status === "fulfilled");
    if (!hasSuccess) {
      const firstError = results.find((r) => r.status === "rejected");
      throw firstError?.reason || new Error("Return request failed.");
    }
    setReturnRequests((prev) => {
      const additions = targets.map((item) => ({
        order_item_id: item.orderItemId,
        status: "requested",
      }));
      return [...additions, ...prev];
    });
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, status: "Refund Waiting" } : o))
    );
  } catch (err) {
    alert(err?.message || "Return request failed.");
  }
};






  const loadOrders = useCallback(
    (signal) => {
      if (!user) {
        setOrders([]);
        setReturnRequests([]);
        return;
      }
      fetchUserOrders(user.id, signal)
        .then((data) => setOrders(Array.isArray(data) ? data : []))
        .catch((err) => {
          if (err?.name === "AbortError") return;
          console.error("Order history load failed", err);
          setOrders([]);
        });

      fetchUserReturnRequests(user.id)
        .then((data) => setReturnRequests(Array.isArray(data) ? data : []))
        .catch((err) => {
          console.error("Return requests load failed", err);
          setReturnRequests([]);
        });
    },
    [user]
  );

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setReturnRequests([]);
      return;
    }
    const controller = new AbortController();
    let isActive = true;
    loadOrders(controller.signal);

    fetchUserProfile(user.id)
      .then((data) => {
        if (!isActive) return;
        const nextProfile = {
          name: data?.name || user?.name || "",
          email: data?.email || user?.email || "",
          address: data?.address || "",
          taxId: data?.taxId || "",
        };
        const merged = { ...(profile || {}), ...nextProfile };
        setProfile(merged);
        if (storageKey) saveProfile(storageKey, merged);
        if (!editing) setDraft(merged);
        if (
          merged.name !== user?.name ||
          merged.address !== user?.address ||
          merged.taxId !== user?.taxId
        ) {
          updateUser({ name: merged.name, address: merged.address, taxId: merged.taxId });
        }
      })
      .catch((err) => {
        if (!isActive) return;
        if (err?.name === "AbortError") return;
        console.error("Profile fetch failed", err);
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [user, loadOrders]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleOrdersCreated = (event) => {
      const incomingId = event?.detail?.userId;
      if (incomingId && Number(incomingId) !== Number(user?.id)) return;
      loadOrders();
    };
    window.addEventListener("orders:created", handleOrdersCreated);
    return () => window.removeEventListener("orders:created", handleOrdersCreated);
  }, [loadOrders, user?.id]);

  const completedOrders = useMemo(
    () => orders.filter((o) => o.status === "Delivered").length,
    [orders]
  );

  const recentOrders = useMemo(() => {
    const withDates = orders.map((order) => {
      const ts = order?.date ? Date.parse(order.date) : NaN;
      return { order, ts: Number.isFinite(ts) ? ts : 0 };
    });
    withDates.sort((a, b) => b.ts - a.ts);
    return withDates.map((item) => item.order).slice(0, 3);
  }, [orders]);

  const returnRequestMap = useMemo(() => {
    const map = new Map();
    returnRequests.forEach((req) => {
      if (req.order_item_id) map.set(req.order_item_id, req);
    });
    return map;
  }, [returnRequests]);

  if (!user) {
    return (
      <main
        style={{
          padding: "40px 24px",
          backgroundColor: isDark ? "#0b0f14" : "#f5f7fb",
          minHeight: "75vh",
          fontFamily: "Arial, sans-serif",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h1 style={{ margin: 0, color: "#0f172a" }}>Profile</h1>
        <p style={{ color: isDark ? "#a3b3c6" : "#475569" }}>Please sign in to view your profile.</p>
        <Link
          to="/login"
          style={{
            backgroundColor: isDark ? "#7dd3fc" : "#0058a3",
            color: "white",
            padding: "12px 20px",
            borderRadius: 999,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Go to login
        </Link>
      </main>
    );
  }

  const handleSave = async () => {
    if (!String(draft?.name || "").trim()) {
      addToast("Please enter your name.", "error");
      return;
    }
    const next = {
      ...profile,
      ...draft,
    };
    if (user?.id) {
      try {
        const nextAddress = typeof next.address === "string" ? next.address : "";
        const nextTaxId = typeof next.taxId === "string" ? next.taxId.trim() : "";
        await updateUserProfile({ userId: user.id, name: next.name, address: nextAddress, taxId: nextTaxId });
        updateUser({ name: next.name, address: nextAddress, taxId: nextTaxId });
      } catch (error) {
        console.error("Profile update failed", error);
        addToast("Cannot save profile.", "error");
        return;
      }
    }
    setProfile(next);
    if (storageKey) saveProfile(storageKey, next);
    setEditing(false);
    addToast("Profile saved.", "info");
  };

  const hasUnsavedChanges = useMemo(() => {
    if (!editing) return false;
    const draftName = String(draft?.name || "").trim();
    const profileName = String(profile?.name || "").trim();
    const draftAddress = String(draft?.address || "");
    const profileAddress = String(profile?.address || "");
    const draftTaxId = String(draft?.taxId || "");
    const profileTaxId = String(profile?.taxId || "");
    return draftName !== profileName || draftAddress !== profileAddress || draftTaxId !== profileTaxId;
  }, [draft, editing, profile]);

  const handleCloseEditing = () => {
    if (hasUnsavedChanges && !window.confirm("Close without saving changes?")) return;
    setEditing(false);
  };

  return (
    <main
      style={{
        padding: "40px 24px",
        backgroundColor: isDark ? "#0b0f14" : "#f5f7fb",
        minHeight: "75vh",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div>
          <p style={{ margin: 0, color: isDark ? "#7dd3fc" : "#4b5563", letterSpacing: 1 }}>WELCOME</p>
          <h1 style={{ margin: "4px 0 0", color: isDark ? "#7dd3fc" : "#0058a3" }}>{profile?.name}</h1>
          <p style={{ margin: "6px 0 0", color: isDark ? "#a3b3c6" : "#475569" }}>
            User ID: {user?.id ?? "Not set"} - Tax ID: {profile?.taxId || "Not set"}
          </p>
          <span style={{ color: isDark ? "#94a3b8" : "#6b7280" }}>
            {profile?.email} - SUHome member since {profile?.memberSince ?? "2025"}
          </span>
          <p style={{ margin: "8px 0 0", color: isDark ? "#a3b3c6" : "#475569" }}>
            Address: {profile?.address || "Not set"}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              setDraft(profile || {});
              setEditing(true);
            }}
            style={{
              backgroundColor: isDark ? "#0b1220" : "#ffffff",
                color: isDark ? "#cbd5e1" : "#0058a3",
              padding: "10px 16px",
              borderRadius: 999,
              border: isDark ? "1px solid #1f2937" : "1px solid #cbd5e1",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Edit profile
          </button>
          <Link
            to="/orders"
            style={{
              backgroundColor: isDark ? "#7dd3fc" : "#0058a3",
              color: "white",
              padding: "12px 20px",
              borderRadius: 999,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            View my orders
          </Link>
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
          {[
            { label: "Active membership", value: profile?.memberSince ?? "2025" },
            { label: "Completed orders", value: completedOrders },
            { label: "Favorite address", value: (profile?.address || "").split(",")[0] || "Not set" },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                backgroundColor: isDark ? "#0f172a" : "#ffffff",
                borderRadius: 16,
                padding: 24,
                boxShadow: isDark
                  ? "0 12px 25px rgba(0,0,0,0.6)"
                  : "0 12px 25px rgba(0,0,0,0.06)",
              }}
            >
              <p style={{ margin: 0, color: isDark ? "#94a3b8" : "#6b7280", fontSize: "0.85rem" }}>{card.label}</p>
              <h3 style={{ margin: "12px 0 0", color: isDark ? "#e2e8f0" : "#111827" }}>{card.value}</h3>
            </div>
        ))}
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)",
          gap: 24,
        }}
      >
          <section
            style={{
              backgroundColor: isDark ? "#0f172a" : "#ffffff",
              borderRadius: 18,
              padding: 24,
              boxShadow: isDark
                ? "0 18px 35px rgba(0,0,0,0.6)"
                : "0 18px 35px rgba(0,0,0,0.05)",
            }}
          >
            <h2 style={{ marginTop: 0, color: isDark ? "#7dd3fc" : "#0058a3" }}>
              Recent orders
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {recentOrders.map((order) => {
                const formattedId = order.formattedId || formatOrderId(order.id);
                const statusStyle = {
                  Cancelled: {
                    bg: "rgba(248,113,113,0.18)",
                    color: "#b91c1c",
                    border: "#f87171",
                  },
                  Delivered: {
                    bg: "rgba(34,197,94,0.15)",
                    color: "#15803d",
                    border: "#22c55e",
                  },
                  "Refund in progress": {
                    bg: "rgba(249,115,22,0.18)",
                    color: "#c2410c",
                    border: "#fdba74",
                  },
                  Refund: {
                    bg: "rgba(15,118,110,0.15)",
                    color: "#0f766e",
                    border: "#5eead4",
                  },
                  "Refund accepted": {
                    bg: "#e0f2fe",
                    color: "#1d4ed8",
                    border: "#93c5fd",
                  },
                  "Refund Rejected": {
                    bg: "rgba(148,163,184,0.18)",
                    color: "#64748b",
                    border: "#cbd5e1",
                  },
                  "In-transit": {
                    bg: "rgba(59,130,246,0.15)",
                    color: "#1d4ed8",
                    border: "#60a5fa",
                  },
                  Processing: {
                    bg: "rgba(234,179,8,0.2)",
                    color: "#b45309",
                    border: "#eab308",
                  },
                };
                const displayStatus = getDisplayStatus(order.status);
                const orderReturnStatus =
                  order?.items?.map((item) => returnRequestMap.get(item.orderItemId)?.status).find(Boolean) || "";
                const hasActiveReturn = Boolean(orderReturnStatus && orderReturnStatus !== "rejected");
                const pill = statusStyle[displayStatus] || statusStyle.Processing;
                const rawOrderId = order.order_id ?? order.id ?? formattedId;
                const numericOrderMatch = String(rawOrderId).match(/\d+/);
                const cleanOrderId = numericOrderMatch ? numericOrderMatch[0] : rawOrderId;
                const invoiceUrl = `${API_BASE_URL}/api/orders/${encodeURIComponent(cleanOrderId)}/invoice`;
                const canDownload = canDownloadInvoice(order);
                const invoiceFileName = `invoice_${cleanOrderId}.pdf`;


                return (
                  <article
                    key={formattedId}
                    style={{
                      border: isDark ? "1px solid #1f2937" : "1px solid #e5e7eb",
                      borderRadius: 12,
                      padding: 16,
                      backgroundColor: isDark ? "#0b1220" : "transparent",
                    }}
                  >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <div>
                      <p
                        style={{
                          margin: 0,
                          color: isDark ? "#94a3b8" : "#9ca3af",
                          letterSpacing: 1,
                          fontSize: "0.75rem",
                        }}
                      >
                        ORDER
                      </p>
                      <p style={{ margin: "4px 0 0", fontWeight: 800, color: isDark ? "#e2e8f0" : "#0f172a" }}>
                        {formattedId}
                      </p>
                      <p style={{ margin: "4px 0 0", color: isDark ? "#94a3b8" : "#6b7280", fontSize: "0.9rem" }}>
                        {order.date}
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span
                        style={{
                          backgroundColor: pill.bg,
                          color: pill.color,
                          border: `1px solid ${pill.border}`,
                          padding: "6px 12px",
                          borderRadius: 999,
                          fontWeight: 700,
                        }}
                      >
                        {displayStatus}
                      </span>
                      {displayStatus === "Processing" && (() => {
                        const cancelState = getCancelState(order);
                        return (
                          <button
                            type="button"
                            onClick={() => handleCancelOrder(order.id)}
                            disabled={!cancelState.allowed}
                            title={cancelState.reason}
                            style={{
                              backgroundColor: cancelState.allowed ? "#fee2e2" : "#f1f5f9",
                              color: cancelState.allowed ? "#b91c1c" : "#94a3b8",
                              border: `1px solid ${cancelState.allowed ? "#fecaca" : "#e2e8f0"}`,
                              padding: "6px 12px",
                              borderRadius: 999,
                              cursor: cancelState.allowed ? "pointer" : "not-allowed",
                              fontWeight: 700,
                              opacity: cancelState.allowed ? 1 : 0.65,
                            }}
                          >
                            {cancelState.label}
                          </button>
                        );
                      })()}
                      {["Delivered", "Refund Waiting", "Refunded", "Refund Rejected"].includes(order?.status) &&
                        order?.status !== "Refunded" && (() => {
                        const refundState = getRefundState(order);
                        const label = hasActiveReturn ? formatReturnStatus(orderReturnStatus) : refundState.label;
                        const disabled = hasActiveReturn ? true : !refundState.allowed;
                        const refundExpired = order?.status === "Delivered" && !isRefundWindowOpen(order);
                        return (
                          <button
                            onClick={() => handleRefundOrder(order)}
                            style={{
                              backgroundColor: !disabled
                                ? "#e0f2fe"
                                : refundExpired
                                  ? "#f8fafc"
                                  : "#f1f5f9",
                              color: !disabled ? "#0369a1" : refundExpired ? "#cbd5e1" : "#94a3b8",
                              border: `1px solid ${!disabled ? "#bae6fd" : "#e2e8f0"}`,
                              padding: "6px 12px",
                              borderRadius: 999,
                              cursor: !disabled ? "pointer" : "not-allowed",
                              fontWeight: 700,
                              opacity: !disabled ? 1 : refundExpired ? 0.45 : 0.65,
                            }}
                            disabled={disabled}
                          >
                            {label}
                          </button>
                        );
                      })()}
                      {canDownload && (
                        <a
                          href={invoiceUrl}
                          download={invoiceFileName}
                          style={{
                            border: `1px solid ${isDark ? "#38bdf8" : "#0058a3"}`,
                            color: isDark ? "#7dd3fc" : "#0058a3",
                            background: isDark ? "#0b1220" : "#f8fafc",
                            padding: "6px 12px",
                            borderRadius: 999,
                            textDecoration: "none",
                            fontWeight: 700,
                          }}
                        >
                          Download PDF
                        </a>
                      )}
                      <span style={{ fontWeight: 800, color: isDark ? "#e2e8f0" : "#0f172a" }}>
                        {formatPrice(order.total)}
                      </span>
                    </div>
                  </div>

                </article>
              );
            })}
          </div>
        </section>

        <aside
          style={{
            backgroundColor: isDark ? "#0f172a" : "#ffffff",
            borderRadius: 18,
            padding: 24,
            boxShadow: isDark
              ? "0 18px 35px rgba(0,0,0,0.6)"
              : "0 18px 35px rgba(0,0,0,0.05)",
          }}
        >
          <h2 style={{ marginTop: 0, color: isDark ? "#7dd3fc" : "#0058a3" }}>
            Preferences
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <li
              style={{
                display: "flex",
                justifyContent: "space-between",
                border: isDark ? "1px solid #1f2937" : "1px solid #e5e7eb",
                borderRadius: 12,
                padding: "10px 14px",
                alignItems: "center",
                gap: 10,
                backgroundColor: isDark ? "#0b0f14" : "#ffffff",
              }}
            >
              <span style={{ color: isDark ? "#e2e8f0" : "#0f172a" }}>
                Email notifications
              </span>
              <button
                type="button"
                onClick={handleToggleEmailNotifications}
                aria-pressed={emailNotifications}
                style={{
                  position: "relative",
                  width: 46,
                  height: 26,
                  borderRadius: 999,
                  border: isDark ? "1px solid #1f2937" : "1px solid #cbd5e1",
                  background: emailNotifications ? "#38bdf8" : (isDark ? "#0f172a" : "#e2e8f0"),
                  padding: 2,
                  cursor: "pointer",
                  transition: "background 0.2s ease, border-color 0.2s ease",
                }}
              >
                <span
                  style={{
                    display: "block",
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: isDark ? "#0b0f14" : "#ffffff",
                    transform: emailNotifications ? "translateX(20px)" : "translateX(0)",
                    transition: "transform 0.2s ease",
                  }}
                />
              </button>
            </li>
            {canUseDarkMode ? (
              <li
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  border: isDark ? "1px solid #1f2937" : "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: "10px 14px",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: isDark ? "#0b0f14" : "#ffffff",
                }}
              >
                <span style={{ color: isDark ? "#e2e8f0" : "#0f172a" }}>
                  Dark mode
                </span>
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-pressed={isDark}
                  style={{
                    position: "relative",
                    width: 46,
                    height: 26,
                    borderRadius: 999,
                    border: isDark ? "1px solid #1f2937" : "1px solid #cbd5e1",
                    background: isDark ? "#38bdf8" : "#e2e8f0",
                    padding: 2,
                    cursor: "pointer",
                    transition: "background 0.2s ease, border-color 0.2s ease",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: isDark ? "#0b0f14" : "#ffffff",
                      transform: isDark ? "translateX(20px)" : "translateX(0)",
                      transition: "transform 0.2s ease",
                    }}
                  />
                </button>
              </li>
            ) : (
              <li
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  border: "1px dashed #cbd5e1",
                  borderRadius: 12,
                  padding: "10px 14px",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: isDark ? "#0b0f14" : "#ffffff",
                }}
              >
                <span style={{ color: isDark ? "#e2e8f0" : "#0f172a" }}>
                  Dark mode
                </span>
                <span style={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: "0.9rem" }}>
                  Dark mode is only provided for users.
                </span>
              </li>
            )}
          </ul>
        </aside>
      </div>

      <Modal
        open={editing}
        onClose={handleCloseEditing}
        isDark={isDark}
        actions={
          <>
            <button
              type="button"
              onClick={handleCloseEditing}
              style={{
                background: isDark ? "#0b0f14" : "none",
                border: isDark ? "1px solid #1f2937" : "1px solid #cbd5e1",
                color: isDark ? "#e2e8f0" : "#0f172a",
                borderRadius: 10,
                padding: "8px 12px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{
                border: "none",
                background: isDark ? "#38bdf8" : "#0058a3",
                color: isDark ? "#0b0f14" : "white",
                borderRadius: 10,
                padding: "10px 14px",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              Save
            </button>
          </>
        }
      >
        <h3 style={{ marginTop: 0, color: isDark ? "#7dd3fc" : "#0f172a" }}>Edit profile</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ fontSize: "0.9rem", fontWeight: 700, color: isDark ? "#e2e8f0" : "#1f2937" }}>
            Name
            <input
              type="text"
              value={draft.name || ""}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              style={{
                width: "100%",
                padding: 10,
                marginTop: 6,
                borderRadius: 10,
                  background: isDark ? "#0b0f14" : "#ffffff",
                  color: isDark ? "#e2e8f0" : "#0f172a",
                border: isDark ? "1px solid #1f2937" : "1px solid #e2e8f0",
              }}
            />
          </label>
          <label style={{ fontSize: "0.9rem", fontWeight: 700, color: isDark ? "#e2e8f0" : "#1f2937" }}>
            Address
            <textarea
              value={draft.address || ""}
              onChange={(e) => setDraft((prev) => ({ ...prev, address: e.target.value }))}
              style={{
                width: "100%",
                padding: 10,
                marginTop: 6,
                borderRadius: 10,
                  background: isDark ? "#0b0f14" : "#ffffff",
                  color: isDark ? "#e2e8f0" : "#0f172a",
                border: isDark ? "1px solid #1f2937" : "1px solid #e2e8f0",
                minHeight: 80,
              }}
            />
          </label>
          <label style={{ fontSize: "0.9rem", fontWeight: 700, color: isDark ? "#e2e8f0" : "#1f2937" }}>
            Tax ID
            <input
              type="text"
              value={draft.taxId || ""}
              onChange={(e) => setDraft((prev) => ({ ...prev, taxId: e.target.value }))}
              style={{
                width: "100%",
                padding: 10,
                marginTop: 6,
                borderRadius: 10,
                  background: isDark ? "#0b0f14" : "#ffffff",
                  color: isDark ? "#e2e8f0" : "#0f172a",
                border: isDark ? "1px solid #1f2937" : "1px solid #e2e8f0",
              }}
            />
          </label>
        </div>
      </Modal>
    </main>
  );
}

export default Profile;

function loadProfile(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveProfile(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("Profile save failed", error);
  }
}

function Modal({ open, onClose, children, isDark, actions }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "grid",
        placeItems: "center",
        zIndex: 2000,
        padding: 16,
      }}>

      <div
        style={{
          background: isDark ? "#0f172a" : "white",
          borderRadius: 16,
          padding: 20,
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 18px 45px rgba(0,0,0,0.18)",
          border: isDark ? "1px solid #1f2937" : "none",
        }}
      >
        {children}
        {actions ? (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
            {actions}
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: isDark ? "#0b0f14" : "none",
                border: isDark ? "1px solid #1f2937" : "1px solid #cbd5e1",
                color: isDark ? "#e2e8f0" : "#0f172a",
                borderRadius: 10,
                padding: "8px 12px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

