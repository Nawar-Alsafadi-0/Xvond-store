import type { Locale } from "./i18n";

export type Category = {
  id: string;
  slug: string;
  label: { ar: string; en: string };
  description: { ar?: string; en?: string };
};

export const STORE_CATEGORIES: Category[] = [
  {
    "id": "department-electronics",
    "slug": "electronics",
    "label": {
      "ar": "تقنية وإكسسوارات",
      "en": "Tech & Accessories"
    },
    "description": {
      "ar": "أجهزة صغيرة، صوتيات، شواحن وإكسسوارات تقنية لحياتك اليومية.",
      "en": "Small devices, audio, chargers and everyday tech accessories."
    }
  },
  {
    "id": "department-women",
    "slug": "women",
    "label": {
      "ar": "للنساء",
      "en": "For Women"
    },
    "description": {
      "ar": "أجهزة العناية والجمال وإكسسوارات تقنية مختارة للنساء.",
      "en": "Personal care devices, beauty tools and selected tech accessories for women."
    }
  },
  {
    "id": "department-kids",
    "slug": "kids",
    "label": {
      "ar": "للأطفال",
      "en": "For Kids"
    },
    "description": {
      "ar": "ألعاب إلكترونية وأدوات تعليم تفاعلية وأجهزة مناسبة للأطفال.",
      "en": "Electronic toys, interactive learning tools and devices for children."
    }
  },
  {
    "id": "department-automotive",
    "slug": "automotive",
    "label": {
      "ar": "للسيارة",
      "en": "For Your Car"
    },
    "description": {
      "ar": "شواحن وكاميرات وحساسات وإكسسوارات إلكترونية للسيارة.",
      "en": "Car chargers, cameras, sensors and electronic accessories."
    }
  },
  {
    "id": "department-luxury-gifts",
    "slug": "luxury-gifts",
    "label": {
      "ar": "هدايا مميزة",
      "en": "Gift Ideas"
    },
    "description": {
      "ar": "منتجات تقنية مختارة للإهداء في المناسبات المختلفة.",
      "en": "Selected tech gifts for different occasions."
    }
  },
  {
    "id": "department-xvond-box",
    "slug": "xvond-box",
    "label": {
      "ar": "صناديق هدايا",
      "en": "Gift Boxes"
    },
    "description": {
      "ar": "بوكسات تجمع منتجات متناسقة حول فكرة أو استخدام محدد.",
      "en": "Boxes combining complementary products around a theme or use."
    }
  }
];

export type ProductVariant = {
  id: string;
  sku: string;
  title: { ar: string; en: string };
  price: number;
  previousPrice?: number;
  stock: number;
};

export type Product = {
  id: string;
  slug: string;
  sku: string;
  category: string;
  name: { ar: string; en: string };
  description: { ar?: string; en?: string };
  price: number;
  previousPrice?: number;
  image: string;
  variantId?: string;
  variantTitle?: { ar: string; en: string };
  stock: number;
  variants: ProductVariant[];
};

type ApiCategory = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar?: string | null;
  description_en?: string | null;
};

type ApiVariant = {
  id: string;
  sku: string;
  title_ar: string;
  title_en: string;
  price: string | number;
  compare_at_price?: string | number | null;
  stock_quantity: number;
};

type ApiProduct = {
  id: string;
  slug: string;
  sku: string;
  name_ar: string;
  name_en: string;
  description_ar?: string | null;
  description_en?: string | null;
  primary_image_url?: string | null;
  category: ApiCategory;
  variants: ApiVariant[];
};

export type ProductFilters = {
  category?: string;
  query?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: boolean;
  sort?: "newest" | "price-asc" | "price-desc";
  limit?: number;
  offset?: number;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const FALLBACK_IMAGE = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/product-placeholder.svg`;

function toCategory(category: ApiCategory): Category {
  return {
    id: category.id,
    slug: category.slug,
    label: { ar: category.name_ar, en: category.name_en },
    description: {
      ar: category.description_ar ?? undefined,
      en: category.description_en ?? undefined,
    },
  };
}

export function validPreviousPrice(price: number, compareAtPrice?: string | number | null): number | undefined {
  if (compareAtPrice == null) return undefined;
  const previousPrice = Number(compareAtPrice);
  if (!Number.isFinite(previousPrice) || previousPrice <= price) return undefined;
  return previousPrice;
}

function mapVariant(variant: ApiVariant): ProductVariant {
  const price = Number(variant.price);
  return {
    id: variant.id,
    sku: variant.sku,
    title: { ar: variant.title_ar, en: variant.title_en },
    price,
    previousPrice: validPreviousPrice(price, variant.compare_at_price),
    stock: variant.stock_quantity,
  };
}

function toProduct(product: ApiProduct): Product {
  const variants = product.variants.map(mapVariant);
  const defaultVariant = variants.find((variant) => variant.stock > 0) ?? variants[0];
  return {
    id: product.id,
    slug: product.slug,
    sku: defaultVariant?.sku ?? product.sku,
    category: product.category.slug,
    name: { ar: product.name_ar, en: product.name_en },
    description: {
      ar: product.description_ar ?? undefined,
      en: product.description_en ?? undefined,
    },
    price: defaultVariant?.price ?? 0,
    previousPrice: defaultVariant?.previousPrice,
    image: product.primary_image_url || FALLBACK_IMAGE,
    variantId: defaultVariant?.id,
    variantTitle: defaultVariant?.title,
    stock: variants.reduce((total, item) => total + item.stock, 0),
    variants,
  };
}

export function productWithVariant(product: Product, variantId: string): Product {
  const variant = product.variants.find((item) => item.id === variantId);
  if (!variant) return product;
  return {
    ...product,
    sku: variant.sku,
    price: variant.price,
    previousPrice: variant.previousPrice,
    variantId: variant.id,
    variantTitle: variant.title,
    stock: variant.stock,
  };
}

async function apiFetch<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function getCategories(): Promise<Category[]> {
  const data = await apiFetch<ApiCategory[]>("/catalog/categories");
  if (!data) return STORE_CATEGORIES;
  const live = data.map(toCategory);
  const bySlug = new Map(live.map((category) => [category.slug, category]));
  return STORE_CATEGORIES.map((fallback) => ({ ...(bySlug.get(fallback.slug) ?? fallback), label: fallback.label, description: fallback.description }))
    .concat(live.filter((category) => !STORE_CATEGORIES.some((fallback) => fallback.slug === category.slug)));
}

export async function getProducts(filters: ProductFilters = {}): Promise<Product[]> {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.query) params.set("query", filters.query);
  if (filters.minPrice) params.set("min_price", filters.minPrice);
  if (filters.maxPrice) params.set("max_price", filters.maxPrice);
  if (filters.inStock) params.set("in_stock", "true");
  if (filters.sort) params.set("sort", filters.sort);
  params.set("limit", String(filters.limit ?? 24));
  if (filters.offset) params.set("offset", String(filters.offset));
  const data = await apiFetch<ApiProduct[]>(`/catalog/products?${params}`);
  return data?.map(toProduct) ?? [];
}

export async function getProduct(slug: string): Promise<Product | null> {
  const data = await apiFetch<ApiProduct>(`/catalog/products/${encodeURIComponent(slug)}`);
  return data ? toProduct(data) : null;
}

export const formatPrice = (price: number, locale: Locale) =>
  new Intl.NumberFormat(locale === "ar" ? "ar-OM" : "en-OM", {
    style: "currency",
    currency: "OMR",
    minimumFractionDigits: 3,
  }).format(price);
