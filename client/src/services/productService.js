import { getProducts, getProductById, updateStock } from "./api.js";
import { getInventoryAdjustments } from "./localStorageHelpers";

const normalizeRating = (product) => {
  const avg =
    Number(product.averageRating ?? product.rating ?? product.product_rating ?? 0) || 0;
  const count =
    Number(product.ratingCount ?? product.rating_count ?? product.product_rating_count ?? 0) ||
    0;

  const averageRating = Number.isFinite(avg) ? Number(avg.toFixed(1)) : 0;

  return {
    averageRating,
    ratingCount: count,
  };
};

function enrichProduct(raw, adjustments) {
  const consumed = adjustments[raw.id] ?? 0;
  const baseStock = Number(raw.stock || 0);
  const availableStock = Math.max(0, baseStock - consumed);

  const { averageRating, ratingCount } = normalizeRating(raw);
  const price = Number(raw.price || 0);
  const originalPrice = Number(raw.originalPrice || 0);
  const hasDiscount = originalPrice > 0 && originalPrice > price;
  const discountLabel = hasDiscount
    ? `-${Math.round(((originalPrice - price) / originalPrice) * 100)}%`
    : undefined;

  return {
    ...raw,
    availableStock,
    averageRating,
    ratingCount,
    hasDiscount,
    discountLabel,
  };
}

// Tum urunleri getir + meta ekle
export async function fetchProductsWithMeta(signal) {
  const rawProducts = await getProducts(signal);
  const adjustments = getInventoryAdjustments();

  return rawProducts.map((p) =>
    enrichProduct(
      {
        id: p.id,
        name: p.name,
        model: p.model,
        serialNumber: p.serialNumber,
        description: p.description,
        price: p.price,
        originalPrice: p.originalPrice,
        stock: p.stock,
        image: p.image,
        category: p.category,
        material: p.material,
        color: p.color,
        mainCategory: Array.isArray(p.mainCategory)
          ? p.mainCategory
          : String(p.mainCategory || "")
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
        warranty: p.warranty,
        distributor: p.distributor,
        rating: p.rating,
        averageRating: p.averageRating,
        ratingCount: p.ratingCount,
      },
      adjustments
    )
  );
}

// ID ile urun getir
export async function fetchProductById(id, signal) {
  const p = await getProductById(id, signal);
  const adjustments = getInventoryAdjustments();

  return enrichProduct(
    {
      id: p.id,
      name: p.name,
      model: p.model,
      serialNumber: p.serialNumber,
      description: p.description,
      price: p.price,
      originalPrice: p.originalPrice,
      stock: p.stock,
      image: p.image,
      category: p.category,
      material: p.material,
      color: p.color,
      mainCategory: Array.isArray(p.mainCategory)
        ? p.mainCategory
        : String(p.mainCategory || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
      warranty: p.warranty,
      distributor: p.distributor,
      rating: p.rating,
      averageRating: p.averageRating,
      ratingCount: p.ratingCount,
    },
    adjustments
  );
}

export { updateStock };
