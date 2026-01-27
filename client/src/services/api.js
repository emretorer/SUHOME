import { updateJSON } from "../utils/storage";
const API_BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "";
const API_URL = `${API_BASE}/api`;


// Tum urunleri getir
export async function getProducts(signal) {
  const res = await fetch(`${API_URL}/products`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error("Products fetch failed");
  return res.json();
}

// ID ile urun getir
export async function getProductById(id, signal) {
  const res = await fetch(`${API_URL}/products/${id}`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error("Product fetch failed");
  return res.json();
}

// STOCK UPDATE
export async function updateStock(id, amount) {
  try {
    const res = await fetch(`${API_URL}/products/${id}/stock`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });

    if (!res.ok) {
      let data = {};
      try {
        data = await res.json();
      } catch (e) {}

      // backendten "Not enough stock" gelirse onu firlat
      throw new Error(data.error || "Stock update failed");
    }

    return await res.json(); // { success: true }
  } catch {
    const delta = -Number(amount || 0);
    updateJSON("inventory-adjustments", (current = {}) => {
      const next = { ...current };
      const currentValue = Number(next[id] || 0);
      next[id] = Math.max(0, currentValue + delta);
      return next;
    }, {});
    return { success: true, mocked: true };
  }
}
