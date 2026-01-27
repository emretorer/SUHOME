const API_BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "";
const WISHLIST_BASE = `${API_BASE}/api/wishlist`;

async function handleResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error || res.statusText || "Request failed";
    throw new Error(message);
  }
  return data;
}

export async function fetchWishlist({ userId, email, signal }) {
  const params = new URLSearchParams();
  if (userId) params.set("user_id", userId);
  if (email) params.set("email", email);
  const res = await fetch(`${WISHLIST_BASE}?${params.toString()}`, { signal });
  return handleResponse(res);
}

export async function addWishlistItem({ userId, email, productId }) {
  const res = await fetch(WISHLIST_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, email, product_id: productId }),
  });
  return handleResponse(res);
}

export async function removeWishlistItem({ userId, email, productId }) {
  const params = new URLSearchParams();
  if (userId) params.set("user_id", userId);
  if (email) params.set("email", email);
  const res = await fetch(`${WISHLIST_BASE}/${encodeURIComponent(productId)}?${params.toString()}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}
