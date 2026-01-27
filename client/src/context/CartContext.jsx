import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { setInventoryAdjustmentsFromCart } from "../services/localStorageHelpers";

const CartContext = createContext(undefined);
const STORAGE_KEY = "cart";

const buildKey = (user) =>
  user ? `${STORAGE_KEY}:${user.id ?? user.email}` : STORAGE_KEY;

const readCart = (key) => {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Cart storage read failed", error);
    return [];
  }
};

const writeCart = (key, value) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("Cart storage write failed", error);
  }
};

const mergeCarts = (userCart, guestCart) => {
  const map = new Map();

  [...userCart, ...guestCart].forEach((item) => {
    const existing = map.get(item.id);
    if (existing) {
      map.set(item.id, {
        ...existing,
        quantity:
          (Number(existing.quantity) || 0) + (Number(item.quantity) || 0),
      });
    } else {
      map.set(item.id, {
        ...item,
        quantity: Number(item.quantity) || 1,
      });
    }
  });

  return Array.from(map.values());
};

export function CartProvider({ children }) {
  const { user } = useAuth();

  // ilk açılışta sadece guest cart'ı oku
  const [items, setItems] = useState(() => readCart(STORAGE_KEY));

  // user'in önceki değerini tut (login transition'u yakalamak için)
  const prevUserRef = useRef(null);

  // items veya user değişince ilgili key'e yaz
  useEffect(() => {
    const key = buildKey(user);
    writeCart(key, items);
  }, [items, user]);

  useEffect(() => {
    setInventoryAdjustmentsFromCart(items);
  }, [items]);

  // user değişince sepeti yönet
useEffect(() => {
  const prevUser = prevUserRef.current;

  // LOGOUT / guest mode
  if (!user) {
    const guestCart = readCart(STORAGE_KEY);
    setItems(guestCart);
    prevUserRef.current = null;
    return;
  }

  const userKey = buildKey(user);

  // 1) İlk defa login oldu (guest → user geçişi)
  if (!prevUser && user) {
    const guestCart = readCart(STORAGE_KEY);
    // *** ÖNEMLİ: Eski user cart'ı HİÇ dikkate almıyoruz ***
    const merged = guestCart; // sadece guest cart'ı al

    setItems(merged);
    writeCart(userKey, merged); // bunu user'a kaydet
    writeCart(STORAGE_KEY, []); // guest cart temizle
    prevUserRef.current = user;
    return;
  }

  // 2) Zaten loginli user, sayfa yenileme / route değişimi
  const userCart = readCart(userKey);
  setItems(userCart);
  prevUserRef.current = user;
}, [user]);


  // === Cart operations ===

  const addItem = (product, quantity = 1) => {
    const qty = Math.max(1, Number(quantity) || 1);

    setItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: (Number(item.quantity) || 0) + qty,
              }
            : item
        );
      }
      return [...prev, { ...product, quantity: qty }];
    });
  };

  const removeItem = (id) =>
    setItems((prev) => prev.filter((item) => item.id !== id));

  const increment = (id) =>
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, quantity: (Number(item.quantity) || 0) + 1 }
          : item
      )
    );

  const decrement = (id) =>
    setItems((prev) =>
      prev
        .map((item) =>
          item.id === id
            ? {
                ...item,
                quantity: Math.max(
                  0,
                  (Number(item.quantity) || 0) - 1
                ),
              }
            : item
        )
        .filter((item) => (Number(item.quantity) || 0) > 0)
    );

  const clearCart = () => setItems([]);

  const itemCount = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum + (Number(item.quantity) || Number(item.qty) || 0),
        0
      ),
    [items]
  );

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum +
          Number(item.price || 0) *
            (Number(item.quantity) || Number(item.qty) || 0),
        0
      ),
    [items]
  );

  const value = useMemo(
    () => ({
      items,
      subtotal,
      itemCount,
      addItem,
      removeItem,
      increment,
      decrement,
      clearCart,
    }),
    [items, subtotal, itemCount]
  );

  return (
    <CartContext.Provider value={value}>{children}</CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return ctx;
}
