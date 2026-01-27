const API_BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "";
const API_URL = `${API_BASE}/api`;

export async function getMainCategories(signal) {
  const res = await fetch(`${API_URL}/main-categories`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error("Main categories fetch failed");
  return res.json();
}

export async function createMainCategory(name) {
  const res = await fetch(`${API_URL}/main-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "Main category create failed");
  }
  return data;
}

export async function deleteMainCategory(categoryId) {
  const res = await fetch(`${API_URL}/main-categories/${encodeURIComponent(categoryId)}`, {
    method: "DELETE",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "Main category delete failed");
  }
  return data;
}
