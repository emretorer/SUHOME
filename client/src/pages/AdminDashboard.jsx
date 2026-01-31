/*im the best in the world*/
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { fetchProductsWithMeta } from "../services/productService";
import { createCategory, getCategories, deleteCategory } from "../services/categoryService";
import { createMainCategory, getMainCategories, deleteMainCategory } from "../services/mainCategoryService";
import {
  fetchSupportInbox,
  fetchSupportMessages,
  claimSupportConversation,
  unclaimSupportConversation,
  fetchCustomerCart,
  fetchCustomerWishlist,
  fetchCustomerProfile,
  sendSupportMessage,
  deleteConversation as deleteConversationApi,
  SUPPORT_BASE,
} from "../services/supportService";
import {
  advanceOrderStatus,
  fetchAllOrders,
  fetchUserOrders,
  formatOrderId,
  getNextStatus,
  getOrders,
  updateBackendOrderStatus,
} from "../services/orderService";
import {
  fetchPendingComments,
  approveComment as approveCommentApi,
  rejectComment as rejectCommentApi,
} from "../services/commentService";

const DELIVERY_FILTERS = [
  { id: "All", label: "All" },
  { id: "Processing", label: "Processing" },
  { id: "In-transit", label: "In-transit" },
  { id: "Delivered", label: "Delivered" },
  { id: "Cancelled", label: "Cancelled" },
  { id: "Refund Waiting", label: "Refund Waiting" },
  { id: "Refunded", label: "Refunded" },
  { id: "Refund Rejected", label: "Refund Rejected" },
];

const REFUND_DELIVERY_STATUSES = ["Refund Waiting", "Refunded", "Refund Rejected"];
const DELIVERY_STATUS_STYLES = {
  Processing: { bg: "#fef3c7", color: "#92400e", border: "#fcd34d" },
  "In-transit": { bg: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" },
  Delivered: { bg: "#dcfce7", color: "#166534", border: "#86efac" },
  Cancelled: { bg: "#fee2e2", color: "#b91c1c", border: "#fca5a5" },
  "Refund Waiting": { bg: "#ffedd5", color: "#9a3412", border: "#fdba74" },
  Refunded: { bg: "#e0f2fe", color: "#0369a1", border: "#7dd3fc" },
  "Refund Rejected": { bg: "#f1f5f9", color: "#64748b", border: "#cbd5e1" },
};
const PRODUCT_CATEGORIES = [
  "table",
  "utensils",
  "decoration",
  "lighting",
  "sofa",
  "tv unit",
  "pillow",
  "rug",
  "side table",
  "curtain",
  "bed",
  "wardrobe",
  "box",
];
const MAIN_CATEGORIES = ["Kitchen", "Living Room", "Bedroom", "Bathroom"];
const WARRANTY_OPTIONS = Array.from({ length: 20 }, (_, index) => String(index + 1));
const COLOR_PALETTE = [
  { name: "black", hex: "#000000" },
  { name: "white", hex: "#ffffff" },
  { name: "gray", hex: "#9ca3af" },
  { name: "brown", hex: "#8b5e3c" },
  { name: "red", hex: "#ef4444" },
  { name: "orange", hex: "#f97316" },
  { name: "yellow", hex: "#facc15" },
  { name: "green", hex: "#22c55e" },
  { name: "blue", hex: "#2563eb" },
  { name: "purple", hex: "#8b5cf6" },
  { name: "pink", hex: "#ec4899" },
];

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  if (clean.length !== 6) return null;
  const value = Number.parseInt(clean, 16);
  if (!Number.isFinite(value)) return null;
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function getClosestColorName(hex) {
  const target = hexToRgb(hex);
  if (!target) return "";
  const avg = (target.r + target.g + target.b) / 3;
  const max = Math.max(target.r, target.g, target.b);
  const min = Math.min(target.r, target.g, target.b);
  const spread = max - min;
  if (avg <= 40) return "black";
  if (avg >= 225 && spread <= 20) return "white";
  if (spread <= 15) return "gray";

  if (target.r === max && target.g >= target.b + 25) return "orange";
  if (target.r === max && target.b >= target.g + 25) return "purple";
  if (target.g === max && target.r >= target.b + 25) return "yellow";
  if (target.r === max) return "red";
  if (target.g === max) return "green";
  if (target.b === max) return "blue";

  return "gray";
}

function normalizeDeliveryStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.startsWith("cancel")) return "Cancelled";
  if (normalized.includes("refund waiting") || normalized.includes("refund_waiting") || normalized.includes("refund pending")) {
    return "Refund Waiting";
  }
  if (normalized.includes("refund_rejected") || normalized.includes("refund rejected")) {
    return "Refund Rejected";
  }
  if (normalized === "refunded") return "Refunded";
  if (normalized.includes("transit") || normalized === "shipped" || normalized === "in_transit") return "In-transit";
  if (normalized === "delivered") return "Delivered";
  return "Processing";
}

const RETURN_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function resolveDeliveryLabel(order) {
  return order?.deliveryStatus || order?.delivery_status || order?.status || "";
}

function isReturnEligible(order) {
  const rawStatus = resolveDeliveryLabel(order);
  const normalized = String(rawStatus || "").toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("refund") || normalized.includes("cancel") || normalized.includes("return")) {
    return false;
  }
  if (normalized !== "delivered") return false;

  const orderDate = order?.date || order?.order_date;
  if (!orderDate) return true;
  const parsed = new Date(orderDate);
  if (Number.isNaN(parsed.getTime())) return true;
  const diffDays = (Date.now() - parsed.getTime()) / MS_PER_DAY;
  return diffDays <= RETURN_WINDOW_DAYS;
}

const rolesToSections = {
  admin: ["dashboard", "product", "sales", "support"],
  product_manager: ["product"],
  sales_manager: ["sales"],
  support: ["support"],
};

const API_BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "";

function resolveUploadUrl(url) {
  if (!url) return url;
  if (url.startsWith("/uploads")) return `${API_BASE}${url}`;
  return url;
}

function resolveAttachmentUrl(attachment, fallbackOrderId) {
  if (!attachment?.url) return attachment?.url;
  if (attachment.url.startsWith("/uploads")) {
    return resolveUploadUrl(attachment.url);
  }
  const fileName = attachment.file_name || "";
  const match = fileName.match(/invoice_ORD-(\d+)/i);
  const orderId = match ? Number(match[1]) : Number(fallbackOrderId);
  if (Number.isFinite(orderId)) {
    return `${API_BASE}/api/orders/${encodeURIComponent(orderId)}/invoice`;
  }
  return resolveUploadUrl(attachment.url);
}

function resolveCustomerName(chat, currentUser) {
  const rawName = String(chat?.customer_name || "").trim();
  const rawEmail = String(chat?.customer_email || "").trim();
  const userName = String(currentUser?.name || "").trim();
  const userEmail = String(currentUser?.email || "").trim();
  const lowerName = rawName.toLowerCase();
  const isPlaceholder = !rawName || ["guest", "user", "demo user"].includes(lowerName);

  if (rawName && !isPlaceholder) {
    if (userName && rawName === userName && rawEmail && rawEmail !== userEmail) {
      return rawEmail;
    }
    return rawName;
  }
  if (rawEmail) return rawEmail;
  if (chat?.user_id) return `User #${chat.user_id}`;
  return "Customer";
}

function AdminDashboard() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [products, setProducts] = useState([]);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [orders, setOrders] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [deliveryTab, setDeliveryTab] = useState("All");
  const [deliveryVisibleCount, setDeliveryVisibleCount] = useState(10);
  const [deliveryStatusPicker, setDeliveryStatusPicker] = useState(null);
  const [expandedDeliveryId, setExpandedDeliveryId] = useState(null);
  const [pendingReviews, setPendingReviews] = useState([]);
  const [chats, setChats] = useState([]);
  const [chatPage, setChatPage] = useState(1);
  const CHAT_PAGE_SIZE = 6;
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatFilter, setChatFilter] = useState("unclaimed");
  const [customerOrders, setCustomerOrders] = useState([]);
  const [customerWishlist, setCustomerWishlist] = useState([]);
  const [customerProfile, setCustomerProfile] = useState(null);
  const [customerCart, setCustomerCart] = useState({ items: [], total: 0 });
  const [isLoadingCustomerInfo, setIsLoadingCustomerInfo] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyFiles, setReplyFiles] = useState([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isInboxStreaming, setIsInboxStreaming] = useState(false);
  const [isThreadStreaming, setIsThreadStreaming] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [showCustomerDetails, setShowCustomerDetails] = useState(true);
  const [returnRequests, setReturnRequests] = useState([]);
  const [isLoadingReturns, setIsLoadingReturns] = useState(false);
  const [productRequests, setProductRequests] = useState([]);
  const [isLoadingProductRequests, setIsLoadingProductRequests] = useState(false);
  const [publishedProductRequests, setPublishedProductRequests] = useState([]);
  const [isLoadingPublishedRequests, setIsLoadingPublishedRequests] = useState(false);
  const [publishPrices, setPublishPrices] = useState({});
  const [publishingRequestId, setPublishingRequestId] = useState(null);
  const [useSuhomeLogistics, setUseSuhomeLogistics] = useState(false);
  const [managerProductRequests, setManagerProductRequests] = useState([]);
  const [isLoadingManagerRequests, setIsLoadingManagerRequests] = useState(false);
  const [pmEditProductId, setPmEditProductId] = useState("");
  const [pmEditProduct, setPmEditProduct] = useState(null);
  const [pmUseSuhomeLogistics, setPmUseSuhomeLogistics] = useState(false);
  const [removeCategoryId, setRemoveCategoryId] = useState("");
  const [useDefaultProductCost, setUseDefaultProductCost] = useState(false);
  const [showMainCategoryPicker, setShowMainCategoryPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pmCostProductId, setPmCostProductId] = useState("");
  const [pmCostCurrent, setPmCostCurrent] = useState(null);
  const [pmCostCurrentLabel, setPmCostCurrentLabel] = useState("");
  const [pmCostInput, setPmCostInput] = useState("");
  const [isLoadingPmCost, setIsLoadingPmCost] = useState(false);
  const [filters, setFilters] = useState({ invoiceFrom: "", invoiceTo: "" });
  const [invoices, setInvoices] = useState([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [reportFilters, setReportFilters] = useState({ from: "", to: "" });
  const [reportData, setReportData] = useState({
    totals: { revenue: 0, cost: 0, profit: 0 },
    series: [],
  });
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [mainCategories, setMainCategories] = useState([]);
  const [mainCategoryDraft, setMainCategoryDraft] = useState("");
  const [isSavingMainCategory, setIsSavingMainCategory] = useState(false);
  const [removeMainCategoryId, setRemoveMainCategoryId] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    model: "",
    serialNumber: "",
    price: "",
    stock: "",
    category: "",
    mainCategory: [],
    material: "",
    color: "",
    colorHex: "",
    warranty: "",
    distributor: "",
    features: "",
    image: "",
    cost: "",
  });
  const [discountForm, setDiscountForm] = useState({
    productId: "",
    rate: 10,
    startAt: "",
    endAt: "",
  });
  const [priceUpdate, setPriceUpdate] = useState({ productId: "", price: "" });
  const [costUpdate, setCostUpdate] = useState({ productId: "", cost: "" });
  const [deliveryUpdate, setDeliveryUpdate] = useState({ id: "", status: "" });
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [highlightedProductId, setHighlightedProductId] = useState(null);
  const productListRef = useRef(null);
  const productFormRef = useRef(null);
  const pmEditRef = useRef(null);
  const pmDetailsRef = useRef(null);
  const pmCostRef = useRef(null);
  const mainCategoriesRef = useRef(null);
  const categoriesRef = useRef(null);
  const salesPendingRef = useRef(null);
  const salesPublishedRef = useRef(null);
  const salesReturnsRef = useRef(null);
  const salesPriceRef = useRef(null);
  const salesInvoicesRef = useRef(null);
  const salesRevenueRef = useRef(null);
  const replyFileInputRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchProductsWithMeta(controller.signal)
      .then((data) => setProducts(data))
      .catch((error) => {
        if (error?.name === "AbortError") return;
        addToast("Failed to load products", "error");
      });
    return () => controller.abort();
  }, [addToast]);

  useEffect(() => {
    const controller = new AbortController();
    getCategories(controller.signal)
      .then((data) => {
        const normalized = (data || [])
          .map((item) => ({
            id: item.id ?? item.category_id ?? item.name,
            name: String(item.name ?? "").toLowerCase(),
          }))
          .filter((item) => item.name);
        setCategories(normalized.sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch((error) => {
        console.error("Categories load failed:", error);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getMainCategories(controller.signal)
      .then((data) => {
        const normalized = (data || [])
          .map((item) => ({
            id: item.id ?? item.main_category_id ?? item.name,
            name: String(item.name ?? "").toLowerCase(),
          }))
          .filter((item) => item.name);
        setMainCategories(normalized.sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch((error) => {
        console.error("Main categories load failed:", error);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!highlightedProductId) return;
    const root = productListRef.current;
    if (!root) return;
    const row = root.querySelector(`[data-product-id="${highlightedProductId}"]`);
    if (!row) return;
    requestAnimationFrame(() => {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [highlightedProductId]);

  const refreshPendingReviews = useCallback(async () => {
    try {
      const list = await fetchPendingComments();
      setPendingReviews(list);
    } catch (error) {
      console.error("Pending reviews load failed", error);
      setPendingReviews([]);
      addToast("Pending reviews could not be loaded", "error");
    }
  }, [addToast]);

  const loadOrders = useCallback(async () => {
    try {
      const remote = await fetchAllOrders();
      setOrders(remote);
    } catch (error) {
      console.error("Orders load failed, fallback to local:", error);
      setOrders(getOrders());
      addToast("Orders could not be loaded from server, showing local data", "error");
    }
  }, [addToast]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    setDeliveries(
      orders.map((order) => {
        const items = Array.isArray(order.items) ? order.items : [];
        const primaryItem = items[0];
        const totalQty = items.reduce((sum, item) => sum + Number(item.qty ?? item.quantity ?? 0), 0) || 0;
        return {
          id: order.id,
          orderId: formatOrderId(order.id),
          customerId: order.userId ?? order.user_id ?? null,
          productId: primaryItem?.productId ?? primaryItem?.id ?? null,
          quantity: totalQty,
          total: Number(order.total || 0),
          product: primaryItem?.name || "Order items",
          status: normalizeDeliveryStatus(order.status),
          address: order.address,
          date: order.date,
        };
      })
    );
  }, [orders]);

  useEffect(() => {
    setDeliveryVisibleCount(10);
    setDeliveryStatusPicker(null);
  }, [deliveryTab, orders.length]);

  const loadInbox = useCallback(async () => {
    setIsLoadingChats(true);
    try {
      const list = await fetchSupportInbox();
      setChats(list);
      const hasActive = list.some((c) => c.id === activeConversationId);
      if ((!activeConversationId || !hasActive) && list.length > 0) {
        setActiveConversationId(list[0].id);
      }
    } catch (error) {
      console.error("Support inbox fetch failed", error);
      addToast("Support queue yüklenemedi", "error");
    } finally {
      setIsLoadingChats(false);
    }
  }, [activeConversationId, addToast]);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeConversationId) || null,
    [chats, activeConversationId]
  );
  const filteredChats = useMemo(() => {
    if (chatFilter === "all") return chats;
    if (chatFilter === "mine") {
      return chats.filter(
        (chat) => String(chat.assigned_agent_id ?? "") === String(user?.id ?? "")
      );
    }
    return chats.filter((chat) => chat.status === "open" && !chat.assigned_agent_id);
  }, [chats, chatFilter, user?.id]);

  useEffect(() => {
    setChatPage(1);
  }, [chatFilter]);

  useEffect(() => {
    if (!activeConversationId) return;
    const stillVisible = filteredChats.some((chat) => chat.id === activeConversationId);
    if (!stillVisible && filteredChats.length > 0) {
      setActiveConversationId(filteredChats[0].id);
    }
  }, [filteredChats, activeConversationId]);

  useEffect(() => {
    if (activeSection !== "support") return;
    loadInbox();
  }, [activeSection, loadInbox]);

  useEffect(() => {
    if (activeSection !== "support") return undefined;
    const streamUrl = `${SUPPORT_BASE}/inbox/stream`;
    const source = new EventSource(streamUrl);
    const handleUpdate = () => loadInbox();
    source.addEventListener("inbox-update", handleUpdate);
    source.addEventListener("ready", handleUpdate);
    source.onopen = () => setIsInboxStreaming(true);
    source.onerror = () => setIsInboxStreaming(false);
    return () => {
      source.close();
      setIsInboxStreaming(false);
    };
  }, [activeSection, loadInbox]);

  useEffect(() => {
    if (activeSection !== "support" || isInboxStreaming) return undefined;
    const interval = setInterval(loadInbox, 8000);
    return () => clearInterval(interval);
  }, [activeSection, isInboxStreaming, loadInbox]);

  useEffect(() => {
    refreshPendingReviews();
  }, [refreshPendingReviews]);

  useEffect(() => {
    if (activeSection !== "sales") return;
    setIsLoadingReturns(true);
    fetch(`${API_BASE}/api/sales/return-requests`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setReturnRequests(data);
        } else {
          setReturnRequests([]);
        }
      })
      .catch((error) => {
        console.error("Return requests fetch failed", error);
        addToast("Return requests could not be loaded", "error");
        setReturnRequests([]);
      })
      .finally(() => setIsLoadingReturns(false));
  }, [activeSection, addToast]);

  useEffect(() => {
    if (activeSection !== "sales") return;
    setIsLoadingProductRequests(true);
    fetch(`${API_BASE}/api/product-requests?status=pending`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProductRequests(data);
        } else {
          setProductRequests([]);
        }
      })
      .catch((error) => {
        console.error("Product requests fetch failed", error);
        addToast("Product requests could not be loaded", "error");
        setProductRequests([]);
      })
      .finally(() => setIsLoadingProductRequests(false));
  }, [activeSection, addToast]);

  useEffect(() => {
    if (activeSection !== "sales") return;
    setIsLoadingPublishedRequests(true);
    fetch(`${API_BASE}/api/product-requests?status=published`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setPublishedProductRequests(data);
        } else {
          setPublishedProductRequests([]);
        }
      })
      .catch((error) => {
        console.error("Published requests fetch failed", error);
        addToast("Published product requests could not be loaded", "error");
        setPublishedProductRequests([]);
      })
      .finally(() => setIsLoadingPublishedRequests(false));
  }, [activeSection, addToast]);

  useEffect(() => {
    if (activeSection !== "product") return;
    if (user?.role !== "product_manager") return;
    setIsLoadingManagerRequests(true);
    fetch(`${API_BASE}/api/product-requests`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setManagerProductRequests(data);
        } else {
          setManagerProductRequests([]);
        }
      })
      .catch((error) => {
        console.error("Product requests fetch failed", error);
        addToast("Product requests could not be loaded", "error");
        setManagerProductRequests([]);
      })
      .finally(() => setIsLoadingManagerRequests(false));
  }, [activeSection, addToast, user?.role]);

  const handleViewLowStock = () => {
    setShowLowStockOnly(true);
    setActiveSection("product");
    setTimeout(() => {
      productListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  useEffect(() => {
    const handleResize = () => {
      setIsCompactLayout(window.innerWidth < 1200);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const fetchThread = useCallback(
    (options = { showSpinner: false }) => {
      if (!activeConversationId) return;
      if (options.showSpinner) setIsLoadingThread(true);
      fetchSupportMessages(activeConversationId)
        .then((data) => setChatMessages(data.messages || []))
        .catch((error) => {
          console.error("Support messages fetch failed", error);
          addToast("Konuşma açılamadı", "error");
        })
        .finally(() => {
          if (options.showSpinner) setIsLoadingThread(false);
        });
    },
    [activeConversationId, addToast]
  );

  useEffect(() => {
    if (!activeConversationId) return undefined;
    fetchThread({ showSpinner: true });
  }, [activeConversationId, fetchThread]);

  useEffect(() => {
    if (!activeConversationId || isThreadStreaming) return undefined;
    const interval = setInterval(() => fetchThread({ showSpinner: false }), 6000);
    return () => clearInterval(interval);
  }, [activeConversationId, fetchThread, isThreadStreaming]);

  useEffect(() => {
    if (!activeConversationId) return undefined;
    const streamUrl = `${SUPPORT_BASE}/conversations/${activeConversationId}/stream`;
    const source = new EventSource(streamUrl);
    const handleUpdate = () => fetchThread({ showSpinner: false });
    source.addEventListener("support-message", handleUpdate);
    source.addEventListener("ready", handleUpdate);
    source.onopen = () => setIsThreadStreaming(true);
    source.onerror = () => setIsThreadStreaming(false);
    return () => {
      source.close();
      setIsThreadStreaming(false);
    };
  }, [activeConversationId, fetchThread]);

  useEffect(() => {
    if (!activeChat?.user_id) {
      setCustomerOrders([]);
      setCustomerWishlist([]);
      setCustomerProfile(null);
      setCustomerCart({ items: [], total: 0 });
      return undefined;
    }

    let isMounted = true;
    const controller = new AbortController();
    setIsLoadingCustomerInfo(true);

    Promise.allSettled([
      fetchUserOrders(activeChat.user_id, controller.signal),
      fetchCustomerWishlist(activeChat.user_id),
      fetchCustomerProfile(activeChat.user_id),
      fetchCustomerCart(activeChat.user_id),
    ])
      .then(([ordersResult, wishlistResult, profileResult, cartResult]) => {
        if (!isMounted) return;
        if (ordersResult.status === "fulfilled") {
          setCustomerOrders(ordersResult.value);
        } else {
          console.error("Customer orders fetch failed", ordersResult.reason);
          setCustomerOrders([]);
          addToast("Customer orders could not be loaded", "error");
        }

        if (wishlistResult.status === "fulfilled") {
          setCustomerWishlist(Array.isArray(wishlistResult.value) ? wishlistResult.value : []);
        } else {
          console.error("Customer wishlist fetch failed", wishlistResult.reason);
          setCustomerWishlist([]);
          addToast("Customer wishlist could not be loaded", "error");
        }

        if (profileResult.status === "fulfilled") {
          setCustomerProfile(profileResult.value);
        } else {
          console.error("Customer profile fetch failed", profileResult.reason);
          setCustomerProfile(null);
        }

        if (cartResult.status === "fulfilled") {
          setCustomerCart(cartResult.value || { items: [], total: 0 });
        } else {
          console.error("Customer cart fetch failed", cartResult.reason);
          setCustomerCart({ items: [], total: 0 });
          addToast("Customer cart could not be loaded", "error");
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingCustomerInfo(false);
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [activeChat?.user_id, addToast]);

  const handleDeleteConversation = async (conversationId) => {
    if (!conversationId) return;
    if (!window.confirm("Delete this conversation and all its messages?")) return;
    try {
      await deleteConversationApi(conversationId);
      setChats((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConversationId === conversationId) {
        const remaining = chats.filter((c) => c.id !== conversationId);
        setActiveConversationId(remaining[0]?.id ?? null);
        setChatMessages([]);
      }
      addToast("Conversation deleted", "info");
    } catch (error) {
      console.error("Conversation delete failed", error);
      addToast("Conversation could not be deleted", "error");
    }
  };

  const permittedSections = rolesToSections[user?.role] || [];
  useEffect(() => {
    if (!permittedSections.includes(activeSection)) {
      setActiveSection(permittedSections[0] || "dashboard");
    }
  }, [activeSection, permittedSections]);

  const deliveryFilters = useMemo(() => DELIVERY_FILTERS, []);

  const deliveryStatuses = useMemo(() => {
    const base = deliveryFilters.filter((filter) => filter.id !== "All").map((filter) => filter.id);
    if (user?.role === "product_manager") {
      return base.filter((status) => !REFUND_DELIVERY_STATUSES.includes(status));
    }
    return base;
  }, [deliveryFilters, user?.role]);

  useEffect(() => {
    const allowed = deliveryFilters.some((filter) => filter.id === deliveryTab);
    if (!allowed) {
      setDeliveryTab("All");
    }
  }, [deliveryFilters, deliveryTab]);

  const totals = useMemo(() => {
    const todayUtc = new Date().toISOString().slice(0, 10);
    const revenue = orders.reduce((sum, o) => {
      const orderDay = o?.date ? new Date(o.date).toISOString().slice(0, 10) : null;
      if (orderDay !== todayUtc) return sum;
      return sum + (Number(o.total) || 0);
    }, 0);
    const lowStock = products.filter((p) => p.availableStock < 5).length;
    return { revenue, lowStock };
  }, [orders, products]);

  const visibleProducts = useMemo(() => {
    const normalizedSearch = productSearch.trim().toLowerCase();
    const base = showLowStockOnly ? products.filter((p) => p.availableStock < 5) : products;
    if (!normalizedSearch) return base;
    return base.filter((p) => {
      const name = String(p.name || "").toLowerCase();
      const category = String(p.category || "").toLowerCase();
      return name.includes(normalizedSearch) || category.includes(normalizedSearch);
    });
  }, [products, productSearch, showLowStockOnly]);

  const filteredInvoices = useMemo(() => {
    if (!filters.invoiceFrom && !filters.invoiceTo) return invoices;
    const from = filters.invoiceFrom ? Date.parse(filters.invoiceFrom) : -Infinity;
    const to = filters.invoiceTo ? Date.parse(filters.invoiceTo) : Infinity;
    return invoices.filter((inv) => {
      const ts = Date.parse(inv.issued_at || inv.date || "");
      return Number.isFinite(ts) ? ts >= from && ts <= to : false;
    });
  }, [filters.invoiceFrom, filters.invoiceTo, invoices]);

  const reportBreakdown = useMemo(() => {
    const revenue = Number(reportData.totals?.revenue || 0);
    const cost = Number(reportData.totals?.cost || 0);
    const profit = Number(reportData.totals?.profit || 0);
    const netProfit = profit > 0 ? profit : 0;
    const loss = profit < 0 ? Math.abs(profit) : 0;
    const total = cost + netProfit + loss;
    const safeTotal = total > 0 ? total : 1;
    return { revenue, cost, profit, netProfit, loss, total, safeTotal };
  }, [reportData.totals]);

  const donutBreakdown = useMemo(() => {
    const hasLoss = reportBreakdown.loss > 0;
    const total = hasLoss ? reportBreakdown.cost : reportBreakdown.revenue;
    const safeTotal = total > 0 ? total : 1;
    if (hasLoss) {
      return {
        title: "Cost",
        total,
        primaryLabel: "Revenue",
        primaryValue: reportBreakdown.revenue,
        primaryColor: "#0ea5e9",
        secondaryLabel: "Loss",
        secondaryValue: reportBreakdown.loss,
        secondaryColor: "#ef4444",
      };
    }
    return {
      title: "Revenue",
      total,
      primaryLabel: "Cost",
      primaryValue: reportBreakdown.cost,
      primaryColor: "#64748b",
      secondaryLabel: "Profit",
      secondaryValue: reportBreakdown.netProfit,
      secondaryColor: "#16a34a",
    };
  }, [reportBreakdown]);

  const filteredDeliveries = useMemo(() => {
    const sorted = [...deliveries].sort((a, b) => {
      const tsA = Date.parse(a.date || "") || 0;
      const tsB = Date.parse(b.date || "") || 0;
      if (tsA !== tsB) return tsB - tsA;
      const numA = Number(a.id) || 0;
      const numB = Number(b.id) || 0;
      return numB - numA;
    });
    if (deliveryTab === "All") return sorted;
    const normalizedTab = normalizeDeliveryStatus(deliveryTab);
    return sorted.filter((d) => normalizeDeliveryStatus(d.status) === normalizedTab);
  }, [deliveries, deliveryTab]);

  const visibleDeliveries = useMemo(
    () => filteredDeliveries.slice(0, deliveryVisibleCount),
    [filteredDeliveries, deliveryVisibleCount]
  );

  const canLoadMoreDeliveries = filteredDeliveries.length > deliveryVisibleCount;
  const canLoadLessDeliveries = deliveryVisibleCount > 10;
  const getOrderByDeliveryId = useCallback(
    (deliveryId) => orders.find((o) => String(o.id) === String(deliveryId)),
    [orders]
  );

  const groupedOrders = useMemo(() => {
    const groups = {
      Processing: [],
      "In-transit": [],
      Delivered: [],
      Cancelled: [],
      "Refund Waiting": [],
      Refunded: [],
      "Refund Rejected": [],
    };
    const parseDate = (value) => Date.parse(value) || 0;
    orders.forEach((o) => {
      const normalized = normalizeDeliveryStatus(o.status);
      const key = groups[normalized] ? normalized : "Processing";
      groups[key].push({ ...o, status: normalized });
    });
    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => (parseDate(b.date) || 0) - (parseDate(a.date) || 0));
    });
    return groups;
  }, [orders]);

  const [orderTab, setOrderTab] = useState("Processing");
  const [orderVisibleCount, setOrderVisibleCount] = useState(10);
  const ordersForActiveTab = groupedOrders[orderTab] || [];
  const visibleOrders = useMemo(
    () => ordersForActiveTab.slice(0, orderVisibleCount),
    [ordersForActiveTab, orderVisibleCount]
  );
  const canLoadMoreOrders = ordersForActiveTab.length > orderVisibleCount;
  const canLoadLessOrders = orderVisibleCount > 10;

  useEffect(() => {
    setOrderVisibleCount(10);
  }, [orderTab, orders.length]);

  const availableMainCategories = useMemo(
    () => (mainCategories.length ? mainCategories.map((c) => c.name) : MAIN_CATEGORIES),
    [mainCategories]
  );

  const toggleCategorySelection = (list, value) => {
    const current = Array.isArray(list) ? list : [];
    if (current.includes(value)) {
      return current.filter((item) => item !== value);
    }
    return [...current, value];
  };

  const isEmptyField = (value) => {
    if (Array.isArray(value)) return value.length === 0;
    return !String(value || "").trim();
  };

  const formatMainCategoryLabel = (value) => {
    if (Array.isArray(value)) return value.join(", ");
    return value || "General";
  };

  const normalizeCategoryValue = (value) => {
    if (value === "__none__") return null;
    if (!String(value || "").trim()) return null;
    return value;
  };

  const handleAddProduct = async () => {
    try {
      const basePayload = {
        name: newProduct.name,
        model: newProduct.model,
        serialNumber: newProduct.serialNumber,
        stock: Number(newProduct.stock),
        category: normalizeCategoryValue(newProduct.category),
        mainCategory: newProduct.mainCategory,
        material: newProduct.material,
        color: newProduct.color,
        warranty: newProduct.warranty,
        distributor: newProduct.distributor,
        features: newProduct.features,
        image: newProduct.image,
      };

      if (user?.role === "product_manager") {
        const required = [
          { key: "name", label: "Name", value: newProduct.name },
          { key: "model", label: "Model", value: newProduct.model },
          { key: "stock", label: "Stock", value: newProduct.stock },
          { key: "mainCategory", label: "Main category", value: newProduct.mainCategory },
          { key: "material", label: "Material", value: newProduct.material },
          { key: "color", label: "Color", value: newProduct.color },
          { key: "warranty", label: "Warranty", value: newProduct.warranty },
          { key: "distributor", label: "Distributor", value: newProduct.distributor },
          { key: "features", label: "Features", value: newProduct.features },
          { key: "image", label: "Image URL", value: newProduct.image },
        ];
        if (newProduct.category !== "__none__") {
          required.push({ key: "category", label: "Category", value: newProduct.category });
        }
        if (!useDefaultProductCost) {
          required.push({ key: "cost", label: "Cost", value: newProduct.cost });
        }
        const missing = required.filter((field) => isEmptyField(field.value)).map((field) => field.label);
        if (missing.length) {
          addToast("Fill all the textfields.", "error");
          return;
        }
        if (!Number.isFinite(Number(newProduct.stock)) || Number(newProduct.stock) < 1) {
          addToast("Stock must be at least 1", "error");
          return;
        }
        const costValue = useDefaultProductCost ? null : Number(newProduct.cost);
        if (!useDefaultProductCost && (!Number.isFinite(costValue) || costValue < 0)) {
          addToast("Enter a valid cost", "error");
          return;
        }

        const res = await fetch(`${API_BASE}/api/product-requests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...basePayload, cost: costValue }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "Product request failed");
        }
        setNewProduct({
          name: "",
          model: "",
          serialNumber: "",
          price: "",
          stock: "",
          category: "",
          mainCategory: [],
          material: "",
          color: "",
          colorHex: "",
          warranty: "",
          distributor: "",
          features: "",
          image: "",
          cost: "",
        });
        setUseSuhomeLogistics(false);
        setUseDefaultProductCost(false);
        setShowMainCategoryPicker(false);
        setShowColorPicker(false);
        addToast("Product request sent to sales manager", "info");
        return;
      }

      if (!newProduct.name) {
        addToast("Name required", "error");
        return;
      }
      if (!newProduct.stock || Number(newProduct.stock) < 1) {
        addToast("Stock must be at least 1", "error");
        return;
      }
      if (!newProduct.price) {
        addToast("Name and price required", "error");
        return;
      }

      const payload = { ...basePayload, price: Number(newProduct.price) };

      const res = await fetch(
        editingProductId ? `/api/products/${editingProductId}` : "/api/products",
        {
          method: editingProductId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Product create failed");
      }

      const controller = new AbortController();
      const refreshed = await fetchProductsWithMeta(controller.signal);
      setProducts(refreshed);
      setNewProduct({
        name: "",
        model: "",
        serialNumber: "",
        price: "",
        stock: "",
        category: "",
        mainCategory: [],
        material: "",
        color: "",
        colorHex: "",
        warranty: "",
        distributor: "",
        features: "",
        image: "",
        cost: "",
      });
      if (editingProductId) {
        setHighlightedProductId(editingProductId);
        setTimeout(() => setHighlightedProductId(null), 2000);
      }
      setEditingProductId(null);
      addToast(editingProductId ? "Product updated" : "Product added", "info");
    } catch (error) {
      console.error("Product save failed:", error);
      addToast(error.message || "Product save failed", "error");
    }
  };

  const handleEditProduct = (product) => {
    if (user?.role === "product_manager") {
      addToast("Product managers cannot edit products directly", "error");
      return;
    }
    setEditingProductId(product.id);
    setNewProduct({
      name: product.name || "",
      model: product.model || "",
      serialNumber: product.serialNumber || "",
      price: product.price || "",
      stock: Number(product.stock ?? product.availableStock ?? 0),
      category: product.category || "__none__",
      mainCategory: Array.isArray(product.mainCategory)
        ? product.mainCategory
        : String(product.mainCategory || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
      material: product.material || "",
      color: product.color || "",
      colorHex: product.colorHex || "",
      warranty: product.warranty || "",
      distributor: product.distributor || "",
      features: product.description || "",
      image: product.image || "",
      cost: "",
    });
    requestAnimationFrame(() => {
      const offset = 80;
      const top = productFormRef.current?.offsetTop ?? 0;
      window.scrollTo({ top: Math.max(0, top - offset), behavior: "smooth" });
    });
  };

  const handleCancelEdit = () => {
    setEditingProductId(null);
    setNewProduct({
      name: "",
      model: "",
      serialNumber: "",
      price: "",
      stock: "",
      category: "",
      mainCategory: [],
      material: "",
      color: "",
      colorHex: "",
      warranty: "",
      distributor: "",
      features: "",
      image: "",
      cost: "",
    });
    setUseSuhomeLogistics(false);
    setUseDefaultProductCost(false);
  };

  const handleDeleteProduct = async (productId) => {
    if (user?.role !== "product_manager") {
      addToast("Only product managers can delete products", "error");
      return false;
    }
    try {
      const res = await fetch(`/api/products/${productId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Product delete failed");
      }
      const controller = new AbortController();
      const refreshed = await fetchProductsWithMeta(controller.signal);
      setProducts(refreshed);
      addToast("Product deleted", "info");
      return true;
    } catch (error) {
      console.error("Product delete failed:", error);
      addToast(error.message || "Product delete failed", "error");
      return false;
    }
  };

  const handleAddCategory = async () => {
    const trimmed = categoryDraft.trim().toLowerCase();
    if (!trimmed) {
      addToast("Category name required", "error");
      return;
    }
    if (categories.some((c) => c.name === trimmed)) {
      addToast("Category already exists", "error");
      return;
    }
    try {
      setIsSavingCategory(true);
      const created = await createCategory(trimmed);
      setCategories((prev) =>
        [...prev, { id: created?.id ?? trimmed, name: trimmed }].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      setCategoryDraft("");
      addToast("Category added", "info");
    } catch (error) {
      console.error("Category create failed:", error);
      addToast(error.message || "Category create failed", "error");
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleSelectPmEditProduct = (productId) => {
    setPmEditProductId(productId);
    const target = products.find((p) => String(p.id) === String(productId));
    if (!target) {
      setPmEditProduct(null);
      setPmUseSuhomeLogistics(false);
      return;
    }
    setPmEditProduct({
      id: target.id,
      name: target.name || "",
      model: target.model || "",
      stock: Number(target.stock ?? target.availableStock ?? 0),
      category: target.category || "__none__",
      mainCategory: Array.isArray(target.mainCategory)
        ? target.mainCategory
        : String(target.mainCategory || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
      material: target.material || "",
      color: target.color || "",
      warranty: target.warranty || "",
      distributor: target.distributor || "",
      features: target.description || "",
      image: target.image || "",
    });
    setPmUseSuhomeLogistics(target.distributor === "SUHome Logistics");
    requestAnimationFrame(() => {
      pmEditRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleSavePmEdit = async () => {
    if (!pmEditProduct?.id) return;
    const required = [
      pmEditProduct.name,
      pmEditProduct.model,
      pmEditProduct.stock,
      pmEditProduct.mainCategory,
      pmEditProduct.material,
      pmEditProduct.color,
      pmEditProduct.warranty,
      pmEditProduct.distributor,
      pmEditProduct.features,
      pmEditProduct.image,
    ];
    if (pmEditProduct.category !== "__none__") {
      required.push(pmEditProduct.category);
    }
    if (required.some((value) => isEmptyField(value))) {
      addToast("Fill all the textfields.", "error");
      return;
    }
    if (!Number.isFinite(Number(pmEditProduct.stock)) || Number(pmEditProduct.stock) < 1) {
      addToast("Stock must be at least 1", "error");
      return;
    }

    try {
      const payload = {
        name: pmEditProduct.name,
        model: pmEditProduct.model,
        stock: Number(pmEditProduct.stock),
        category: normalizeCategoryValue(pmEditProduct.category),
        mainCategory: pmEditProduct.mainCategory,
        material: pmEditProduct.material,
        color: pmEditProduct.color,
        warranty: pmEditProduct.warranty,
        distributor: pmEditProduct.distributor,
        features: pmEditProduct.features,
        image: pmEditProduct.image,
      };
      const res = await fetch(`/api/products/${pmEditProduct.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Product update failed");
      }
      const controller = new AbortController();
      const refreshed = await fetchProductsWithMeta(controller.signal);
      setProducts(refreshed);
      addToast("Product details updated", "info");
    } catch (error) {
      console.error("Product update failed:", error);
      addToast(error.message || "Product update failed", "error");
    }
  };

  const handleAddMainCategory = async () => {
    const trimmed = mainCategoryDraft.trim().toLowerCase();
    if (!trimmed) {
      addToast("Main category name required", "error");
      return;
    }
    if (mainCategories.some((c) => c.name === trimmed)) {
      addToast("Main category already exists", "error");
      return;
    }
    try {
      setIsSavingMainCategory(true);
      const created = await createMainCategory(trimmed);
      setMainCategories((prev) =>
        [...prev, { id: created?.id ?? trimmed, name: trimmed }].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      setMainCategoryDraft("");
      addToast("Main category added", "info");
    } catch (error) {
      console.error("Main category create failed:", error);
      addToast(error.message || "Main category create failed", "error");
    } finally {
      setIsSavingMainCategory(false);
    }
  };

  useEffect(() => {
    if (!pmCostProductId) {
      setPmCostCurrent(null);
      setPmCostCurrentLabel("");
      return;
    }

    const product = products.find((p) => String(p.id) === String(pmCostProductId));
    const fallbackCost = product ? Number(product.price || 0) * 0.5 : null;
    setIsLoadingPmCost(true);
    fetch(`/api/sales/products/${encodeURIComponent(pmCostProductId)}/cost`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.cost != null) {
          setPmCostCurrent(Number(data.cost));
          setPmCostCurrentLabel(
            data.effective_from
              ? `Current cost: ₺${Number(data.cost).toLocaleString("tr-TR")} (since ${new Date(data.effective_from).toLocaleDateString("tr-TR")})`
              : `Current cost: ₺${Number(data.cost).toLocaleString("tr-TR")}`
          );
          return;
        }
        if (fallbackCost != null) {
          setPmCostCurrent(fallbackCost);
          setPmCostCurrentLabel(`Default (50% of price): ₺${fallbackCost.toLocaleString("tr-TR")}`);
        } else {
          setPmCostCurrent(null);
          setPmCostCurrentLabel("No cost set yet.");
        }
      })
      .catch((error) => {
        console.error("Product cost fetch failed", error);
        setPmCostCurrent(null);
        setPmCostCurrentLabel("Cost could not be loaded.");
      })
      .finally(() => setIsLoadingPmCost(false));
  }, [pmCostProductId, products]);

  const handlePmCostUpdate = async () => {
    if (!pmCostProductId || pmCostInput === "") {
      addToast("Select product and cost", "error");
      return;
    }
    if (!window.confirm("Are you sure you want to update the product cost?")) return;
    try {
      const body = new URLSearchParams();
      body.set("cost", pmCostInput);
      const res = await fetch(`/api/sales/products/${pmCostProductId}/cost`, {
        method: "PUT",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Cost update failed");
      }
      addToast("Cost updated", "info");
      setPmCostInput("");
      setPmCostProductId("");
      setPmCostCurrent(null);
      setPmCostCurrentLabel("");
    } catch (error) {
      console.error("Cost update failed:", error);
      addToast(error.message || "Cost update failed", "error");
    }
  };

  const handleDeleteCategory = async (category, options = {}) => {
    if (!category?.id) return;
    const confirmMessage = options.confirmMessage || `Delete category "${category.name}"?`;
    if (!window.confirm(confirmMessage)) return;
    try {
      await deleteCategory(category.id);
      setCategories((prev) => prev.filter((item) => item.id !== category.id));
      addToast("Category deleted", "info");
    } catch (error) {
      console.error("Category delete failed:", error);
      addToast(error.message || "Category delete failed", "error");
    }
  };

  const handleDeleteMainCategory = async (category, options = {}) => {
    if (!category?.id) return;
    const confirmMessage = options.confirmMessage || `Delete main category "${category.name}"?`;
    if (!window.confirm(confirmMessage)) return;
    try {
      await deleteMainCategory(category.id);
      setMainCategories((prev) => prev.filter((item) => item.id !== category.id));
      addToast("Main category deleted", "info");
    } catch (error) {
      console.error("Main category delete failed:", error);
      addToast(error.message || "Main category delete failed", "error");
    }
  };

  const handlePublishProductRequest = async (requestId) => {
    const priceValue = publishPrices[requestId];
    if (priceValue === "" || priceValue == null) {
      addToast("Enter a price to publish", "error");
      return;
    }
    const price = Number(priceValue);
    if (!Number.isFinite(price) || price <= 0) {
      addToast("Enter a valid price", "error");
      return;
    }
    try {
      setPublishingRequestId(requestId);
      const res = await fetch(`${API_BASE}/api/product-requests/${requestId}/publish`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Publish failed");
      }
      const refreshed = await fetch(`${API_BASE}/api/product-requests?status=pending`).then((r) => r.json());
      setProductRequests(Array.isArray(refreshed) ? refreshed : []);
      const published = await fetch(`${API_BASE}/api/product-requests?status=published`).then((r) => r.json());
      setPublishedProductRequests(Array.isArray(published) ? published : []);
      if (user?.role === "product_manager") {
        const all = await fetch(`${API_BASE}/api/product-requests`).then((r) => r.json());
        setManagerProductRequests(Array.isArray(all) ? all : []);
      }
      const controller = new AbortController();
      const productsRefreshed = await fetchProductsWithMeta(controller.signal);
      setProducts(productsRefreshed);
      setPublishPrices((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      addToast("Product published", "info");
    } catch (error) {
      console.error("Publish failed:", error);
      addToast(error.message || "Publish failed", "error");
    } finally {
      setPublishingRequestId(null);
    }
  };

  const handlePriceUpdate = async () => {
    if (!priceUpdate.productId || !priceUpdate.price) {
      addToast("Select product and price", "error");
      return;
    }
    try {
      const body = new URLSearchParams();
      body.set("price", priceUpdate.price);
      const res = await fetch(`/api/sales/products/${priceUpdate.productId}/price`, {
        method: "PUT",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Price update failed");
      }
      await loadOrders();
      const controller = new AbortController();
      const refreshed = await fetchProductsWithMeta(controller.signal);
      setProducts(refreshed);
      addToast("Price updated", "info");
    } catch (error) {
      console.error("Price update failed:", error);
      addToast(error.message || "Price update failed", "error");
    }
  };

  const handleCostUpdate = async () => {
    if (!costUpdate.productId || costUpdate.cost === "") {
      addToast("Select product and cost", "error");
      return;
    }
    try {
      const body = new URLSearchParams();
      body.set("cost", costUpdate.cost);
      const res = await fetch(`/api/sales/products/${costUpdate.productId}/cost`, {
        method: "PUT",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Cost update failed");
      }
      addToast("Cost updated", "info");
    } catch (error) {
      console.error("Cost update failed:", error);
      addToast(error.message || "Cost update failed", "error");
    }
  };


  const handleDiscount = async () => {
    if (!discountForm.productId) {
      addToast("Select product", "error");
      return;
    }
    if (!discountForm.startAt || !discountForm.endAt) {
      addToast("Start and end dates are required", "error");
      return;
    }
    try {
      const body = new URLSearchParams();
      body.set("rate", String(discountForm.rate));
      body.set("start_at", discountForm.startAt);
      body.set("end_at", discountForm.endAt);
      body.set("product_ids", String(discountForm.productId));
      const res = await fetch("/api/sales/discounts/apply", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Discount apply failed");
      }
      const controller = new AbortController();
      const refreshed = await fetchProductsWithMeta(controller.signal);
      setProducts(refreshed);
      addToast(`Discount applied (${data?.notified || 0} notified)`, "info");
    } catch (error) {
      console.error("Discount apply failed:", error);
      addToast(error.message || "Discount apply failed", "error");
    }
  };
  const handleLoadInvoices = async () => {
    if (!filters.invoiceFrom || !filters.invoiceTo) {
      addToast("Select invoice date range", "error");
      return;
    }
    setIsLoadingInvoices(true);
    try {
      const params = new URLSearchParams();
      params.set("from", filters.invoiceFrom);
      params.set("to", filters.invoiceTo);
      const res = await fetch(`/api/sales/invoices?${params.toString()}`);
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error(data?.error || "Invoices could not be loaded");
      }
      setInvoices(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Invoice load failed:", error);
      setInvoices([]);
      addToast(error.message || "Invoices could not be loaded", "error");
    } finally {
      setIsLoadingInvoices(false);
    }
  };

  const handleLoadReport = async () => {
    if (!reportFilters.from || !reportFilters.to) {
      addToast("Select report date range", "error");
      return;
    }
    setIsLoadingReport(true);
    try {
      const params = new URLSearchParams();
      params.set("from", reportFilters.from);
      params.set("to", reportFilters.to);
      const res = await fetch(`/api/sales/reports/profit?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Report could not be loaded");
      }
      setReportData({
        totals: data?.totals || { revenue: 0, cost: 0, profit: 0 },
        series: Array.isArray(data?.series) ? data.series : [],
      });
    } catch (error) {
      console.error("Report load failed:", error);
      setReportData({ totals: { revenue: 0, cost: 0, profit: 0 }, series: [] });
      addToast(error.message || "Report could not be loaded", "error");
    } finally {
      setIsLoadingReport(false);
    }
  };

  const buildInvoiceUrl = (orderId) => `/api/orders/${encodeURIComponent(orderId)}/invoice`;

  const handleViewInvoice = (orderId) => {
    window.open(buildInvoiceUrl(orderId), "_blank", "noopener,noreferrer");
  };

  const handlePrintInvoice = (orderId) => {
    const win = window.open(buildInvoiceUrl(orderId), "_blank", "noopener,noreferrer");
    if (!win) {
      return;
    }
    win.addEventListener("load", () => {
      win.focus();
      win.print();
    });
  };

  const handleDownloadInvoice = (orderId) => {
    const link = document.createElement("a");
    link.href = buildInvoiceUrl(orderId);
    link.download = `invoice_${orderId}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const applyDeliveryStatus = async (deliveryId, nextStatus) => {
    if (!deliveryId || !nextStatus) {
      addToast("Select delivery and status", "error");
      return;
    }
    const normalizedStatus = normalizeDeliveryStatus(nextStatus);
    const current = deliveries.find((delivery) => String(delivery.id) === String(deliveryId));
    if (current && REFUND_DELIVERY_STATUSES.includes(current.status)) {
      addToast("Refund statuses cannot be updated from delivery list", "error");
      return;
    }
    if (!deliveryStatuses.includes(normalizedStatus)) {
      addToast("Select a valid status", "error");
      return;
    }
    const numericId = Number(deliveryId);
    const isBackendOrder = Number.isFinite(numericId);
    try {
      if (isBackendOrder) {
        await updateBackendOrderStatus(numericId, normalizedStatus);
      }
      setDeliveries((prev) =>
        prev.map((d) => (String(d.id) === String(deliveryId) ? { ...d, status: normalizedStatus } : d))
      );
      setOrders((prev) =>
        prev.map((o) =>
          String(o.id) === String(deliveryId) ? { ...o, status: normalizedStatus } : o
        )
      );
      if (isBackendOrder) {
        await loadOrders();
      }
      addToast("Delivery status updated", "info");
    } catch (error) {
      console.error("Delivery update failed", error);
      addToast(error.message || "Delivery status could not be updated", "error");
    }
  };

  const handleDeliveryStatus = async () => {
    await applyDeliveryStatus(deliveryUpdate.id, deliveryUpdate.status);
  };

    const handleInlineStatusClick = (delivery) => {
      if (REFUND_DELIVERY_STATUSES.includes(delivery.status)) {
        addToast("Refund statuses cannot be updated", "error");
        return;
      }
      setDeliveryStatusPicker((prev) => (prev === delivery.id ? null : delivery.id));
    };

  const handleSelectStatusOption = async (delivery, status) => {
    await applyDeliveryStatus(delivery.id, status);
    setDeliveryStatusPicker(null);
  };

  const handleSelectConversation = (id) => {
    setActiveConversationId(id);
    setReplyDraft("");
  };

  const handleClaimConversation = async (conversationId) => {
    try {
      const agentId = Number(user?.id);
      const payload = await claimSupportConversation(
        conversationId,
        Number.isFinite(agentId) && agentId > 0 ? agentId : undefined
      );
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === conversationId
            ? {
                ...chat,
                status: payload?.status || "pending",
                assigned_agent_id: payload?.assigned_user_id ?? agentId ?? chat.assigned_agent_id ?? null,
                assigned_agent_name: user?.name || chat.assigned_agent_name || null,
                assigned_agent_email: user?.email || chat.assigned_agent_email || null,
              }
            : chat
        )
      );
      addToast("Conversation claimed", "info");
    } catch (error) {
      console.error("Support claim failed", error);
      addToast(error.message || "Conversation could not be claimed", "error");
    }
  };

  const handleUnclaimConversation = async (conversationId) => {
    try {
      const agentId = Number(user?.id);
      const payload = await unclaimSupportConversation(
        conversationId,
        Number.isFinite(agentId) && agentId > 0 ? agentId : undefined
      );
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === conversationId
            ? {
                ...chat,
                status: payload?.status || "open",
                assigned_agent_id: null,
                assigned_agent_name: null,
                assigned_agent_email: null,
              }
            : chat
        )
      );
      addToast("Conversation unclaimed", "info");
    } catch (error) {
      console.error("Support unclaim failed", error);
      addToast(error.message || "Conversation could not be unclaimed", "error");
    }
  };

  const handleAdvanceOrder = async (orderId) => {
    const current = orders.find(
      (o) =>
        String(o.id) === String(orderId) ||
        formatOrderId(o.id) === formatOrderId(orderId) ||
        o.formattedId === orderId
    );

    if (!current) {
      addToast("Order not found", "error");
      return;
    }

    const { nextStatus, nextIndex } = getNextStatus(current);
    if (["Delivered", "Cancelled", "Refunded", "Refund Rejected"].includes(current.status) || nextStatus === current.status) {
      addToast("Order already in final status", "info");
      return;
    }

    const isBackendOrder = Number.isFinite(Number(current.id));

    if (isBackendOrder) {
      try {
        await updateBackendOrderStatus(current.id, nextStatus);
        await loadOrders();
        addToast("Order advanced to next status", "info");
        return;
      } catch (error) {
        console.error("Backend status update failed, falling back:", error);
        addToast(error.message || "Backend update failed", "error");
      }
    }

    const result = advanceOrderStatus(orderId, user);
    if (result.error) {
      addToast(result.error, "error");
      return;
    }
    setOrders(result.orders);
    addToast("Order advanced to next status", "info");
  };

  const handleRefundDecision = async (orderId, decisionStatus) => {
    const numericId = Number(orderId);
    const isBackendOrder = Number.isFinite(numericId);
    try {
      if (isBackendOrder) {
        await updateBackendOrderStatus(numericId, decisionStatus);
        await loadOrders();
      } else {
        setOrders((prev) =>
          prev.map((o) => (String(o.id) === String(orderId) ? { ...o, status: decisionStatus } : o))
        );
      }
      addToast(decisionStatus === "Refunded" ? "Refund approved" : "Refund Rejected", "info");
    } catch (error) {
      console.error("Refund decision failed", error);
      addToast(error.message || "Refund decision failed", "error");
    }
  };

  const handleReturnStatusUpdate = async (returnId, status) => {
    try {
      const res = await fetch(`/api/sales/return-requests/${returnId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Return status update failed");
      }
      const nextOrderStatus =
        status === "rejected"
          ? "refund_rejected"
          : status === "accepted"
          ? "refund_waiting"
          : status === "refunded"
          ? "refunded"
          : null;
      setReturnRequests((prev) =>
        prev.map((item) =>
          item.return_id === returnId
            ? {
                ...item,
                return_status: status,
                order_status: nextOrderStatus ?? item.order_status,
              }
            : item
        )
      );
      addToast("Return request updated", "info");
    } catch (error) {
      console.error("Return status update failed", error);
      addToast(error.message || "Return status update failed", "error");
    }
  };

  const handleApproveReview = async (commentId) => {
    try {
      await approveCommentApi(commentId);
      await refreshPendingReviews();
      addToast("Review approved", "info");
    } catch (error) {
      console.error("Review approve failed", error);
      addToast("Review approve failed", "error");
    }
  };

  const handleRejectReview = async (commentId) => {
    try {
      await rejectCommentApi(commentId);
      await refreshPendingReviews();
      addToast("Review rejected", "info");
    } catch (error) {
      console.error("Review reject failed", error);
      addToast("Review reject failed", "error");
    }
  };

  const handleSendReply = async () => {
    const hasText = replyDraft.trim().length > 0;
    const hasFiles = replyFiles.length > 0;
    if ((!hasText && !hasFiles) || !activeConversationId) {
      addToast("Mesaj veya dosya ekleyin", "error");
      return;
    }

    setIsSendingReply(true);
    try {
      const agentId = Number(user?.id);
      const payload = await sendSupportMessage({
        conversationId: activeConversationId,
        agentId: Number.isFinite(agentId) && agentId > 0 ? agentId : undefined,
        text: replyDraft,
        attachments: replyFiles,
      });

      if (payload?.message) {
        setChatMessages((prev) => [...prev, payload.message]);
      }
      setReplyDraft("");
      setReplyFiles([]);
      if (replyFileInputRef.current) replyFileInputRef.current.value = "";
      loadInbox();
      // thread hemen güncellensin
      fetchSupportMessages(activeConversationId)
        .then((data) => setChatMessages(data.messages || []))
        .catch(() => {});
    } catch (error) {
      console.error("Support reply failed", error);
      addToast("Mesaj gönderilemedi", "error");
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleSelectReplyFiles = (event) => {
    const selected = Array.from(event.target.files || []).slice(0, 4);
    setReplyFiles(selected);
  };

  const handleRemoveReplyFile = (name) => {
    setReplyFiles((prev) => prev.filter((file) => file.name !== name));
    if (replyFileInputRef.current) replyFileInputRef.current.value = "";
  };

  const filterButtonStyle = (isActive) => ({
    padding: "6px 10px",
    borderRadius: 999,
    border: isActive ? "1px solid #0ea5e9" : "1px solid #e5e7eb",
    background: isActive ? "rgba(14,165,233,0.12)" : "white",
    color: isActive ? "#0ea5e9" : "#475569",
    fontWeight: 700,
    cursor: "pointer",
  });

  const handleDrawerJump = (ref) => {
    if (!ref?.current) return;
    ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const sections = [
    { id: "dashboard", label: "Overview" },
    { id: "product", label: "Product Manager" },
    { id: "sales", label: "Sales Manager" },
    { id: "support", label: "Support" },
  ].filter((s) => permittedSections.includes(s.id));

  const productDrawerLinks = useMemo(() => {
    if (activeSection !== "product") return [];
    const links = [
      { id: "product-form", label: user?.role === "product_manager" ? "Add product request" : "Add product", ref: productFormRef },
    ];
    if (user?.role === "product_manager") {
      links.push({ id: "pm-requests", label: "My product requests", ref: pmEditRef });
      links.push({ id: "pm-details", label: "Update product details", ref: pmDetailsRef });
      links.push({ id: "pm-cost", label: "Update product cost", ref: pmCostRef });
    }
    links.push({ id: "main-categories", label: "Main categories", ref: mainCategoriesRef });
    links.push({ id: "categories", label: "Categories", ref: categoriesRef });
    return links;
  }, [activeSection, user?.role]);

  const salesDrawerLinks = useMemo(() => {
    if (activeSection !== "sales") return [];
    return [
      { id: "sales-pending", label: "Pending product requests", ref: salesPendingRef },
      { id: "sales-published", label: "Published product requests", ref: salesPublishedRef },
      { id: "sales-returns", label: "Return requests", ref: salesReturnsRef },
      { id: "sales-price", label: "Price & Discount", ref: salesPriceRef },
      { id: "sales-invoices", label: "Invoices", ref: salesInvoicesRef },
      { id: "sales-revenue", label: "Revenue & profit/loss", ref: salesRevenueRef },
    ];
  }, [activeSection]);

  return (
    <div
      style={{
        background: "#f3f4f6",
        minHeight: "calc(100vh - 160px)",
        padding: "28px 16px 72px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          boxSizing: "border-box",
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
          alignItems: "flex-start",
        }}
      >
        <aside
          style={{
            background: "white",
            borderRadius: 14,
            padding: 16,
            boxShadow: "0 14px 30px rgba(0,0,0,0.05)",
            display: "grid",
            gap: 10,
            flex: "0 0 260px",
            minWidth: 220,
          }}
        >
          <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>Admin Panel</h3>
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSection(s.id)}
              style={{
                textAlign: "left",
                border: "1px solid #e5e7eb",
                background: activeSection === s.id ? "#0058a3" : "white",
                color: activeSection === s.id ? "white" : "#0f172a",
                padding: "10px 12px",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {s.label}
            </button>
          ))}
          {sections.length > 1 && (
            <div
              style={{
                marginTop: 6,
                padding: 10,
                borderRadius: 12,
                border: "1px dashed #cbd5e1",
                background: "#f8fafc",
                display: "grid",
                gap: 8,
              }}
            >
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#64748b" }}>Quick access</span>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
                {sections.map((s) => (
                  <button
                    key={`${s.id}-drawer`}
                    type="button"
                    onClick={() => setActiveSection(s.id)}
                    style={{
                      border: "1px solid #e5e7eb",
                      background: activeSection === s.id ? "#0f172a" : "white",
                      color: activeSection === s.id ? "white" : "#0f172a",
                      padding: "6px 10px",
                      borderRadius: 999,
                      cursor: "pointer",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {productDrawerLinks.length > 0 && (
            <div
              style={{
                marginTop: 6,
                padding: 12,
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                display: "grid",
                gap: 10,
              }}
            >
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#64748b" }}>Product sections</span>
              <div style={{ display: "grid", gap: 8 }}>
                {productDrawerLinks.map((link) => (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => handleDrawerJump(link.ref)}
                    style={{
                      textAlign: "left",
                      border: "1px solid #e5e7eb",
                      background: "white",
                      color: "#0f172a",
                      padding: "8px 10px",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {salesDrawerLinks.length > 0 && (
            <div
              style={{
                marginTop: 10,
                padding: 12,
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                display: "grid",
                gap: 10,
              }}
            >
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#64748b" }}>Sales sections</span>
              <div style={{ display: "grid", gap: 8 }}>
                {salesDrawerLinks.map((link) => (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => handleDrawerJump(link.ref)}
                    style={{
                      textAlign: "left",
                      border: "1px solid #e5e7eb",
                      background: "white",
                      color: "#0f172a",
                      padding: "8px 10px",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <main
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            flex: "1 1 0",
            minWidth: 0,
          }}
        >
          {activeSection !== "support" && (
            <header
              style={{
                background: "white",
                borderRadius: 16,
                padding: 18,
                boxShadow: "0 18px 40px rgba(0,0,0,0.06)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <p style={{ margin: "0 0 6px", color: "#6b7280", fontWeight: 700 }}>
                  Admin workspace / {activeSection}
                </p>
                <h1 style={{ margin: 0, color: "#0f172a" }}>Dashboard</h1>
                <p style={{ margin: "6px 0 0", color: "#475569" }}>Role: {user?.role || "customer"}</p>
              </div>
              {user?.role !== "product_manager" && (
                <div style={{ textAlign: "right" }}>
                  <p style={{ margin: 0, color: "#6b7280" }}>Today&apos;s revenue</p>
                  <strong style={{ fontSize: "1.4rem", color: "#0058a3" }}>
                    ₺{totals.revenue.toLocaleString("tr-TR")}
                  </strong>
                </div>
              )}
            </header>
          )}

          {activeSection === "dashboard" && (
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              {[
                { label: "Revenue (7d)", value: "₺125,430", change: "+8.2%", tone: "#0058a3" },
                { label: "Orders", value: "312", change: "+5.4%", tone: "#f59e0b" },
                { label: "Low stock", value: totals.lowStock, change: "Restock soon", tone: "#ef4444" },
                {
                  label: "Active chats",
                  value: chats.filter((c) => c.status !== "closed").length,
                  change: "Support",
                  tone: "#0ea5e9",
                },
              ].map((card) => (
                <div
                  key={card.label}
                  style={{
                    background: "white",
                    borderRadius: 14,
                    padding: 16,
                    boxShadow: "0 14px 30px rgba(0,0,0,0.05)",
                    borderLeft: `6px solid ${card.tone}`,
                  }}
                >
                  <p style={{ margin: "0 0 6px", color: "#6b7280", fontWeight: 700 }}>{card.label}</p>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a" }}>{card.value}</span>
                    <span style={{ color: card.tone, fontWeight: 700, fontSize: "0.95rem" }}>{card.change}</span>
                  </div>
                </div>
              ))}
            </section>
          )}

          {activeSection === "product" && (
            <section style={{ display: "grid", gap: 18 }}>
              <div
                ref={productFormRef}
                style={{
                  background: "white",
                  borderRadius: 14,
                  padding: 18,
                  boxShadow: "0 14px 30px rgba(0,0,0,0.05)",
                  display: "grid",
                  gap: 12,
                }}
              >
                <h3 style={{ margin: "0 0 10px", color: "#0f172a" }}>
                  {user?.role === "product_manager" ? "Add product request" : "Add product"}
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <input
                    placeholder="Name"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
                    style={inputStyle}
                  />
                  <input
                    placeholder="Model"
                    value={newProduct.model}
                    onChange={(e) => setNewProduct((p) => ({ ...p, model: e.target.value }))}
                    style={inputStyle}
                  />
                  {user?.role !== "product_manager" && (
                    <input
                      placeholder="Price"
                      type="number"
                      value={newProduct.price}
                      onChange={(e) => setNewProduct((p) => ({ ...p, price: e.target.value }))}
                      style={inputStyle}
                    />
                  )}
                  {user?.role === "product_manager" && (
                    <div style={{ display: "grid", gap: 6 }}>
                      <input
                        placeholder="Cost"
                        type="number"
                        value={newProduct.cost}
                        onChange={(e) => setNewProduct((p) => ({ ...p, cost: e.target.value }))}
                        style={{ ...inputStyle, background: useDefaultProductCost ? "#f8fafc" : inputStyle.background }}
                        readOnly={useDefaultProductCost}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setUseDefaultProductCost((prev) => {
                            const next = !prev;
                            if (next) {
                              setNewProduct((p) => ({ ...p, cost: "" }));
                            }
                            return next;
                          });
                        }}
                        style={{ ...secondaryBtn, padding: "6px 10px", fontSize: "0.85rem" }}
                      >
                        {useDefaultProductCost ? "Use custom cost" : "Set default (50%)"}
                      </button>
                    </div>
                  )}
                  <input
                    placeholder="Stock"
                    type="number"
                    min={1}
                    value={newProduct.stock}
                    onChange={(e) => setNewProduct((p) => ({ ...p, stock: e.target.value }))}
                    style={inputStyle}
                  />
                  <div style={{ display: "grid", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setShowMainCategoryPicker((prev) => !prev)}
                      style={{ ...secondaryBtn, justifySelf: "start" }}
                    >
                      Select main categories
                    </button>
                    {showMainCategoryPicker && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {availableMainCategories.map((category) => {
                          const isActive = newProduct.mainCategory.includes(category);
                          return (
                            <button
                              key={category}
                              type="button"
                              onClick={() =>
                                setNewProduct((p) => ({
                                  ...p,
                                  mainCategory: toggleCategorySelection(p.mainCategory, category),
                                }))
                              }
                              style={{
                                borderRadius: 999,
                                padding: "6px 12px",
                                border: `1px solid ${isActive ? "#0f172a" : "#e5e7eb"}`,
                                background: isActive ? "#0f172a" : "#f8fafc",
                                color: isActive ? "#ffffff" : "#0f172a",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              {category}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <select
                    value={newProduct.category}
                    onChange={(e) => setNewProduct((p) => ({ ...p, category: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="__none__">Select subcategory</option>
                    {(categories.length ? categories.map((c) => c.name) : PRODUCT_CATEGORIES).map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Material"
                    value={newProduct.material}
                    onChange={(e) => setNewProduct((p) => ({ ...p, material: e.target.value }))}
                    style={inputStyle}
                  />
                  <div style={{ display: "grid", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setShowColorPicker((prev) => !prev)}
                      style={{ ...secondaryBtn, justifySelf: "start" }}
                    >
                      {showColorPicker ? "Hide colors" : "Select color"}
                    </button>
                    {showColorPicker && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {COLOR_PALETTE.map((swatch) => (
                          <button
                            key={swatch.name}
                            type="button"
                            onClick={() =>
                              setNewProduct((p) => ({
                                ...p,
                                color: swatch.name,
                                colorHex: swatch.hex,
                              }))
                            }
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: "50%",
                              border: swatch.name === newProduct.color ? "2px solid #0f172a" : "1px solid #e5e7eb",
                              background: swatch.hex,
                              cursor: "pointer",
                            }}
                            aria-label={`Select ${swatch.name}`}
                            title={swatch.name}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <select
                    value={newProduct.warranty}
                    onChange={(e) => setNewProduct((p) => ({ ...p, warranty: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">Warranty (years)</option>
                    {WARRANTY_OPTIONS.map((years) => (
                      <option key={years} value={years}>
                        {years}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: "grid", gap: 6 }}>
                    <input
                      placeholder="Distributor"
                      value={newProduct.distributor}
                      onChange={(e) => setNewProduct((p) => ({ ...p, distributor: e.target.value }))}
                      style={{ ...inputStyle, background: useSuhomeLogistics ? "#f8fafc" : inputStyle.background }}
                      readOnly={useSuhomeLogistics}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setUseSuhomeLogistics((prev) => {
                          const next = !prev;
                          setNewProduct((p) => ({
                            ...p,
                            distributor: next ? "SUHome Logistics" : "",
                          }));
                          return next;
                        });
                      }}
                      style={{ ...secondaryBtn, padding: "6px 10px", fontSize: "0.85rem" }}
                    >
                      {useSuhomeLogistics ? "Deselect SUHome Logistics" : "Use SUHome Logistics"}
                    </button>
                  </div>
                  <input
                    placeholder="Features"
                    value={newProduct.features}
                    onChange={(e) => setNewProduct((p) => ({ ...p, features: e.target.value }))}
                    style={inputStyle}
                  />
                  <input
                    placeholder="Image URL"
                    value={newProduct.image}
                    onChange={(e) => setNewProduct((p) => ({ ...p, image: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                {user?.role === "product_manager" && (
                  <p style={{ margin: "0 0 4px", color: "#64748b" }}>
                    Sales manager will set the final price before publishing.
                  </p>
                )}
                {editingProductId && user?.role !== "product_manager" && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button type="button" onClick={handleAddProduct} style={{ ...primaryBtn, marginTop: 10 }}>
                      Save changes
                    </button>
                    <button type="button" onClick={handleCancelEdit} style={{ ...secondaryBtn, marginTop: 10 }}>
                      Cancel
                    </button>
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" onClick={handleAddProduct} style={{ ...primaryBtn, marginTop: 10 }}>
                    {user?.role === "product_manager" ? "Send request" : "Add product"}
                  </button>
                </div>
              </div>

              {user?.role === "product_manager" && (
                <div
                  ref={pmEditRef}
                  style={{
                    background: "white",
                    borderRadius: 14,
                    padding: 18,
                    boxShadow: "0 14px 30px rgba(0,0,0,0.05)",
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0, color: "#0f172a" }}>My product requests</h3>
                    <span style={{ color: "#94a3b8", fontWeight: 700 }}>
                      {managerProductRequests.length} total
                    </span>
                  </div>
                  {isLoadingManagerRequests && <p style={{ margin: 0, color: "#64748b" }}>Loading requests...</p>}
                  {!isLoadingManagerRequests && managerProductRequests.length === 0 && (
                    <p style={{ margin: 0, color: "#94a3b8" }}>No requests yet.</p>
                  )}
                  <div style={{ display: "grid", gap: 12 }}>
                    {managerProductRequests.map((req) => (
                      <div
                        key={req.request_id}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 12,
                          padding: 12,
                          background: "#f8fafc",
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <div>
                            <strong>{req.name}</strong>
                            <p style={{ margin: "2px 0 0", color: "#64748b" }}>
                              {formatMainCategoryLabel(req.mainCategory)} • {req.category || "General"}
                            </p>
                          </div>
                          <span
                            style={{
                              padding: "3px 10px",
                              borderRadius: 999,
                              background: req.status === "published" ? "#dcfce7" : "#fef3c7",
                              color: req.status === "published" ? "#166534" : "#92400e",
                              fontWeight: 700,
                              fontSize: "0.8rem",
                              lineHeight: 1.2,
                              textTransform: "capitalize",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {req.status === "published" ? "Published" : "Pending"}
                          </span>
                        </div>
                        <small style={{ color: "#94a3b8" }}>
                          Requested: {req.requested_at ? new Date(req.requested_at).toLocaleString("tr-TR") : "N/A"}
                        </small>
                        {req.status === "published" && (
                          <small style={{ color: "#64748b" }}>
                            Price set: ₺{Number(req.price || 0).toLocaleString("tr-TR")}
                          </small>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {user?.role === "product_manager" && (
                <div
                  ref={pmDetailsRef}
                  style={{
                    background: "white",
                    borderRadius: 14,
                    padding: 18,
                    boxShadow: "0 14px 30px rgba(0,0,0,0.05)",
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div>
                    <h3 style={{ margin: "0 0 6px", color: "#0f172a" }}>Update product details</h3>
                    <p style={{ margin: 0, color: "#64748b" }}>
                      Price is managed by sales manager. Update the remaining product fields below.
                    </p>
                  </div>
                  <select
                    value={pmEditProductId}
                    onChange={(e) => handleSelectPmEditProduct(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Select product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                  {pmEditProduct && (
                    <div style={{ display: "grid", gap: 12 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                        <input
                          placeholder="Name"
                          value={pmEditProduct.name}
                          onChange={(e) => setPmEditProduct((prev) => ({ ...prev, name: e.target.value }))}
                          style={inputStyle}
                        />
                        <input
                          placeholder="Model"
                          value={pmEditProduct.model}
                          onChange={(e) => setPmEditProduct((prev) => ({ ...prev, model: e.target.value }))}
                          style={inputStyle}
                        />
                        <input
                          placeholder="Stock"
                          type="number"
                          min={1}
                          value={pmEditProduct.stock}
                          onChange={(e) => setPmEditProduct((prev) => ({ ...prev, stock: e.target.value }))}
                          style={inputStyle}
                        />
                        <div style={{ display: "grid", gap: 8 }}>
                          <p style={{ margin: 0, color: "#64748b", fontSize: "0.85rem", fontWeight: 700 }}>
                            Main categories
                          </p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {availableMainCategories.map((category) => {
                              const isActive = pmEditProduct.mainCategory.includes(category);
                              return (
                                <button
                                  key={category}
                                  type="button"
                                  onClick={() =>
                                    setPmEditProduct((prev) => ({
                                      ...prev,
                                      mainCategory: toggleCategorySelection(prev.mainCategory, category),
                                    }))
                                  }
                                  style={{
                                    borderRadius: 999,
                                    padding: "6px 12px",
                                    border: `1px solid ${isActive ? "#0f172a" : "#e5e7eb"}`,
                                    background: isActive ? "#0f172a" : "#f8fafc",
                                    color: isActive ? "#ffffff" : "#0f172a",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  {category}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <select
                          value={pmEditProduct.category}
                          onChange={(e) => setPmEditProduct((prev) => ({ ...prev, category: e.target.value }))}
                          style={inputStyle}
                        >
                          <option value="__none__">No category</option>
                          {(categories.length ? categories.map((c) => c.name) : PRODUCT_CATEGORIES).map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                        <input
                          placeholder="Material"
                          value={pmEditProduct.material}
                          onChange={(e) => setPmEditProduct((prev) => ({ ...prev, material: e.target.value }))}
                          style={inputStyle}
                        />
                        <div style={{ display: "grid", gap: 8 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {COLOR_PALETTE.map((swatch) => (
                              <button
                                key={swatch.name}
                                type="button"
                                onClick={() =>
                                  setPmEditProduct((prev) => ({
                                    ...prev,
                                    color: swatch.name,
                                  }))
                                }
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: "50%",
                                  border: swatch.name === pmEditProduct.color ? "2px solid #0f172a" : "1px solid #e5e7eb",
                                  background: swatch.hex,
                                  cursor: "pointer",
                                }}
                                aria-label={`Select ${swatch.name}`}
                                title={swatch.name}
                              />
                            ))}
                          </div>
                        </div>
                        <select
                          value={pmEditProduct.warranty}
                          onChange={(e) => setPmEditProduct((prev) => ({ ...prev, warranty: e.target.value }))}
                          style={inputStyle}
                        >
                          <option value="">Warranty (years)</option>
                          {WARRANTY_OPTIONS.map((years) => (
                            <option key={years} value={years}>
                              {years}
                            </option>
                          ))}
                        </select>
                        <div style={{ display: "grid", gap: 6 }}>
                          <input
                            placeholder="Distributor"
                            value={pmEditProduct.distributor}
                            onChange={(e) => setPmEditProduct((prev) => ({ ...prev, distributor: e.target.value }))}
                            style={{ ...inputStyle, background: pmUseSuhomeLogistics ? "#f8fafc" : inputStyle.background }}
                            readOnly={pmUseSuhomeLogistics}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setPmUseSuhomeLogistics((prev) => {
                                const next = !prev;
                                setPmEditProduct((p) => ({
                                  ...p,
                                  distributor: next ? "SUHome Logistics" : "",
                                }));
                                return next;
                              });
                            }}
                            style={{ ...secondaryBtn, padding: "6px 10px", fontSize: "0.85rem" }}
                          >
                            {pmUseSuhomeLogistics ? "Deselect SUHome Logistics" : "Use SUHome Logistics"}
                          </button>
                        </div>
                        <input
                          placeholder="Features"
                          value={pmEditProduct.features}
                          onChange={(e) => setPmEditProduct((prev) => ({ ...prev, features: e.target.value }))}
                          style={inputStyle}
                        />
                        <input
                          placeholder="Image URL"
                          value={pmEditProduct.image}
                          onChange={(e) => setPmEditProduct((prev) => ({ ...prev, image: e.target.value }))}
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button type="button" onClick={handleSavePmEdit} style={primaryBtn}>
                          Save updates
                        </button>
                        {pmEditProduct?.id && (
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = window.confirm("Delete this product? This cannot be undone.");
                              if (!ok) return;
                              const deleted = await handleDeleteProduct(pmEditProduct.id);
                              if (deleted) {
                                setPmEditProductId("");
                                setPmEditProduct(null);
                              }
                            }}
                            style={{ ...primaryBtn, background: "#fee2e2", color: "#b91c1c" }}
                          >
                            Delete product
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {user?.role === "product_manager" && (
                <div
                  ref={pmCostRef}
                  style={{
                    background: "white",
                    borderRadius: 14,
                    padding: 18,
                    boxShadow: "0 14px 30px rgba(0,0,0,0.05)",
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div>
                    <h3 style={{ margin: "0 0 6px", color: "#0f172a" }}>Update product cost</h3>
                    <p style={{ margin: 0, color: "#64748b" }}>
                      Default cost is 50% of sale price when no cost is set.
                    </p>
                  </div>
                  <select
                    value={pmCostProductId}
                    onChange={(e) => {
                      setPmCostProductId(e.target.value);
                      setPmCostInput("");
                    }}
                    style={inputStyle}
                  >
                    <option value="">Select product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                  {pmCostProductId && (
                    <div style={{ display: "grid", gap: 10 }}>
                      {isLoadingPmCost ? (
                        <p style={{ margin: 0, color: "#64748b" }}>Loading cost...</p>
                      ) : (
                        <p style={{ margin: 0, color: "#0f172a", fontWeight: 700 }}>{pmCostCurrentLabel}</p>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
                        <input
                          type="number"
                          placeholder="New cost"
                          value={pmCostInput}
                          onChange={(e) => setPmCostInput(e.target.value)}
                          style={inputStyle}
                        />
                        <button type="button" onClick={handlePmCostUpdate} style={primaryBtn}>
                          Submit cost update
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div
                ref={mainCategoriesRef}
                style={{
                  background: "white",
                  borderRadius: 14,
                  padding: 18,
                  boxShadow: "0 14px 30px rgba(0,0,0,0.05)",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <strong style={{ color: "#0f172a" }}>Main categories</strong>
                  <span style={{ color: "#64748b", fontSize: "0.9rem" }}>
                    {mainCategories.length ? mainCategories.length : MAIN_CATEGORIES.length} available
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(mainCategories.length
                    ? mainCategories
                    : MAIN_CATEGORIES.map((name, idx) => ({ id: `default-main-${idx}`, name }))
                  ).map((category) => (
                    <span
                      key={category.id}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid #e5e7eb",
                        background: "#f8fafc",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        color: "#0f172a",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {category.name}
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input
                    placeholder="Add new main category"
                    value={mainCategoryDraft}
                    onChange={(e) => setMainCategoryDraft(e.target.value)}
                    style={{ ...inputStyle, flex: "1 1 240px" }}
                  />
                  <button
                    type="button"
                    onClick={handleAddMainCategory}
                    disabled={isSavingMainCategory}
                    style={{ ...secondaryBtn, minWidth: 160 }}
                  >
                    {isSavingMainCategory ? "Adding..." : "Add main category"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <select
                    value={removeMainCategoryId}
                    onChange={(e) => setRemoveMainCategoryId(e.target.value)}
                    style={{ ...inputStyle, flex: "1 1 240px" }}
                  >
                    <option value="">Remove main category</option>
                    {mainCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const selected = mainCategories.find((c) => String(c.id) === String(removeMainCategoryId));
                      if (!selected) return;
                      handleDeleteMainCategory(selected, {
                        confirmMessage: `Are you sure you want to remove "${selected.name}"?`,
                      });
                      setRemoveMainCategoryId("");
                    }}
                    disabled={!removeMainCategoryId}
                    style={{ ...secondaryBtn, minWidth: 160 }}
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div
                ref={categoriesRef}
                style={{
                  background: "white",
                  borderRadius: 14,
                  padding: 18,
                  boxShadow: "0 14px 30px rgba(0,0,0,0.05)",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <strong style={{ color: "#0f172a" }}>Categories</strong>
                  <span style={{ color: "#64748b", fontSize: "0.9rem" }}>
                    {categories.length ? categories.length : PRODUCT_CATEGORIES.length} available
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(categories.length ? categories : PRODUCT_CATEGORIES.map((name, idx) => ({ id: `default-${idx}`, name }))).map((category) => (
                    <span
                      key={category.id}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid #e5e7eb",
                        background: "#f8fafc",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        color: "#0f172a",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {category.name}
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input
                    placeholder="Add new category"
                    value={categoryDraft}
                    onChange={(e) => setCategoryDraft(e.target.value)}
                    style={{ ...inputStyle, flex: "1 1 240px" }}
                  />
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    disabled={isSavingCategory}
                    style={{ ...secondaryBtn, minWidth: 140 }}
                  >
                    {isSavingCategory ? "Adding..." : "Add category"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <select
                    value={removeCategoryId}
                    onChange={(e) => setRemoveCategoryId(e.target.value)}
                    style={{ ...inputStyle, flex: "1 1 240px" }}
                  >
                    <option value="">Remove category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const selected = categories.find((c) => String(c.id) === String(removeCategoryId));
                      if (!selected) return;
                      handleDeleteCategory(selected, {
                        confirmMessage: `Are you sure you want to remove "${selected.name}"?`,
                      });
                      setRemoveCategoryId("");
                    }}
                    disabled={!removeCategoryId}
                    style={{ ...secondaryBtn, minWidth: 140 }}
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "white",
                  borderRadius: 14,
                  padding: 18,
                  boxShadow: "0 14px 30px rgba(0,0,0,0.05)",
                  display: "grid",
                  gap: 12,
                }}
                ref={productListRef}
              >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <h4 style={{ margin: 0 }}>Product list</h4>
                {showLowStockOnly ? (
                  <button type="button" style={linkBtn} onClick={() => setShowLowStockOnly(false)}>
                    Clear low-stock filter
                  </button>
                ) : (
                  <button type="button" style={linkBtn} onClick={() => setShowLowStockOnly(true)}>
                    Show low stock
                  </button>
                )}
              </div>
              <input
                placeholder="Search products"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                style={{
                  ...inputStyle,
                  maxWidth: 360,
                  background: "#eef2f7",
                  borderColor: "#cbd5e1",
                }}
              />
            </div>
            <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                    <th style={th}>Name</th>
                        <th style={th}>Price</th>
                        <th style={th}>Stock</th>
                    <th style={th}>Category</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((p) => (
                    <tr
                      key={p.id}
                      data-product-id={p.id}
                      style={{
                        borderBottom: "1px solid #e5e7eb",
                        background: p.id === highlightedProductId ? "#e0f2fe" : "transparent",
                        transition: "background 0.3s ease",
                      }}
                    >
                      <td style={td}>{p.name}</td>
                      <td style={td}>
                        <div style={{ display: "grid", gap: 2 }}>
                          <span style={{ fontWeight: 700 }}>₺{p.price.toLocaleString("tr-TR")}</span>
                          {p.hasDiscount && (
                            <span style={{ color: "#94a3b8", textDecoration: "line-through", fontSize: "0.85rem" }}>
                              ₺{Number(p.originalPrice || 0).toLocaleString("tr-TR")}
                            </span>
                          )}
                        </div>
                      </td>
                          <td style={td}>{p.availableStock}</td>
                          <td style={td}>{p.category || "General"}</td>
                          <td style={td}>
                            {user?.role === "product_manager" ? (
                              <button type="button" style={linkBtn} onClick={() => handleSelectPmEditProduct(p.id)}>
                                Edit
                              </button>
                            ) : (
                              <button type="button" style={linkBtn} onClick={() => handleEditProduct(p)}>
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {(user?.role === "product_manager" || user?.role === "admin") && (
                <div
                  style={{
                    background: "white",
                    borderRadius: 14,
                    padding: 18,
                    boxShadow: "0 14px 30px rgba(0,0,0,0.05)",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div>
                    <h4 style={{ margin: 0 }}>Review approvals</h4>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.9rem" }}>
                      Approve or reject pending product comments.
                    </p>
                  </div>
                  {pendingReviews.length === 0 ? (
                    <p style={{ margin: 0, color: "#6b7280" }}>No pending reviews.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {pendingReviews.map((rev) => {
                        const productName =
                          rev.product_name ||
                          products.find((p) => Number(p.id) === Number(rev.product_id))?.name ||
                          `Product #${rev.product_id}`;
                        return (
                          <div
                            key={rev.comment_id}
                            style={{
                              border: "1px solid #e5e7eb",
                              borderRadius: 12,
                              padding: 10,
                              display: "grid",
                              gap: 6,
                              background: "#f8fafc",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <p style={{ margin: 0, fontWeight: 700, color: "#0f172a" }}>{productName}</p>
                                <small style={{ color: "#64748b" }}>{rev.user_name || "User"}</small>
                              </div>
                              <div style={{ color: "#f59e0b", fontWeight: 800 }}>
                                {"★".repeat(Number(rev.rating) || 0)}
                                {"☆".repeat(Math.max(0, 5 - (Number(rev.rating) || 0)))}
                              </div>
                            </div>
                            <p style={{ margin: 0, color: "#0f172a" }}>{rev.comment_text}</p>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => handleApproveReview(rev.comment_id)}
                                style={{ ...primaryBtn, flex: 1 }}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectReview(rev.comment_id)}
                                style={{ ...secondaryBtn, flex: 1 }}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div
                style={{
                  background: "white",
                  borderRadius: 14,
                  padding: 18,
                  boxShadow: "0 14px 30px rgba(0,0,0,0.05)",
                }}
              >
                <h4 style={{ margin: "0 0 10px", color: "#0f172a" }}>Delivery list</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 6, marginBottom: 6 }}>
                  {deliveryFilters.map((tab) => {
                    const isActive = deliveryTab === tab.id;
                    const tone = DELIVERY_STATUS_STYLES[tab.id];
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setDeliveryTab(tab.id)}
                        style={{
                          borderRadius: 999,
                          padding: "8px 10px",
                          border: `1px solid ${
                            isActive ? tone?.border || "#0f172a" : tone?.border || "#e5e7eb"
                          }`,
                          background: isActive ? tone?.bg || "#0f172a" : "#f8fafc",
                          color: isActive ? tone?.color || "#fff" : "#0f172a",
                          fontWeight: 700,
                          cursor: "pointer",
                          width: "100%",
                        }}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
                {filteredDeliveries.length === 0 ? (
                  <p style={{ margin: 0, color: "#94a3b8" }}>No deliveries to display for this filter.</p>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {visibleDeliveries.map((d) => (
                      <div
                        key={d.id}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 10,
                          padding: 10,
                          display: "grid",
                          gap: 8,
                          background: expandedDeliveryId === d.id ? "#f8fafc" : "white",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 8,
                          }}
                        >
                          <div>
                            <strong>{d.product}</strong>
                            <p style={{ margin: "2px 0 0", color: "#475569" }}>
                              Delivery ID: {d.orderId}
                            </p>
                            <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: "0.9rem" }}>
                              Customer ID: {d.customerId ?? "N/A"} | Product ID: {d.productId ?? "N/A"} | Qty: {d.quantity} | Total: ₺{d.total.toLocaleString("tr-TR")}
                            </p>
                            <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: "0.9rem" }}>
                              Address: {d.address || "Not provided"}
                            </p>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => setExpandedDeliveryId((prev) => (prev === d.id ? null : d.id))}
                              style={{ ...secondaryBtn, padding: "8px 12px" }}
                            >
                              {expandedDeliveryId === d.id ? "Hide details" : "View details"}
                            </button>
                            <div style={{ display: "grid", gap: 6, minWidth: 180 }}>
                              <button
                                type="button"
                                onClick={() => handleInlineStatusClick(d)}
                                style={{
                                  border: `1px solid ${DELIVERY_STATUS_STYLES[d.status]?.border || "#e5e7eb"}`,
                                  background: DELIVERY_STATUS_STYLES[d.status]?.bg || "#f8fafc",
                                  color: DELIVERY_STATUS_STYLES[d.status]?.color || "#0f172a",
                                  padding: "8px 12px",
                                  borderRadius: 10,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                                title="Statusa tıkla ve güncelle"
                              >
                                {d.status}
                              </button>
                              {deliveryStatusPicker === d.id && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {deliveryStatuses.map((status) => {
                                    const label = deliveryFilters.find((f) => f.id === status)?.label || status;
                                    return (
                                      <button
                                        key={status}
                                        type="button"
                                        onClick={() => handleSelectStatusOption(d, status)}
                                        style={{
                                          ...secondaryBtn,
                                          padding: "6px 8px",
                                          flex: "1 1 120px",
                                          borderColor: "#e5e7eb",
                                          background: "#fff",
                                        }}
                                      >
                                        {label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        {expandedDeliveryId === d.id && (() => {
                          const order = getOrderByDeliveryId(d.id);
                          const items = Array.isArray(order?.items) ? order.items : [];
                          const orderTotal = Number(order?.total || 0);
                          const totalQty = items.reduce(
                            (sum, item) => sum + Number(item.qty ?? item.quantity ?? 0),
                            0
                          );
                          const productIds = items
                            .map((item) => item.productId ?? item.id)
                            .filter((value) => value !== undefined && value !== null);
                          const customerId = order?.userId ?? d.customerId ?? "N/A";
                          return (
                            <div
                              style={{
                                borderTop: "1px solid #e5e7eb",
                                paddingTop: 10,
                                display: "grid",
                                gap: 10,
                              }}
                            >
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                                  gap: 8,
                                  color: "#475569",
                                  background: "#f8fafc",
                                  border: "1px solid #e5e7eb",
                                  borderRadius: 10,
                                  padding: 10,
                                }}
                              >
                                <span><strong>Delivery ID:</strong> {d.orderId}</span>
                                <span><strong>Customer ID:</strong> {customerId}</span>
                                <span><strong>Product ID:</strong> {productIds.length ? productIds.join(", ") : "N/A"}</span>
                                <span><strong>Quantity:</strong> {totalQty}</span>
                                <span><strong>Total price:</strong> ₺{orderTotal.toLocaleString("tr-TR")}</span>
                                <span><strong>Delivery status:</strong> {d.status}</span>
                                <span><strong>Delivery address:</strong> {order?.address || d.address || "Not provided"}</span>
                              </div>
                              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", color: "#475569" }}>
                                <span><strong>Shipping:</strong> {order?.shippingCompany || "SUExpress"}</span>
                                <span><strong>Address:</strong> {order?.address || d.address}</span>
                              </div>
                              <div style={{ display: "grid", gap: 8 }}>
                                {items.length === 0 ? (
                                  <p style={{ margin: 0, color: "#94a3b8" }}>No item details available.</p>
                                ) : (
                                  items.map((item) => {
                                    const qty = Number(item.qty ?? item.quantity ?? 1);
                                    const price = Number(item.price || 0);
                                    const lineTotal = price * qty;
                                    return (
                                      <div
                                        key={item.id}
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          flexWrap: "wrap",
                                          gap: 8,
                                          border: "1px solid #e5e7eb",
                                          borderRadius: 10,
                                          padding: "8px 10px",
                                          background: "white",
                                        }}
                                      >
                                        <div>
                                          <strong>{item.name || "Item"}</strong>
                                          <p style={{ margin: "2px 0 0", color: "#475569" }}>
                                            Qty: {qty}
                                          </p>
                                        </div>
                                        <div style={{ textAlign: "right" }}>
                                          <p style={{ margin: 0, fontWeight: 700 }}>₺{price.toLocaleString("tr-TR")}</p>
                                          <small style={{ color: "#475569" }}>Line: ₺{lineTotal.toLocaleString("tr-TR")}</small>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                              <div style={{ textAlign: "right", fontWeight: 800, color: "#0f172a" }}>
                                Order total: ₺{orderTotal.toLocaleString("tr-TR")}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                    {canLoadMoreDeliveries && (
                      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => setDeliveryVisibleCount((prev) => prev + 10)}
                          style={{ ...secondaryBtn, alignItems: "center", display: "inline-flex", gap: 6 }}
                        >
                          ↓ Load more
                        </button>
                        {canLoadLessDeliveries && (
                          <button
                            type="button"
                            onClick={() => setDeliveryVisibleCount((prev) => Math.max(10, prev - 10))}
                            style={{ ...secondaryBtn, alignItems: "center", display: "inline-flex", gap: 6 }}
                          >
                            ↑ Load less
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8, marginTop: 10 }}>
                  <select
                    value={deliveryUpdate.id}
                    onChange={(e) => setDeliveryUpdate((p) => ({ ...p, id: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">Select delivery</option>
                    {deliveries.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.orderId} - {d.product}
                      </option>
                    ))}
                  </select>
                  <select
                    value={deliveryUpdate.status}
                    onChange={(e) => setDeliveryUpdate((p) => ({ ...p, status: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">Status</option>
                    {deliveryStatuses.map((status) => {
                      const tab = deliveryFilters.find((f) => f.id === status);
                      return (
                        <option key={status} value={status}>
                          {tab?.label || status}
                        </option>
                      );
                    })}
                  </select>
                  <button type="button" onClick={handleDeliveryStatus} style={primaryBtn}>
                    Update delivery
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "white",
                  borderRadius: 14,
                  padding: 18,
                  boxShadow: "0 14px 30px rgba(0,0,0,0.05)",
                  display: "grid",
                  gap: 12,
                }}
              >
                <h3 style={{ margin: "0 0 6px", color: "#0f172a" }}>Invoices</h3>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input
                    type="date"
                    value={filters.invoiceFrom}
                    onChange={(e) => setFilters((f) => ({ ...f, invoiceFrom: e.target.value }))}
                    style={inputStyle}
                  />
                  <input
                    type="date"
                    value={filters.invoiceTo}
                    onChange={(e) => setFilters((f) => ({ ...f, invoiceTo: e.target.value }))}
                    style={inputStyle}
                  />
                  <button type="button" onClick={handleLoadInvoices} style={primaryBtn} disabled={isLoadingInvoices}>
                    {isLoadingInvoices ? "Loading..." : "Load invoices"}
                  </button>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {filteredInvoices.map((inv) => (
                    <div
                      key={`${inv.invoice_id}-${inv.order_id}`}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: 12,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, color: "#0f172a" }}>
                          #INV-{String(inv.invoice_id).padStart(5, "0")} / #ORD-{String(inv.order_id).padStart(5, "0")}
                        </p>
                        <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                          {inv.issued_at ? new Date(inv.issued_at).toLocaleDateString("tr-TR") : "Issue date N/A"}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" style={linkBtn} onClick={() => handlePrintInvoice(inv.order_id)}>
                          Print
                        </button>
                        <button type="button" style={linkBtn} onClick={() => handleDownloadInvoice(inv.order_id)}>
                          Save as PDF
                        </button>
                      </div>
                    </div>
                  ))}
                  {!filteredInvoices.length && !isLoadingInvoices && (
                    <p style={{ margin: 0, color: "#94a3b8" }}>No invoices available.</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeSection === "sales" && (
            <section style={{ display: "grid", gap: 18 }}>
              <div
                ref={salesPendingRef}
                style={{ background: "white", borderRadius: 14, padding: 18, boxShadow: "0 14px 30px rgba(0,0,0,0.05)", display: "grid", gap: 12 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, color: "#0f172a" }}>Pending product requests</h3>
                  <span style={{ color: "#94a3b8", fontWeight: 700 }}>{productRequests.length} total</span>
                </div>
                {isLoadingProductRequests && <p style={{ margin: 0, color: "#64748b" }}>Loading product requests...</p>}
                {!isLoadingProductRequests && productRequests.length === 0 && (
                  <p style={{ margin: 0, color: "#94a3b8" }}>No product requests yet.</p>
                )}
                <div style={{ display: "grid", gap: 12 }}>
                  {productRequests.map((req) => (
                    <div
                      key={req.request_id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: 12,
                        background: "#f8fafc",
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div>
                          <strong>{req.name}</strong>
                          <p style={{ margin: "2px 0 0", color: "#64748b" }}>
                            {formatMainCategoryLabel(req.mainCategory)} • {req.category || "General"}
                          </p>
                          <p style={{ margin: "2px 0 0", color: "#64748b" }}>
                            Stock: {req.stock} • Material: {req.material || "N/A"} • Color: {req.color || "N/A"}
                          </p>
                        </div>
                        <small style={{ color: "#94a3b8" }}>
                          {req.requested_at ? new Date(req.requested_at).toLocaleString("tr-TR") : "Date unavailable"}
                        </small>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                        <input
                          type="number"
                          placeholder="Set price"
                          value={publishPrices[req.request_id] ?? ""}
                          onChange={(e) =>
                            setPublishPrices((prev) => ({ ...prev, [req.request_id]: e.target.value }))
                          }
                          min={1}
                          step="1"
                          style={inputStyle}
                        />
                        <button
                          type="button"
                          onClick={() => handlePublishProductRequest(req.request_id)}
                          style={primaryBtn}
                          disabled={publishingRequestId === req.request_id}
                        >
                          {publishingRequestId === req.request_id ? "Publishing..." : "Publish product"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                ref={salesPublishedRef}
                style={{ background: "white", borderRadius: 14, padding: 18, boxShadow: "0 14px 30px rgba(0,0,0,0.05)", display: "grid", gap: 12 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, color: "#0f172a" }}>Published product requests</h3>
                  <span style={{ color: "#94a3b8", fontWeight: 700 }}>{publishedProductRequests.length} total</span>
                </div>
                {isLoadingPublishedRequests && <p style={{ margin: 0, color: "#64748b" }}>Loading published requests...</p>}
                {!isLoadingPublishedRequests && publishedProductRequests.length === 0 && (
                  <p style={{ margin: 0, color: "#94a3b8" }}>No published product requests yet.</p>
                )}
                <div style={{ display: "grid", gap: 12 }}>
                  {publishedProductRequests.map((req) => (
                    <div
                      key={req.request_id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: 12,
                        background: "#f8fafc",
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div>
                          <strong>{req.name}</strong>
                          <p style={{ margin: "2px 0 0", color: "#64748b" }}>
                            {formatMainCategoryLabel(req.mainCategory)} • {req.category || "General"}
                          </p>
                        </div>
                        <span style={{ color: "#0f172a", fontWeight: 700 }}>
                          ₺{Number(req.price || 0).toLocaleString("tr-TR")}
                        </span>
                      </div>
                      <small style={{ color: "#94a3b8" }}>
                        Published: {req.published_at ? new Date(req.published_at).toLocaleString("tr-TR") : "N/A"}
                      </small>
                    </div>
                  ))}
                </div>
              </div>

              <div
                ref={salesReturnsRef}
                style={{ background: "white", borderRadius: 14, padding: 18, boxShadow: "0 14px 30px rgba(0,0,0,0.05)", display: "grid", gap: 12 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, color: "#0f172a" }}>Return requests</h3>
                  <span style={{ color: "#94a3b8", fontWeight: 700 }}>{returnRequests.length} total</span>
                </div>
                {isLoadingReturns && <p style={{ margin: 0, color: "#64748b" }}>Loading return requests...</p>}
                {!isLoadingReturns && returnRequests.length === 0 && (
                  <p style={{ margin: 0, color: "#94a3b8" }}>No return requests yet.</p>
                )}
                <div style={{ display: "grid", gap: 12 }}>
                  {(() => {
  const normalizeStatus = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/-/g, "_")
      .replace(/\s+/g, "_");
  const getOrderStatus = (item) =>
    normalizeStatus(item.order_status ?? item.orderStatus);
  const isRefundWaiting = (status) => status === "refund_waiting" || status === "refundwaiting";
  const isRefunded = (status) => status === "refunded" || status === "refund_accepted" || status === "refundaccepted";
  const isRefundRejected = (status) =>
    status === "refund_rejected" || status === "refundrejected" || status === "not_refunded" || status === "notrefunded";

  const pendingRequests = returnRequests.filter((item) => isRefundWaiting(getOrderStatus(item)));
  const completedRequests = returnRequests.filter((item) => {
    const status = getOrderStatus(item);
    return isRefunded(status) || isRefundRejected(status);
  });
  const renderRequestCard = (item) => {
    const status = getOrderStatus(item);
    const canApprove = isRefundWaiting(status);
    const statusLabel = isRefundWaiting(status)
      ? "Refund Waiting"
      : isRefundRejected(status)
      ? "Refund Rejected"
      : isRefunded(status)
      ? "Refunded"
      : status || "Unknown";

    return (
      <div
        key={item.return_id}
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 12,
          background: "#f8fafc",
          display: "grid",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <strong>{item.product_name}</strong>
            <p style={{ margin: "2px 0 0", color: "#64748b" }}>
              {item.customer_name || `User #${item.user_id}`} - {formatOrderId(item.order_id)}
            </p>
            <p style={{ margin: "2px 0 0", color: "#64748b" }}>
              Qty: {item.quantity} - Unit: ₺{Number(item.unit_price || 0).toLocaleString("tr-TR")}
            </p>
          </div>
          <span
            style={{
              alignSelf: "flex-start",
              padding: "4px 10px",
              borderRadius: 999,
              background: item.return_eligible ? "#dcfce7" : "#fee2e2",
              color: item.return_eligible ? "#166534" : "#b91c1c",
              fontWeight: 700,
              fontSize: "0.85rem",
            }}
          >
            {item.return_eligible ? "Eligible" : "Not eligible"}
          </span>
        </div>
        {item.reason && <p style={{ margin: 0, color: "#0f172a" }}>{item.reason}</p>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <small style={{ color: "#6b7280" }}>
            {item.requested_at ? new Date(item.requested_at).toLocaleString("tr-TR") : "Date unavailable"}
          </small>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canApprove ? (
              <>
                <button
                  type="button"
                  onClick={() => handleReturnStatusUpdate(item.return_id, "refunded")}
                  style={primaryBtn}
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => handleReturnStatusUpdate(item.return_id, "rejected")}
                  style={{ ...primaryBtn, background: "#fee2e2", color: "#b91c1c" }}
                >
                  Reject
                </button>
              </>
            ) : (
              <span style={{ color: "#94a3b8", fontWeight: 700 }}>{statusLabel}</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div style={{ display: "grid", gap: 12 }}>
        <h4 style={{ margin: "6px 0 0", color: "#0f172a" }}>
          Pending requests ({pendingRequests.length})
        </h4>
        {pendingRequests.length === 0 && (
          <p style={{ margin: 0, color: "#94a3b8" }}>No pending requests.</p>
        )}
        {pendingRequests.map(renderRequestCard)}
      </div>
      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <h4 style={{ margin: "6px 0 0", color: "#0f172a" }}>
          Completed requests ({completedRequests.length})
        </h4>
        {completedRequests.length === 0 && (
          <p style={{ margin: 0, color: "#94a3b8" }}>No completed requests.</p>
        )}
        {completedRequests.map(renderRequestCard)}
      </div>
    </>
  );
})()}
                </div>
              </div>

              <div
                ref={salesPriceRef}
                style={{ background: "white", borderRadius: 14, padding: 18, boxShadow: "0 14px 30px rgba(0,0,0,0.05)", display: "grid", gap: 12 }}
              >
                <h3 style={{ margin: "0 0 10px", color: "#0f172a" }}>Price & Discount</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
                  <select
                    value={priceUpdate.productId}
                    onChange={(e) => setPriceUpdate((p) => ({ ...p, productId: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">Select product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="New price"
                    value={priceUpdate.price}
                    onChange={(e) => setPriceUpdate((p) => ({ ...p, price: e.target.value }))}
                    style={inputStyle}
                  />
                  <button type="button" onClick={handlePriceUpdate} style={primaryBtn}>
                    Update price
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginTop: 12 }}>
                  <select
                    value={discountForm.productId}
                    onChange={(e) => setDiscountForm((p) => ({ ...p, productId: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">Select product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Discount %"
                    value={discountForm.rate}
                    onChange={(e) => setDiscountForm((p) => ({ ...p, rate: Number(e.target.value) }))}
                    style={inputStyle}
                  />
                  <input
                    type="date"
                    value={discountForm.startAt}
                    onChange={(e) => setDiscountForm((p) => ({ ...p, startAt: e.target.value }))}
                    style={inputStyle}
                  />
                  <input
                    type="date"
                    value={discountForm.endAt}
                    onChange={(e) => setDiscountForm((p) => ({ ...p, endAt: e.target.value }))}
                    style={inputStyle}
                  />
                  <button type="button" onClick={handleDiscount} style={primaryBtn}>
                    Apply discount
                  </button>
                </div>
              </div>

              <div
                ref={salesInvoicesRef}
                style={{ background: "white", borderRadius: 14, padding: 18, boxShadow: "0 14px 30px rgba(0,0,0,0.05)", display: "grid", gap: 12 }}
              >
                <h3 style={{ margin: "0 0 6px", color: "#0f172a" }}>Invoices (filter)</h3>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <input
                    type="date"
                    value={filters.invoiceFrom}
                    onChange={(e) => setFilters((f) => ({ ...f, invoiceFrom: e.target.value }))}
                    style={inputStyle}
                  />
                  <input
                    type="date"
                    value={filters.invoiceTo}
                    onChange={(e) => setFilters((f) => ({ ...f, invoiceTo: e.target.value }))}
                    style={inputStyle}
                  />
                  <button type="button" onClick={handleLoadInvoices} style={primaryBtn} disabled={isLoadingInvoices}>
                    {isLoadingInvoices ? "Loading..." : "Load invoices"}
                  </button>
                </div>
                <div style={{ display: "grid", gap: 10, marginTop: 6 }}>
                  {filteredInvoices.map((inv) => (
                    <div
                      key={`${inv.invoice_id}-${inv.order_id}`}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 10,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: 700 }}>
                          #INV-{String(inv.invoice_id).padStart(5, "0")} / #ORD-{String(inv.order_id).padStart(5, "0")}
                        </span>
                        <small style={{ color: "#64748b" }}>
                          {inv.issued_at ? new Date(inv.issued_at).toLocaleDateString("tr-TR") : "-"}
                        </small>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700 }}>₺{Number(inv.amount || 0).toLocaleString("tr-TR")}</span>
                        <button type="button" style={linkBtn} onClick={() => handlePrintInvoice(inv.order_id)}>
                          Print
                        </button>
                        <button type="button" style={linkBtn} onClick={() => handleDownloadInvoice(inv.order_id)}>
                          Save as PDF
                        </button>
                      </div>
                    </div>
                  ))}
                  {!filteredInvoices.length && !isLoadingInvoices && (
                    <p style={{ margin: 0, color: "#94a3b8" }}>No invoices available.</p>
                  )}
                </div>
              </div>

              <div
                ref={salesRevenueRef}
                style={{ background: "white", borderRadius: 14, padding: 18, boxShadow: "0 14px 30px rgba(0,0,0,0.05)", display: "grid", gap: 16 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0, color: "#0f172a" }}>Revenue & profit/loss</h3>
                  <button type="button" style={linkBtn} onClick={handleLoadReport} disabled={isLoadingReport}>
                    {isLoadingReport ? "Loading..." : "Refresh report"}
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(220px, 1.2fr)", gap: 16, alignItems: "center" }}>
                  <div style={{ display: "grid", placeItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 220,
                        height: 220,
                        borderRadius: "50%",
                        background: `conic-gradient(${donutBreakdown.primaryColor} 0 ${((donutBreakdown.primaryValue / (donutBreakdown.total || 1)) * 100).toFixed(2)}%, ${donutBreakdown.secondaryColor} ${((donutBreakdown.primaryValue / (donutBreakdown.total || 1)) * 100).toFixed(2)}% 100%)`,
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <div style={{ width: 150, height: 150, borderRadius: "50%", background: "white", display: "grid", placeItems: "center", textAlign: "center", padding: 12 }}>
                        <p style={{ margin: 0, color: "#64748b", fontWeight: 700 }}>{donutBreakdown.title}</p>
                        <strong style={{ fontSize: "1.3rem", color: "#0f172a" }}>
                          ₺{donutBreakdown.total.toLocaleString("tr-TR")}
                        </strong>
                        <small style={{ color: "#94a3b8" }}>100%</small>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 16, color: "#64748b", fontSize: "0.85rem" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: donutBreakdown.primaryColor }} />
                        {donutBreakdown.primaryLabel}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: donutBreakdown.secondaryColor }} />
                        {donutBreakdown.secondaryLabel}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="date"
                        value={reportFilters.from}
                        onChange={(e) => setReportFilters((r) => ({ ...r, from: e.target.value }))}
                        style={inputStyle}
                      />
                      <input
                        type="date"
                        value={reportFilters.to}
                        onChange={(e) => setReportFilters((r) => ({ ...r, to: e.target.value }))}
                        style={inputStyle}
                      />
                      <button type="button" onClick={handleLoadReport} style={primaryBtn} disabled={isLoadingReport}>
                        {isLoadingReport ? "Loading..." : "Load"}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#f8fafc" }}>
                      {reportData.series.length === 0 ? (
                        <p style={{ margin: 0, color: "#94a3b8" }}>No report data yet.</p>
                      ) : (
                        <div style={{ display: "grid", gap: 10 }}>
                          <div style={{ display: "flex", gap: 16, alignItems: "flex-end", justifyContent: "center", minHeight: 160 }}>
                            {(() => {
                              const revenueValue = Number(reportBreakdown.revenue) || 0;
                              const profitValue = Number(reportBreakdown.profit) || 0;
                              const maxValue = Math.max(revenueValue, Math.abs(profitValue), 1);
                              const revenueHeight = Math.max((revenueValue / maxValue) * 140, 6);
                              const profitHeight = Math.max((Math.abs(profitValue) / maxValue) * 140, profitValue === 0 ? 0 : 4);
                              return (
                                <>
                                  <div style={{ textAlign: "center", minWidth: 120 }}>
                                    <div style={{ height: 140, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                                      <div
                                        style={{
                                          width: 60,
                                          height: revenueHeight,
                                          background: "#3b82f6",
                                          borderRadius: 10,
                                        }}
                                        title={`Revenue: ₺${revenueValue.toLocaleString("tr-TR")}`}
                                      />
                                    </div>
                                    <small style={{ color: "#475569", display: "block", marginTop: 6 }}>
                                      Revenue: ₺{revenueValue.toLocaleString("tr-TR")}
                                    </small>
                                  </div>
                                  <div style={{ textAlign: "center", minWidth: 120 }}>
                                    <div style={{ height: 140, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                                      <div
                                        style={{
                                          width: 60,
                                          height: profitHeight,
                                          background: profitValue >= 0 ? "#a855f7" : "#f59e0b",
                                          borderRadius: 10,
                                        }}
                                        title={`${profitValue >= 0 ? "Profit" : "Loss"}: ₺${Math.abs(profitValue).toLocaleString("tr-TR")}`}
                                      />
                                    </div>
                                    <small style={{ color: "#475569", display: "block", marginTop: 6 }}>
                                      {profitValue >= 0 ? "Profit" : "Loss"}: ₺{Math.abs(profitValue).toLocaleString("tr-TR")}
                                    </small>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                          <div style={{ display: "flex", gap: 16, color: "#64748b", fontSize: "0.85rem", justifyContent: "center" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f6" }} />
                              Revenue
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#a855f7" }} />
                              Profit
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
                              Loss
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

            </section>
          )}

          {activeSection === "support" && (
            <section
              style={{
                display: "grid",
                gap: 18,
                gridTemplateColumns: "1fr 1.4fr",
                width: "100%",
                minWidth: 0,
              }}
            >

              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ background: "white", borderRadius: 14, padding: 18, boxShadow: "0 14px 30px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <h3 style={{ margin: "0 0 10px", color: "#0f172a" }}>Active chat queue</h3>
                    {isLoadingChats && <span style={{ color: "#0ea5e9", fontWeight: 700 }}>Syncing...</span>}
                  </div>
                  <div style={{ display: "grid", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => setChatFilter("unclaimed")}
                        style={filterButtonStyle(chatFilter === "unclaimed")}
                      >
                        Unclaimed
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatFilter("mine")}
                        style={filterButtonStyle(chatFilter === "mine")}
                      >
                        My chats
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatFilter("others")}
                        style={filterButtonStyle(chatFilter === "others")}
                      >
                        Claimed by others
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatFilter("all")}
                        style={filterButtonStyle(chatFilter === "all")}
                      >
                        All
                      </button>
                    </div>
                    {[
                      {
                        id: "unclaimed",
                        title: "Unclaimed",
                        items: chats.filter(
                          (chat) =>
                            chat.status === "open" &&
                            !chat.assigned_agent_id &&
                            chat.last_message &&
                            chat.last_message !== "No message yet"
                        ),
                      },
                      {
                        id: "mine",
                        title: "My chats",
                        items: chats.filter(
                          (chat) =>
                            String(chat.assigned_agent_id ?? "") === String(user?.id ?? "") &&
                            chat.last_message &&
                            chat.last_message !== "No message yet"
                        ),
                      },
                      {
                        id: "others",
                        title: "Claimed by others",
                        items: chats.filter(
                          (chat) =>
                            chat.assigned_agent_id &&
                            String(chat.assigned_agent_id ?? "") !== String(user?.id ?? "") &&
                            chat.last_message &&
                            chat.last_message !== "No message yet"
                        ),
                      },
                    ]
                      .filter((section) => {
                        if (chatFilter === "all") return true;
                        return section.id === chatFilter;
                      })
                      .map((section) => (
                      <div key={section.id} style={{ display: "grid", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <h4 style={{ margin: 0, color: "#0f172a" }}>{section.title}</h4>
                          <span style={{ color: "#64748b", fontWeight: 700 }}>
                            {section.items.length}
                          </span>
                        </div>
                        {section.items.length === 0 ? (
                          <p style={{ margin: 0, color: "#6b7280" }}>No chats here yet.</p>
                        ) : (
                          section.items.map((chat) => {
                            const isActive = chat.id === activeConversationId;
                            const isMine = String(chat.assigned_agent_id ?? "") === String(user?.id ?? "");
                            const hasAgent = Boolean(chat.assigned_agent_id);
                            return (
                        <div
                          key={chat.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectConversation(chat.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleSelectConversation(chat.id);
                            }
                          }}
                          style={{
                            textAlign: "left",
                            border: isActive ? "2px solid #0ea5e9" : "1px solid #e5e7eb",
                            background: isActive ? "rgba(14,165,233,0.08)" : "white",
                            borderRadius: 12,
                            padding: 12,
                            cursor: "pointer",
                            display: "grid",
                            gap: 6,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <strong>{resolveCustomerName(chat, user)}</strong>
                              <p style={{ margin: "2px 0 0", color: "#475569" }}>
                                {chat.order_id ? formatOrderId(chat.order_id) : "No order linked"}
                              </p>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {chat.unread_count > 0 && (
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: "#b91c1c",
                                    padding: "4px 10px",
                                    borderRadius: 999,
                                    background: "#fee2e2",
                                    border: "1px solid #fecaca",
                                    fontSize: "0.85rem",
                                  }}
                                >
                                  {chat.unread_count} unread
                                </span>
                              )}
                              <span
                                style={{
                                  fontWeight: 700,
                                  color: chat.status === "closed" ? "#9ca3af" : "#0ea5e9",
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                  background: "rgba(14,165,233,0.12)",
                                  border: "1px solid rgba(14,165,233,0.2)",
                                }}
                              >
                                {chat.status}
                              </span>
                            </div>
                          </div>
                          <p style={{ margin: 0, color: "#0f172a" }}>{chat.last_message}</p>
                          <small style={{ color: isMine ? "#0f766e" : "#64748b" }}>
                            {hasAgent
                              ? isMine
                                ? "Assigned to you"
                                : `Assigned to ${chat.assigned_agent_name || "another agent"}`
                              : "Unclaimed"}
                          </small>
                          <small style={{ color: "#6b7280" }}>
                            Last update: {new Date(chat.last_message_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                          </small>
                          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                            {!hasAgent && chat.status === "open" && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleClaimConversation(chat.id);
                                }}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 8,
                                  border: "1px solid #bfdbfe",
                                  background: "#eff6ff",
                                  color: "#1d4ed8",
                                  cursor: "pointer",
                                  fontWeight: 700,
                                }}
                              >
                                Claim
                              </button>
                            )}
                            {isMine && chat.status === "pending" && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleUnclaimConversation(chat.id);
                                }}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 8,
                                  border: "1px solid #fed7aa",
                                  background: "#fff7ed",
                                  color: "#c2410c",
                                  cursor: "pointer",
                                  fontWeight: 700,
                                }}
                              >
                                Unclaim
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteConversation(chat.id);
                              }}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 8,
                                border: "1px solid #fca5a5",
                                background: "#fef2f2",
                                color: "#b91c1c",
                                cursor: "pointer",
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                          })
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              <div
                style={{
                  background: "white",
                  borderRadius: 14,
                  padding: 18,
                  boxShadow: "0 14px 30px rgba(0,0,0,0.05)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  height: "calc(100vh - 260px)",
                  minHeight: 420,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <h3 style={{ margin: 0, color: "#0f172a" }}>Conversation</h3>
                  <button
                    type="button"
                    onClick={() => setShowCustomerDetails((prev) => !prev)}
                    style={{
                      border: "1px solid #e5e7eb",
                      background: "white",
                      borderRadius: 999,
                      padding: "6px 10px",
                      fontWeight: 700,
                      cursor: "pointer",
                      color: "#0f172a",
                    }}
                  >
                    {showCustomerDetails ? "Hide details" : "Show details"}
                  </button>
                </div>
                {showCustomerDetails && activeConversationId && activeChat && (
                  <div
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      padding: 12,
                      background: "#f8fafc",
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div>
                        <strong style={{ color: "#0f172a" }}>
                          {resolveCustomerName(activeChat, user)}
                        </strong>
                        <p style={{ margin: "4px 0 0", color: "#475569" }}>
                          {activeChat.customer_email || `User #${activeChat.user_id}`}
                        </p>
                        {customerProfile?.address && (
                          <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                            {customerProfile.address}
                          </p>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 12 }}>
                        <div style={{ textAlign: "right" }}>
                          <p
                            style={{
                              margin: 0,
                              color: "#94a3b8",
                              fontSize: "0.75rem",
                              textTransform: "uppercase",
                              letterSpacing: 1,
                            }}
                          >
                            Orders
                          </p>
                          <strong>{customerOrders.length}</strong>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p
                            style={{
                              margin: 0,
                              color: "#94a3b8",
                              fontSize: "0.75rem",
                              textTransform: "uppercase",
                              letterSpacing: 1,
                            }}
                          >
                            Cart
                          </p>
                          <strong>{customerCart.items?.length ?? 0}</strong>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p
                            style={{
                              margin: 0,
                              color: "#94a3b8",
                              fontSize: "0.75rem",
                              textTransform: "uppercase",
                              letterSpacing: 1,
                            }}
                          >
                            Wishlist
                          </p>
                          <strong>{customerWishlist.length}</strong>
                        </div>
                      </div>
                    </div>
                    {isLoadingCustomerInfo ? (
                      <p style={{ margin: 0, color: "#64748b" }}>Loading customer data...</p>
                    ) : (
                      <div style={{ display: "grid", gap: 12 }}>
                        <div>
                          <p style={{ margin: "0 0 6px", color: "#475569", fontWeight: 700 }}>Recent orders</p>
                          {customerOrders.length === 0 ? (
                            <p style={{ margin: 0, color: "#94a3b8" }}>No orders yet.</p>
                          ) : (
                            <div style={{ display: "grid", gap: 6 }}>
                              {customerOrders.slice(0, 3).map((order) => {
                                const deliveryLabel = normalizeDeliveryStatus(resolveDeliveryLabel(order));
                                const isEligible = isReturnEligible(order);
                                return (
                                  <div
                                    key={order.id}
                                    style={{
                                      border: "1px solid #e2e8f0",
                                      borderRadius: 10,
                                      padding: 8,
                                      display: "grid",
                                      gap: 6,
                                    }}
                                  >
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                      <span style={{ color: "#0f172a", fontWeight: 700 }}>
                                        {order.formattedId || formatOrderId(order.id)}
                                      </span>
                                      <span
                                        style={{
                                          padding: "2px 8px",
                                          borderRadius: 999,
                                          fontSize: "0.8rem",
                                          background: "#e0f2fe",
                                          color: "#0369a1",
                                          fontWeight: 700,
                                        }}
                                      >
                                        {order.status}
                                      </span>
                                    </div>
                                    <small style={{ color: "#64748b" }}>Delivery: {deliveryLabel}</small>
                                    {Array.isArray(order.items) && order.items.length > 0 && (
                                      <div style={{ display: "grid", gap: 4 }}>
                                        {order.items.slice(0, 3).map((item) => (
                                          <div
                                            key={item.id}
                                            style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
                                          >
                                            <span style={{ color: "#0f172a" }}>{item.name}</span>
                                            <span
                                              style={{
                                                color: isEligible ? "#166534" : "#b91c1c",
                                                fontWeight: 700,
                                                fontSize: "0.8rem",
                                              }}
                                            >
                                              {isEligible ? "Return eligible" : "Not returnable"}
                                            </span>
                                          </div>
                                        ))}
                                        {order.items.length > 3 && (
                                          <small style={{ color: "#94a3b8" }}>
                                            +{order.items.length - 3} more items
                                          </small>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div>
                          <p style={{ margin: "0 0 6px", color: "#475569", fontWeight: 700 }}>Wishlist items</p>
                          {customerWishlist.length === 0 ? (
                            <p style={{ margin: 0, color: "#94a3b8" }}>No wishlist items.</p>
                          ) : (
                            <div style={{ display: "grid", gap: 6 }}>
                              {customerWishlist.slice(0, 4).map((item) => (
                                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                  <span style={{ color: "#0f172a" }}>{item.name}</span>
                                  {item.price != null && (
                                    <span style={{ color: "#0f172a", fontWeight: 700 }}>
                                      {Number(item.price).toLocaleString("tr-TR")} TL
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <p style={{ margin: "0 0 6px", color: "#475569", fontWeight: 700 }}>Cart items</p>
                          {customerCart.items?.length ? (
                            <div style={{ display: "grid", gap: 6 }}>
                              {customerCart.items.slice(0, 4).map((item) => (
                                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                  <span style={{ color: "#0f172a" }}>
                                    {item.name} × {item.quantity}
                                  </span>
                                  <span style={{ color: "#0f172a", fontWeight: 700 }}>
                                    ₺{Number(item.line_total || 0).toLocaleString("tr-TR")}
                                  </span>
                                </div>
                              ))}
                              {customerCart.items.length > 4 && (
                                <small style={{ color: "#94a3b8" }}>
                                  +{customerCart.items.length - 4} more items
                                </small>
                              )}
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                <span style={{ color: "#475569", fontWeight: 700 }}>Cart total</span>
                                <span style={{ color: "#0f172a", fontWeight: 700 }}>
                                  ₺{Number(customerCart.total || 0).toLocaleString("tr-TR")}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <p style={{ margin: 0, color: "#94a3b8" }}>Cart is empty.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {activeConversationId && !showCustomerDetails ? (
                  <>
                    <div
                      style={{
                        padding: 0,
                        minHeight: 180,
                        flex: 1,
                        overflow: "auto",
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      {chatMessages.map((msg) => (
                        <div
                          key={msg.id}
                          style={{
                            justifySelf: msg.from === "support" ? "flex-end" : "flex-start",
                            background: msg.from === "support" ? "linear-gradient(135deg,#0ea5e9,#2563eb)" : "#f8fafc",
                            color: msg.from === "support" ? "white" : "#0f172a",
                            padding: "10px 12px",
                            borderRadius: msg.from === "support" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                            maxWidth: "80%",
                          }}
                        >
                          <p style={{ margin: 0 }}>{msg.text}</p>
                          {msg.attachments?.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0" }}>
                              {msg.attachments.map((att) => (
                                <a
                                  key={att.id}
                                  href={resolveAttachmentUrl(att, activeChat?.order_id)}
                                  target="_blank"
                                  rel="noreferrer"
                                  download={att.file_name}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "6px 8px",
                                    borderRadius: 10,
                                    background: msg.from === "support" ? "rgba(255,255,255,0.18)" : "#e0f2fe",
                                    color: msg.from === "support" ? "white" : "#0f172a",
                                    textDecoration: "none",
                                    border: msg.from === "support" ? "1px solid rgba(255,255,255,0.2)" : "1px solid #bae6fd",
                                  }}
                                >
                                  📎 <span style={{ fontWeight: 700 }}>{att.file_name}</span>
                                </a>
                              ))}
                            </div>
                          )}
                          <small style={{ opacity: 0.8 }}>
                            {new Date(msg.timestamp).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                          </small>
                        </div>
                      ))}
                      {chatMessages.length === 0 && !isLoadingThread && (
                        <p style={{ margin: 0, color: "#6b7280" }}>No messages yet.</p>
                      )}
                      {isLoadingThread && (
                        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.9rem" }}>Refreshing…</p>
                      )}
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      <textarea
                        value={replyDraft}
                        onChange={(e) => setReplyDraft(e.target.value)}
                        rows={3}
                        placeholder="Write a reply..."
                        style={{ ...inputStyle, minHeight: 90 }}
                      />
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <label
                          style={{
                            ...secondaryBtn,
                            margin: 0,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "8px 10px",
                          }}
                        >
                          📎 Add attachment
                          <input
                            ref={replyFileInputRef}
                            type="file"
                            multiple
                            accept="image/*,.pdf,.doc,.docx,.txt"
                            onChange={handleSelectReplyFiles}
                            style={{ display: "none" }}
                          />
                        </label>
                        {replyFiles.length > 0 && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {replyFiles.map((file) => (
                              <span
                                key={file.name}
                                style={{
                                  ...secondaryBtn,
                                  padding: "6px 10px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                {file.name}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveReplyFile(file.name)}
                                  style={{
                                    border: "none",
                                    background: "transparent",
                                    cursor: "pointer",
                                    color: "#b91c1c",
                                    fontWeight: 900,
                                  }}
                                  aria-label="Remove attachment"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleSendReply}
                        disabled={isSendingReply}
                        style={{
                          ...primaryBtn,
                          opacity: isSendingReply ? 0.7 : 1,
                          cursor: isSendingReply ? "not-allowed" : "pointer",
                        }}
                      >
                        {isSendingReply ? "Sending..." : "Send reply"}
                      </button>
                    </div>
                  </>
                ) : (
                  !showCustomerDetails && (
                    <p style={{ margin: 0, color: "#6b7280" }}>Select a chat from the left to start messaging.</p>
                  )
                )}
              </div>
            </section>
          )}

        </main>
      </div>
    </div>
  );
}

const inputStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "10px 12px",
  width: "100%",
  boxSizing: "border-box",
};

const primaryBtn = {
  border: "none",
  background: "#0058a3",
  color: "white",
  padding: "10px 12px",
  borderRadius: 10,
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryBtn = {
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  color: "#0f172a",
  padding: "10px 12px",
  borderRadius: 10,
  fontWeight: 700,
  cursor: "pointer",
};

const linkBtn = {
  border: "none",
  background: "none",
  color: "#0058a3",
  fontWeight: 700,
  cursor: "pointer",
};

const orderColumnWidths = ["14%", "32%", "14%", "14%", "12%", "14%"];

const th = {
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "normal",
  wordBreak: "break-word",
};
const td = { padding: "10px 12px", whiteSpace: "normal", wordBreak: "break-word" };

export default AdminDashboard;



