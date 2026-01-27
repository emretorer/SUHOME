import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addComment as addCommentApi,
  fetchUserComments,
} from "../services/commentService";
import {
  cancelOrder,
  formatOrderId,
  fetchUserOrders,
  refundOrder,
  requestReturn,
  fetchUserReturnRequests,
} from "../services/orderService";
import { formatPrice } from "../utils/formatPrice";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const timelineSteps = [
  "Processing",
  "In-transit",
  "Delivered",
  "Cancelled",
  "Refund in progress",
  "Refund accepted",
  "Refund Rejected",
];
const filterOptions = [
  { value: "All", label: "All" },
  { value: "Processing", label: "Processing" },
  { value: "In-transit", label: "In-transit" },
  { value: "Delivered", label: "Delivered" },
  { value: "Refund Waiting", label: "Refund in progress" },
  { value: "Refunded", label: "Refund accepted" },
  { value: "Refund Rejected", label: "Refund Rejected" },
  { value: "Cancelled", label: "Cancelled" },
];

const statusPills = {
  Processing: { bg: "rgba(234,179,8,0.2)", color: "#b45309", border: "#eab308" },
  "In-transit": { bg: "rgba(59,130,246,0.15)", color: "#1d4ed8", border: "#60a5fa" },
  Delivered: { bg: "rgba(34,197,94,0.15)", color: "#15803d", border: "#22c55e" },
  Cancelled: { bg: "rgba(248,113,113,0.18)", color: "#b91c1c", border: "#f87171" },
  "Refund in progress": { bg: "rgba(249,115,22,0.18)", color: "#c2410c", border: "#fdba74" },
  "Refund accepted": { bg: "rgba(15,118,110,0.15)", color: "#0f766e", border: "#5eead4" },
  "Refund Rejected": { bg: "rgba(148,163,184,0.18)", color: "#64748b", border: "#cbd5e1" },
};

const REFUND_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getDeliveredDate(order) {
  if (!order) return null;
  const candidates = [
    order.deliveredAt,
    order.delivered_at,
    order.deliveryUpdatedAt,
    order.delivery_updated_at,
    order.statusUpdatedAt,
    order.status_updated_at,
  ].filter(Boolean);

  if (order.status === "Delivered") {
    candidates.push(
      order.date,
      order.orderDate,
      order.order_date,
      order.createdAt,
      order.created_at
    );
  }

  for (const candidate of candidates.filter(Boolean)) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function isRefundWindowOpen(order) {
  const deliveredDate = getDeliveredDate(order);
  if (!deliveredDate) return true;
  const diffDays = (Date.now() - deliveredDate.getTime()) / MS_PER_DAY;
  return diffDays <= REFUND_WINDOW_DAYS;
}

function canDownloadInvoice(order) {
  return Boolean(order);
}

function getRefundState(order) {
  if (order.status === "Refund Waiting") {
    return { allowed: false, label: "Refund in progress", reason: "Waiting for sales manager approval" };
  }
  if (order.status === "Refunded") {
    return { allowed: false, label: "Refund accepted", reason: "Order already refunded" };
  }
  if (order.status === "Refund Rejected") {
    return { allowed: false, label: "Refund Rejected", reason: "Refund request was rejected" };
  }
  if (order.status === "Cancelled") {
    return { allowed: false, label: "Cannot be refunded", reason: "Cancelled orders cannot be refunded" };
  }
  if (order.status === "Processing") {
    return { allowed: false, label: "Cannot be refunded", reason: "Processing orders cannot be refunded" };
  }
  if (order.status !== "Delivered") {
    return { allowed: false, label: "Cannot be refunded", reason: "Only delivered orders can be refunded" };
  }
  if (!isRefundWindowOpen(order)) {
    return {
      allowed: false,
      label: "Refund expired",
      reason: "Refunds are only available within 30 days of delivery.",
    };
  }
  return { allowed: true, label: "Refund", reason: "Request refund" };
}

function getCancelState(order) {
  if (order.status === "Processing") {
    return { allowed: true, label: "Cancel", reason: "Cancel this order" };
  }
  if (order.status === "Cancelled") {
    return { allowed: false, label: "Cancelled", reason: "Order already cancelled" };
  }
  return { allowed: false, label: "Cancel", reason: "Only processing orders can be cancelled" };
}

function getDisplayStatus(status) {
  if (status === "Cancelled") return "Cancelled";
  if (status === "Refund Waiting") return "Refund in progress";
  if (status === "Refunded") return "Refund accepted";
  if (status === "Refund Rejected") return "Refund Rejected";
  return status;
}

function formatReturnStatus(value) {
  const normalized = String(value || "").toLowerCase();
  if (["requested", "accepted", "received"].includes(normalized)) return "Refund in progress";
  if (normalized === "refunded") return "Refund accepted";
  if (normalized === "rejected") return "Refund Rejected";
  return value || "";
}

function OrderHistory() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
  const [filter, setFilter] = useState("All");
  const [orders, setOrders] = useState([]);
  const [reviews, setReviews] = useState({});
  const [openOrderId, setOpenOrderId] = useState(null);
  const [returnRequests, setReturnRequests] = useState([]);
  const palette = {
    pageBg: isDark ? "#0b0f14" : "#f5f7fb",
    panelBg: isDark ? "#0f172a" : "#ffffff",
    panelBorder: isDark ? "#1f2937" : "#e2e8f0",
    panelShadow: isDark ? "0 18px 42px rgba(2,6,23,0.65)" : "0 18px 42px rgba(15,23,42,0.07)",
    title: isDark ? "#7dd3fc" : "#0f172a",
    text: isDark ? "#e2e8f0" : "#0f172a",
    textMuted: isDark ? "#a3b3c6" : "#475569",
    textFaint: isDark ? "#94a3b8" : "#94a3b8",
    link: isDark ? "#7dd3fc" : "#0058a3",
    inputBg: isDark ? "#0b1220" : "#ffffff",
    softBg: isDark ? "#0b1220" : "#f8fafc",
  };

  useEffect(() => {
    const controller = new AbortController();
    if (user?.id && Number.isFinite(Number(user.id))) {
      fetchUserOrders(user.id, controller.signal)
        .then((data) => setOrders(data))
        .catch((err) => {
          console.error("Order history load failed", err);
          setOrders([]);
        });
      fetchUserReturnRequests(user.id)
        .then((data) => setReturnRequests(Array.isArray(data) ? data : []))
        .catch((err) => {
          console.error("Return requests load failed", err);
          setReturnRequests([]);
        });
      fetchUserComments(user.id, controller.signal)
        .then((data) => {
          const map = {};
          data.forEach((row) => {
            map[row.product_id] = map[row.product_id] || [];
            map[row.product_id].push(row);
          });
          setReviews(map);
        })
        .catch(() => setReviews({}));
    } else {
      setOrders([]);
      setReviews({});
      setReturnRequests([]);
    }
    return () => controller.abort();
  }, [user]);

  const returnRequestMap = useMemo(() => {
    const map = new Map();
    returnRequests.forEach((req) => {
      if (req.order_item_id) map.set(req.order_item_id, req);
    });
    return map;
  }, [returnRequests]);

  const filteredOrders = useMemo(() => {
    if (filter === "All") return orders;
    if (filter === "Refund") {
      return orders.filter((order) => ["Refund Waiting", "Refunded", "Refund Rejected"].includes(order.status));
    }
    if (filter === "Cancel") {
      return orders.filter((order) => order.status === "Cancelled");
    }
    return orders.filter((order) => order.status === filter);
  }, [filter, orders]);

  const stats = useMemo(
    () => ({
      totalSpent: orders.reduce((sum, order) => sum + order.total, 0),
      delivered: orders.filter((order) => order.status === "Delivered").length,
      active: orders.filter((order) => !["Delivered", "Cancelled", "Refunded", "Refund Waiting", "Refund Rejected"].includes(order.status)).length,
    }),
    [orders]
  );

  const handleReviewSubmit = async (productId, rating, comment, canReview) => {
    if (!canReview) {
      alert("You can only review delivered items.");
      return;
    }
    if (!user?.id) {
      alert("Please sign in.");
      return;
    }

    try {
      const response = await addCommentApi({
        userId: user.id,
        productId,
        rating,
        text: comment,
      });

      // Refresh user comments for this product
      setReviews((prev) => {
        const entry = prev[productId] || [];
        const updated = [
          ...entry,
          {
            product_id: productId,
            rating,
            comment_text: comment,
            status: response?.status || "pending",
            created_at: new Date().toISOString(),
          },
        ];
        return { ...prev, [productId]: updated };
      });

      if (response?.status === "approved") {
        alert("Your rating was applied immediately.");
      } else {
        alert("Your review was sent for approval (status: in review).");
      }
    } catch (err) {
      alert(err.message || "Review could not be submitted.");
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm("Are you sure you want to cancel this order?")) return;

    try {
      await cancelOrder(orderId);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: "Cancelled" } : o))
      );
    } catch (err) {
      alert(err?.message || "Only processing orders can be cancelled");
    }
  };

  const handleRefundOrder = async (orderId) => {
    if (!window.confirm("Request a refund for this delivered order?")) return;

    try {
    await refundOrder(orderId);
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: "Refund Waiting" } : o))
    );
    } catch (err) {
      alert(err?.message || "Refund failed.");
    }
  };

  const handleReturnRequest = async (orderId, orderItemId) => {
    if (!orderItemId || !user?.id) return;
    const reason = window.prompt("Return reason (optional):", "");
    if (reason === null) return;
    try {
      const data = await requestReturn({
        userId: user.id,
        orderItemId,
        reason: reason || null,
      });
      setReturnRequests((prev) => [
        {
          return_id: data.return_id,
          order_item_id: orderItemId,
          status: "requested",
        },
        ...prev,
      ]);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: "Refund Waiting" } : o))
      );
    } catch (err) {
      alert(err?.message || "Return request failed.");
    }
  };

  const handleDownloadInvoice = async (order) => {
    const rawOrderId = order?.order_id ?? order?.id ?? order?.formattedId;
    const numericMatch = String(rawOrderId ?? "").match(/\\d+/);
    const cleanOrderId = numericMatch ? numericMatch[0] : rawOrderId;
    if (!cleanOrderId) {
      alert("Invoice could not be downloaded.");
      return;
    }

    try {
      const invoiceUrl = `${API_BASE_URL}/api/orders/${encodeURIComponent(cleanOrderId)}/invoice`;
      const res = await fetch(invoiceUrl);
      if (!res.ok) {
        throw new Error("Invoice download failed");
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `invoice_${cleanOrderId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("Invoice download failed", err);
      alert("Invoice could not be downloaded.");
    }
  };

  return (
    <main
      style={{
        backgroundColor: palette.pageBg,
        minHeight: "75vh",
        padding: "48px 16px 72px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginBottom: 32,
          }}
        >
          <div>
            <p style={{ margin: 0, letterSpacing: 1, color: palette.textFaint }}>ORDER HISTORY</p>
            <h1 style={{ margin: "6px 0 8px", color: palette.title }}>Deliveries and past purchases</h1>
            <p style={{ margin: 0, color: palette.textMuted }}>
              Track shipments, see stock impact per order, and leave post-delivery reviews.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            {[
              { label: "Total spent", value: formatPrice(stats.totalSpent) },
              { label: "Delivered", value: stats.delivered },
              { label: "Active shipments", value: stats.active },
            ].map((card) => (
              <div
                key={card.label}
                style={{
                  backgroundColor: palette.panelBg,
                  borderRadius: 18,
                  padding: 18,
                  border: `1px solid ${palette.panelBorder}`,
                  boxShadow: palette.panelShadow,
                }}
              >
                <p style={{ margin: 0, color: palette.textFaint, fontSize: "0.85rem" }}>{card.label}</p>
                <h3 style={{ margin: "10px 0 0", color: palette.text }}>{card.value}</h3>
              </div>
            ))}
          </div>
        </header>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 24,
          }}
        >
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              style={{
                border: "1px solid",
                borderColor: option.value === filter ? (isDark ? "#38bdf8" : "#0058a3") : (isDark ? "#1f2937" : "#cbd5f5"),
                backgroundColor: option.value === filter ? (isDark ? "#0b3a6b" : "#0058a3") : (isDark ? "#0f172a" : "#ffffff"),
                color: option.value === filter ? "#ffffff" : palette.text,
                padding: "10px 18px",
                borderRadius: 999,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {filteredOrders.length === 0 && (
            <div
              style={{
                backgroundColor: palette.panelBg,
                borderRadius: 20,
                padding: 32,
                textAlign: "center",
                border: `1px dashed ${isDark ? "#334155" : "#cbd5f5"}`,
              }}
            >
              <h3 style={{ margin: 0, color: palette.text }}>No orders in this filter</h3>
              <p style={{ color: palette.textMuted }}>
                Try another status or{" "}
                <Link to="/products" style={{ color: palette.link, fontWeight: 600 }}>
                  browse products
                </Link>
                .
              </p>
            </div>
          )}

          {filteredOrders.map((order) => {
            const displayStatus = getDisplayStatus(order.status);
            const pill = statusPills[displayStatus] || statusPills.Processing;
            const formattedId = order.formattedId || formatOrderId(order.id);
            const rawOrderId = order.order_id ?? order.id ?? formattedId;
            const numericOrderMatch = String(rawOrderId).match(/\d+/);
            const cleanOrderId = numericOrderMatch ? numericOrderMatch[0] : rawOrderId;
            const canDownload = canDownloadInvoice(order);

            return (
              <article
                key={formattedId}
                style={{
                  backgroundColor: palette.panelBg,
                  borderRadius: 24,
                  padding: 24,
                  border: `1px solid ${palette.panelBorder}`,
                  boxShadow: palette.panelShadow,
                  display: "flex",
                  flexDirection: "column",
                  gap: 18,
                }}
              >
                <header
                  onClick={() =>
                    setOpenOrderId(openOrderId === formattedId ? null : formattedId)
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    cursor: "pointer",
                  }}
                >
                  <div>
                    <p style={{ margin: 0, color: palette.textFaint, letterSpacing: 1 }}>ORDER</p>
                    <h3 style={{ margin: "4px 0", color: palette.text }}>{formattedId}</h3>
                    <p style={{ margin: 0, color: palette.textMuted }}>{order.date}</p>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        backgroundColor: pill.bg,
                        color: pill.color,
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
                    {displayStatus === "Delivered" && (() => {
                      const refundState = getRefundState(order);
                      const refundExpired = order.status === "Delivered" && !isRefundWindowOpen(order);
                      return (
                        <button
                          type="button"
                          onClick={() => handleRefundOrder(order.id)}
                          disabled={!refundState.allowed}
                          title={refundState.reason}
                          style={{
                            backgroundColor: refundState.allowed
                              ? "#e0f2fe"
                              : refundExpired
                                ? "#f8fafc"
                                : "#f1f5f9",
                            color: refundState.allowed ? "#0369a1" : refundExpired ? "#cbd5e1" : "#94a3b8",
                            border: `1px solid ${refundState.allowed ? "#bae6fd" : "#e2e8f0"}`,
                            padding: "6px 12px",
                            borderRadius: 999,
                            cursor: refundState.allowed ? "pointer" : "not-allowed",
                            fontWeight: 700,
                            opacity: refundState.allowed ? 1 : refundExpired ? 0.45 : 0.65,
                          }}
                        >
                          {refundState.label}
                        </button>
                      );
                    })()}
                    <p style={{ margin: 0, color: palette.text, fontWeight: 800 }}>{formatPrice(order.total)}</p>
                  </div>
                </header>

                {openOrderId === formattedId && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                      <Info label="Shipping" value={order.shippingCompany || "SUExpress"} />
                      <Info label="Address" value={order.address || "Not provided"} />
                      <Info label="Estimate" value={order.estimate || "TBD"} />
                      {order.deliveredAt && <Info label="Delivered" value={order.deliveredAt} />}
                    </div>

                    {(() => {
                      const refundSteps = new Set([
                        "Refund in progress",
                        "Refund accepted",
                        "Refund Rejected",
                      ]);
                      const showRefundSteps = ["Refund Waiting", "Refunded", "Refund Rejected"].includes(order.status);
                      const steps = showRefundSteps
                        ? timelineSteps
                        : timelineSteps.filter((step) => !refundSteps.has(step));

                      return (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
                            gap: 12,
                          }}
                        >
                          {steps.map((step) => {
                            const isActive = step === displayStatus;
                            const stepPill = statusPills[step];
                            return (
                              <div
                                key={step}
                                style={{
                                  padding: 12,
                                  borderRadius: 14,
                                  border: `2px solid ${isActive ? stepPill.border : palette.panelBorder}`,
                                  backgroundColor: isActive ? stepPill.bg : palette.softBg,
                                  color: isActive ? stepPill.color : palette.textFaint,
                                  fontWeight: 800,
                                  textAlign: "center",
                                  boxShadow: isActive ? "0 6px 16px rgba(34,197,94,0.18)" : "none",
                                  transition: "all 0.2s ease",
                                }}
                              >
                                {step}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <p style={{ margin: 0, color: palette.text, fontWeight: 700 }}>Items</p>
                      <div style={{ display: "grid", gap: 10 }}>
                        {order.items.map((item) => {
                          const productId = item.productId ?? item.id;
                          const returnInfo = item.orderItemId ? returnRequestMap.get(item.orderItemId) : null;
                          const returnStatus = returnInfo?.status || "";
                          const canRequestReturn =
                            order.status === "Delivered" && isRefundWindowOpen(order) && item.orderItemId;
                          const userReviews = reviews[productId] ?? [];
                          const latestReview = userReviews[userReviews.length - 1];
                          const approvedReview = [...userReviews]
                            .reverse()
                            .find((r) => (r.status ?? "approved") === "approved" || r.approved);

                          return (
                            <div
                              key={item.id}
                              style={{
                                border: `1px solid ${palette.panelBorder}`,
                                borderRadius: 12,
                                padding: 12,
                                display: "grid",
                                gridTemplateColumns: "auto 1fr auto",
                                alignItems: "center",
                                gap: 12,
                                backgroundColor: palette.softBg,
                              }}
                            >
                              <div
                                style={{
                                  width: 64,
                                  height: 64,
                                  borderRadius: 10,
                                  overflow: "hidden",
                                  background: palette.panelBorder,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {item.image ? (
                                  <img
                                    src={item.image}
                                    alt={item.name}
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  />
                                ) : (
                                  <span style={{ color: palette.textFaint, fontWeight: 700 }}>No image</span>
                                )}
                              </div>

                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <p style={{ margin: 0, fontWeight: 700, color: palette.text }}>{item.name}</p>
                                <p style={{ margin: 0, color: palette.textMuted }}>Qty: {item.qty}</p>
                                {item.variant && (
                                  <p style={{ margin: 0, color: palette.textFaint, fontSize: "0.9rem" }}>{item.variant}</p>
                                )}
                              </div>

                              <div style={{ textAlign: "right" }}>
                                <p style={{ margin: 0, fontWeight: 800, color: palette.text }}>
                                  {formatPrice(item.price * item.qty)}
                                </p>
                                <p style={{ margin: 0, color: palette.textFaint, fontSize: "0.9rem" }}>
                                  {formatPrice(item.price)} each
                                </p>
                                {returnStatus && (
                                  <span style={{ display: "inline-block", marginTop: 6, color: palette.textFaint, fontWeight: 700 }}>
                                    Return: {formatReturnStatus(returnStatus)}
                                  </span>
                                )}
                                {canRequestReturn && !returnStatus && (
                                  <button
                                    type="button"
                                    onClick={() => handleReturnRequest(order.id, item.orderItemId)}
                                    style={{
                                      marginTop: 8,
                                      background: "#e0f2fe",
                                      color: "#0369a1",
                                      border: "1px solid #bae6fd",
                                      padding: "6px 10px",
                                      borderRadius: 8,
                                      cursor: "pointer",
                                      fontWeight: 700,
                                    }}
                                  >
                                    Request return
                                  </button>
                                )}
                                {order.status === "Delivered" && item.orderItemId && !canRequestReturn && !returnStatus && (
                                  <span style={{ display: "inline-block", marginTop: 6, color: palette.textFaint }}>
                                    Return window expired
                                  </span>
                                )}
                              </div>

                              {order.status === "Delivered" && (
                                <div style={{ gridColumn: "1 / -1", marginTop: 4, display: "grid", gap: 6 }}>
                                  {latestReview && (
                                    <div
                                      style={{
                                        padding: 10,
                                        borderRadius: 10,
                                        background: palette.panelBg,
                                        border: `1px dashed ${palette.panelBorder}`,
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                      }}
                                    >
                                      <div>
                                        <p style={{ margin: 0, color: palette.text, fontWeight: 700 }}>
                                          Your rating: {latestReview.rating}/5
                                        </p>
                                        {approvedReview?.comment_text ? (
                                          <p style={{ margin: "4px 0 0", color: palette.textMuted }}>
                                            {approvedReview.comment_text}
                                          </p>
                                        ) : latestReview.status === "rejected" ? (
                                          <p style={{ margin: "4px 0 0", color: "#b91c1c" }}>
                                            Comment rejected by manager.
                                          </p>
                                        ) : latestReview.comment_text ? (
                                          <p style={{ margin: "4px 0 0", color: palette.textFaint }}>
                                            Comment pending manager approval
                                          </p>
                                        ) : null}
                                      </div>
                                      <span style={{ color: palette.textFaint, fontSize: "0.9rem" }}>
                                        {new Date(latestReview.created_at ?? latestReview.date).toLocaleDateString()}
                                      </span>
                                    </div>
                                  )}

                                  <ReviewForm
                                    productId={productId}
                                    latestReview={latestReview}
                                    onSubmit={handleReviewSubmit}
                                    isDelivered={order.status === "Delivered"}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 14,
                        backgroundColor: palette.softBg,
                        borderRadius: 12,
                        border: `1px solid ${palette.panelBorder}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <p style={{ margin: 0, color: palette.textMuted }}>{order.note}</p>
                        {order.statusUpdatedBy && (
                          <span style={{ margin: 0, color: palette.textFaint, fontWeight: 600 }}>
                            Last status update by {order.statusUpdatedBy}
                          </span>
                        )}
                        {order.status !== "Delivered" && (
                          <span style={{ color: palette.textFaint, fontWeight: 700 }}>
                            Status changes are handled by the sales manager.
                          </span>
                        )}
                      </div>
                      {canDownload ? (
                        <button
                          type="button"
                          onClick={() => handleDownloadInvoice(order)}
                          style={{
                            border: `1px solid ${isDark ? "#38bdf8" : "#0058a3"}`,
                            color: palette.link,
                            background: palette.inputBg,
                            padding: "8px 12px",
                            borderRadius: 10,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Download PDF
                        </button>
                      ) : (
                        <span style={{ color: palette.textFaint, fontWeight: 700 }}>
                          Invoice available for delivered orders within 30 days
                        </span>
                      )}
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function ReviewForm({ productId, latestReview, onSubmit, isDelivered }) {
  const [rating, setRating] = useState(latestReview?.rating ?? 5);
  const [comment, setComment] = useState("");
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const palette = {
    text: isDark ? "#e2e8f0" : "#0f172a",
    textFaint: isDark ? "#94a3b8" : "#94a3b8",
    inputBg: isDark ? "#0b1220" : "#ffffff",
    border: isDark ? "#1f2937" : "#cbd5e1",
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(productId, rating, comment, isDelivered);
    setComment("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 10,
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ color: palette.text, fontWeight: 700 }}>Rate</span>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setRating(value)}
            aria-label={`${value} star${value > 1 ? "s" : ""}`}
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: "1.2rem",
              lineHeight: 1,
              color: value <= rating ? "#f59e0b" : "#cbd5e1",
            }}
          >
            *
          </button>
        ))}
      </div>

      <textarea
        rows={2}
        placeholder="Add a short comment (goes to manager approval)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${palette.border}`,
          resize: "vertical",
          minHeight: 44,
          background: palette.inputBg,
          color: palette.text,
        }}
      />

      <button
        type="submit"
        style={{
          background: "#0058a3",
          color: "white",
          border: "none",
          padding: "10px 12px",
          borderRadius: 10,
          fontWeight: 800,
          cursor: "pointer",
          minWidth: 120,
        }}
      >
        {latestReview ? "Update review" : "Submit"}
      </button>
      <p style={{ gridColumn: "1 / -1", margin: "6px 0 0", color: palette.textFaint, fontSize: "0.85rem" }}>
        {isDelivered
          ? "Ratings are saved instantly. Comments appear after manager approval."
          : "Only delivered items can be reviewed."}
      </p>
    </form>
  );
}

function Info({ label, value }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const palette = {
    text: isDark ? "#e2e8f0" : "#0f172a",
    textFaint: isDark ? "#94a3b8" : "#94a3b8",
    background: isDark ? "#0b1220" : "#f8fafc",
    border: isDark ? "#1f2937" : "#e2e8f0",
  };
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 14,
        border: `1px solid ${palette.border}`,
        backgroundColor: palette.background,
      }}
    >
      <p style={{ margin: 0, color: palette.textFaint, fontSize: "0.85rem" }}>{label}</p>
      <p style={{ margin: "6px 0 0", color: palette.text, fontWeight: 700 }}>{value}</p>
    </div>
  );
}

export default OrderHistory;

