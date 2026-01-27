const API_BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "";
const API_URL = `${API_BASE}/api`;

export async function getCategories(signal) {
  const res = await fetch(`${API_URL}/categories`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error("Categories fetch failed");
  return res.json();
}

export async function createCategory(name) {
  const res = await fetch(`${API_URL}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "Category create failed");
  }
  return data;
}

export async function deleteCategory(categoryId) {
  const res = await fetch(`${API_URL}/categories/${encodeURIComponent(categoryId)}`, {
    method: "DELETE",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "Category delete failed");
  }
  return data;
}
