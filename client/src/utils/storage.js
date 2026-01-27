const hasStorage =
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const isProd =
  typeof process !== "undefined" && process.env?.NODE_ENV === "production";

const logError = (message, error) => {
  if (!isProd) {
    console.error(message, error);
  }
};

export function getJSON(key, fallback = null) {
  if (!hasStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    logError("Storage read failed", error);
    return fallback;
  }
}

export function setJSON(key, value) {
  if (!hasStorage) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    logError("Storage write failed", error);
    return false;
  }
}

export function removeItem(key) {
  if (!hasStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    logError("Storage remove failed", error);
  }
}

// Utility to create user/guest scoped keys from a base name.
export function buildStorageKey(base, userLike) {
  if (!userLike) return base;
  const suffix = userLike.id ?? userLike.email ?? userLike;
  return suffix ? `${base}:${suffix}` : base;
}

// Atomically read-update-write a JSON payload.
export function updateJSON(key, updater, fallback = null) {
  const current = getJSON(key, fallback);
  const next = updater(current);
  setJSON(key, next);
  return next;
}
