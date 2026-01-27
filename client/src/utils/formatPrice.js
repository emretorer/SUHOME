const DEFAULT_LOCALE = "tr-TR";
const DEFAULT_CURRENCY = "TRY";

// Format numbers as currency with safe fallbacks.
export function formatPrice(value, options = {}) {
  const {
    locale = DEFAULT_LOCALE,
    currency = DEFAULT_CURRENCY,
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
    fallback = "₺0",
  } = options;

  const amount = Number(value);
  if (!Number.isFinite(amount)) return fallback;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount);
}

// Convenience for ranges (e.g., ₺1.200 - ₺1.800)
export function formatPriceRange(min, max, options) {
  const left = formatPrice(min, options);
  const right = formatPrice(max, options);

  if (max === undefined || max === null || Number(min) === Number(max)) {
    return left;
  }

  return `${left} - ${right}`;
}
