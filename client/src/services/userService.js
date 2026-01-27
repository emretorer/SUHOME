const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "";

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

export async function updateUserAddress({ userId, address }) {
  const numericId = Number(userId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new Error("Invalid user id");
  }
  const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(numericId)}/address`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  return handle(res);
}

export async function updateUserProfile({ userId, name, address, taxId }) {
  const numericId = Number(userId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new Error("Invalid user id");
  }
  const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(numericId)}/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, address, taxId }),
  });
  return handle(res);
}

export async function fetchUserProfile(userId) {
  const numericId = Number(userId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new Error("Invalid user id");
  }
  const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(numericId)}`);
  return handle(res);
}
