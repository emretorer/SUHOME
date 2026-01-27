import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import {
  addWishlistItem as addWishlistItemApi,
  fetchWishlist,
  removeWishlistItem as removeWishlistItemApi,
} from "../services/wishlistService";

const WishlistContext = createContext(undefined);
const STORAGE_KEY = "wishlist";
const PENDING_KEY = "pending-wishlist";
const GUEST_SUFFIX = "guest";

function buildStorageKey(user) {
  if (user?.id) return `${STORAGE_KEY}:${user.id}`;
  if (user?.email) return `${STORAGE_KEY}:${user.email}`;
  return `${STORAGE_KEY}:${GUEST_SUFFIX}`;
}

function buildPendingKey(user) {
  if (user?.id) return `${PENDING_KEY}:${user.id}`;
  if (user?.email) return `${PENDING_KEY}:${user.email}`;
  return `${PENDING_KEY}:${GUEST_SUFFIX}`;
}

export function WishlistProvider({ children }) {
  const { user } = useAuth();
  const storageKey = buildStorageKey(user);
  const guestPendingKey = buildPendingKey(null);
  const identityKey = user?.id
    ? `id:${user.id}`
    : user?.email
    ? `email:${user.email}`
    : "guest";
  const normalizeWishlistItem = (product) => {
    if (!product?.id) return null;
    return {
      id: String(product.id),
      name: product.name,
      price: product.price,
      image: product.image,
      added_at: product.added_at,
    };
  };

  const [items, setItems] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      const seen = new Set();
      return parsed
        .map((item) => normalizeWishlistItem(item))
        .filter((item) => {
          if (!item || seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
    } catch (error) {
      console.error("Wishlist storage read failed", error);
      return [];
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    } catch (error) {
      console.error("Wishlist storage write failed", error);
    }
  }, [items, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) {
        setItems([]);
        return;
      }
      const seen = new Set();
      const normalized = parsed
        .map((item) => normalizeWishlistItem(item))
        .filter((item) => {
          if (!item || seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
      setItems(normalized);
    } catch (error) {
      console.error("Wishlist storage read failed", error);
      setItems([]);
    }
  }, [storageKey]);

  const numericUserId = Number(user?.id);
  const userEmail = user?.email ? String(user.email).trim() : "";
  const canSync = Number.isFinite(numericUserId) || Boolean(userEmail);

  const queuePendingWishlist = (product) => {
    const normalized = normalizeWishlistItem(product);
    if (!normalized || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(guestPendingKey);
      const pending = raw ? JSON.parse(raw) : [];
      const exists = pending.some((item) => String(item.id) === normalized.id);
      if (exists) return;
      pending.push(normalized);
      window.localStorage.setItem(guestPendingKey, JSON.stringify(pending));
    } catch (error) {
      console.error("Pending wishlist storage failed", error);
    }
  };

  useEffect(() => {
    if (!canSync) return undefined;
    const controller = new AbortController();
    const currentIdentity = identityKey;

    fetchWishlist({ userId: Number.isFinite(numericUserId) ? numericUserId : null, email: userEmail, signal: controller.signal })
      .then((serverItems) => {
        if (currentIdentity !== identityKey) return;
        const normalized = (serverItems || [])
          .map((item) => normalizeWishlistItem({ ...item, id: item.id ?? item.product_id }))
          .filter(Boolean);
        setItems(normalized);
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        console.error("Wishlist fetch failed", error);
      });

    return () => controller.abort();
  }, [canSync, numericUserId, userEmail, identityKey]);

  const addItem = (product) => {
    setItems((prev) => {
      const normalized = normalizeWishlistItem(product);
      if (!normalized) return prev;
      if (prev.some((item) => String(item.id) === normalized.id)) return prev;
      if (canSync) {
        addWishlistItemApi({
          userId: Number.isFinite(numericUserId) ? numericUserId : null,
          email: userEmail,
          productId: normalized.id,
        }).catch((error) => {
          console.error("Wishlist add failed", error);
          setItems((current) => current.filter((item) => String(item.id) !== normalized.id));
        });
      }
      return [...prev, normalized];
    });
  };

  useEffect(() => {
    if (!canSync) return;
    if (typeof window === "undefined") return;
    let pending = [];
    try {
      const raw = window.localStorage.getItem(guestPendingKey);
      pending = raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error("Pending wishlist read failed", error);
    }
    if (!Array.isArray(pending) || pending.length === 0) return;
    window.localStorage.removeItem(guestPendingKey);

    setItems((prev) => {
      const existing = new Set(prev.map((item) => String(item.id)));
      const toAdd = pending.filter((item) => !existing.has(String(item.id)));
      if (!toAdd.length) return prev;
      toAdd.forEach((item) => {
        addWishlistItemApi({
          userId: Number.isFinite(numericUserId) ? numericUserId : null,
          email: userEmail,
          productId: String(item.id),
        }).catch(() => {
          setItems((current) => current.filter((entry) => String(entry.id) !== String(item.id)));
        });
      });
      return [...prev, ...toAdd.map((item) => normalizeWishlistItem(item)).filter(Boolean)];
    });
  }, [canSync, numericUserId, userEmail]);

  const removeItem = (id) => {
    const normalizedId = String(id);
    setItems((prev) => prev.filter((item) => String(item.id) !== normalizedId));
    if (canSync) {
      removeWishlistItemApi({
        userId: Number.isFinite(numericUserId) ? numericUserId : null,
        email: userEmail,
        productId: normalizedId,
      }).catch((error) => {
        console.error("Wishlist remove failed", error);
      });
    }
  };

  const toggleItem = (product) => {
    setItems((prev) => {
      const normalized = normalizeWishlistItem(product);
      if (!normalized) return prev;
      const exists = prev.some((item) => String(item.id) === normalized.id);
      if (exists) {
        if (canSync) {
          removeWishlistItemApi({
            userId: Number.isFinite(numericUserId) ? numericUserId : null,
            email: userEmail,
            productId: normalized.id,
          }).catch((error) => {
            console.error("Wishlist remove failed", error);
            setItems((current) => [...current, normalized]);
          });
        }
        return prev.filter((item) => String(item.id) !== normalized.id);
      }
      if (canSync) {
        addWishlistItemApi({
          userId: Number.isFinite(numericUserId) ? numericUserId : null,
          email: userEmail,
          productId: normalized.id,
        }).catch((error) => {
          console.error("Wishlist add failed", error);
          setItems((current) => current.filter((item) => String(item.id) !== normalized.id));
        });
      }
      return [...prev, normalized];
    });
  };

  const inWishlist = (id) => {
    const normalizedId = String(id);
    return items.some((item) => String(item.id) === normalizedId);
  };

  const value = useMemo(
    () => ({
      items,
      addItem,
      removeItem,
      toggleItem,
      inWishlist,
      queuePendingWishlist,
    }),
    [items]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) {
    throw new Error("useWishlist must be used within a WishlistProvider");
  }
  return ctx;
}
