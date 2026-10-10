"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type Category = { id: string; slug: string; is_active: boolean };
type Variant = { id: string; sku: string; price: string; compare_at_price: string | null; stock_quantity: number };
type Product = {
  id: string;
  slug: string;
  sku: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  primary_image_url: string | null;
  is_active: boolean;
  variants: Variant[];
};
type StockFilter = "all" | "available" | "low" | "out" | "hidden";
type UploadResponse = { url: string; size: number };

type ErrorPayload = {
  detail?: string | Array<{ msg?: string }>;
};

function makeSlug(value: string) {
  const normalized = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${normalized || "item"}-${Date.now().toString(36)}`;
}

function makeSku() {
  return `XV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function readApiError(response: Response) {
  const payload = await response.json().catch(() => null) as ErrorPayload | null;
  if (typeof payload?.detail === "string") return payload.detail;
  if (Array.isArray(payload?.detail)) {
    const message = payload.detail.map((item) => item.msg).filter(Boolean).join(" · ");
    if (message) return message;
  }
  return `${response.status} ${response.statusText}`.trim();
}

function friendlyError(error: unknown, ar: boolean) {
  const raw = error instanceof Error ? error.message : String(error || "");
  const lowered = raw.toLowerCase();
  if (lowered.includes("compare_at_price") || lowered.includes("greater than price")) {
    return ar ? "السعر السابق لازم يكون أعلى من السعر الحالي، أو اتركه فارغاً." : "Previous price must be higher than the current price, or leave it blank.";
  }
  if (lowered.includes("url") || lowered.includes("primary_image_url")) {
    return ar ? "رابط الصورة غير صالح. ارفع الصورة من الجهاز أو استخدم رابط http/https صحيح." : "The image URL is invalid. Upload an image or use a valid http/https URL.";
  }
  if (lowered.includes("category")) {
    return ar ? "تعذر تجهيز الفئة الداخلية للمتجر. أعد المحاولة بعد تحديث الصفحة." : "The internal store category could not be prepared. Refresh and try again.";
  }
  if (lowered.includes("unique") || lowered.includes("duplicate")) {
    return ar ? "في تعارض ببيانات المنتج. أعد المحاولة وسيتم توليد رمز جديد." : "Product data conflicted with an existing item. Try again to generate a new code.";
  }
  return ar ? `تعذر تنفيذ العملية: ${raw || "خطأ غير معروف"}` : `Could not complete the action: ${raw || "Unknown error"}`;
}

function ProductImageField({
  ar,
  defaultValue = "",
  disabled = false,
}: {
  ar: boolean;
  defaultValue?: string;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const body = new FormData();
      body.append("image", file);
      const response = await fetch(`${apiUrl}/admin/uploads/product-image`, {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const result = await response.json() as UploadResponse;
      setUrl(result.url);
    } catch (uploadError) {
      const detail = friendlyError(uploadError, ar);
      setError(detail.includes("تعذر تنفيذ العملية") || detail.includes("Could not complete")
        ? (ar ? "تعذر رفع الصورة. استخدم JPG أو PNG أو WebP بحجم لا يتجاوز 8MB." : "Image upload failed. Use JPG, PNG or WebP up to 8 MB.")
        : detail);
    } finally {
      setUploading(false);
    }
  }

  return <div style={{ display: "grid", gap: ".6rem" }}>
    <input
      name="primary_image_url"
      type="url"
      value={url}
      onChange={(event) => setUrl(event.target.value)}
      placeholder={ar ? "رابط الصورة أو ارفع من جهازك" : "Image URL or upload from your device"}
      disabled={disabled || uploading}
    />
    <label className="secondary-button" style={{ width: "fit-content", cursor: disabled ? "default" : "pointer" }}>
      {uploading ? (ar ? "جارٍ رفع الصورة…" : "Uploading image…") : (ar ? "رفع صورة من الجهاز" : "Upload image")}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        disabled={disabled || uploading}
        onChange={(event) => void upload(event)}
      />
    </label>
    {url && <div
      aria-label={ar ? "معاينة الصورة" : "Image preview"}
      style={{ width: 120, height: 120, borderRadius: 14, background: `center / cover no-repeat url(${url})` }}
    />}
    {error && <small className="form-error">{error}</small>}
  </div>;
}

export function AdminCatalogPromotions({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [imageFieldKey, setImageFieldKey] = useState(0);

  const adminFetch = useCallback(async (path: string, options?: RequestInit) => {
    const response = await fetch(`${apiUrl}/admin${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    });
    if (response.status === 401) {
      setAuthorized(false);
      throw new Error("unauthorized");
    }
    if (!response.ok) throw new Error(await readApiError(response));
    return response.status === 204 ? null : response.json();
  }, []);

  const load = useCallback(async () => {
    try {
      const me = await fetch(`${apiUrl}/auth/admin/me`, { credentials: "include", cache: "no-store" });
      if (!me.ok) { setAuthorized(false); return; }
      setAuthorized(true);
      setProducts(await adminFetch("/products") as Product[]);
    } catch (error) {
      if ((error as Error).message !== "unauthorized") setMessage(friendlyError(error, ar));
    }
  }, [adminFetch, ar]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery = !needle || [product.name_ar, product.name_en, product.sku].some((value) => value.toLowerCase().includes(needle));
      if (!matchesQuery) return false;
      const stock = product.variants[0]?.stock_quantity ?? 0;
      if (filter === "available") return product.is_active && stock > 0;
      if (filter === "low") return product.is_active && stock > 0 && stock <= 5;
      if (filter === "out") return stock === 0;
      if (filter === "hidden") return !product.is_active;
      return true;
    });
  }, [products, query, filter]);

  async function internalCategoryId() {
    let categories = await adminFetch("/categories") as Category[];
    const catalog = categories.find((item) => item.slug === "catalog");
    if (catalog?.is_active) return catalog.id;
    if (catalog) {
      await adminFetch(`/categories/${catalog.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: true }),
      });
      return catalog.id;
    }

    await adminFetch("/categories", {
      method: "POST",
      body: JSON.stringify({ slug: "catalog", name_ar: "المتجر", name_en: "Store" }),
    });
    categories = await adminFetch("/categories") as Category[];
    const created = categories.find((item) => item.slug === "catalog");
    if (!created) throw new Error("category");
    return created.id;
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const nameAr = String(values.name_ar || "").trim();
    const nameEn = String(values.name_en || "").trim() || nameAr;
    const price = Number(values.price);
    const stock = Number(values.stock_quantity);
    const compareText = String(values.compare_at_price || "").trim();
    const compare = compareText ? Number(compareText) : null;

    if (nameAr.length < 2) {
      setMessage(ar ? "اسم القطعة لازم يكون حرفين على الأقل." : "Product name must be at least 2 characters.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setMessage(ar ? "أدخل سعراً صحيحاً أكبر من صفر." : "Enter a valid price greater than zero.");
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      setMessage(ar ? "الكمية لازم تكون رقماً صحيحاً صفر أو أكثر." : "Stock must be a whole number of zero or more.");
      return;
    }
    if (compare !== null && (!Number.isFinite(compare) || compare <= price)) {
      setMessage(ar ? "السعر السابق لازم يكون أعلى من السعر الحالي، أو اتركه فارغاً." : "Previous price must be higher than the current price, or leave it blank.");
      return;
    }

    const sku = makeSku();
    setBusyId("new");
    setMessage("");
    try {
      const categoryId = await internalCategoryId();
      await adminFetch("/products", {
        method: "POST",
        body: JSON.stringify({
          slug: makeSlug(nameEn),
          sku,
          name_ar: nameAr,
          name_en: nameEn,
          description_ar: String(values.description_ar || "").trim() || null,
          description_en: String(values.description_en || "").trim() || null,
          primary_image_url: String(values.primary_image_url || "").trim() || null,
          category_id: categoryId,
          variant: {
            sku,
            title_ar: "أساسي",
            title_en: "Default",
            price,
            compare_at_price: compare,
            stock_quantity: stock,
          },
        }),
      });
      form.reset();
      setImageFieldKey((value) => value + 1);
      setShowAdd(false);
      setMessage(ar ? "تمت إضافة القطعة بنجاح." : "Product added successfully.");
      await load();
    } catch (error) {
      setMessage(friendlyError(error, ar));
    } finally {
      setBusyId(null);
    }
  }

  async function saveProduct(product: Product, form: FormData) {
    const variant = product.variants[0];
    if (!variant) return;
    const price = Number(form.get("price"));
    const stock = Number(form.get("stock_quantity"));
    const compareText = String(form.get("compare_at_price") || "").trim();
    const compare = compareText ? Number(compareText) : null;

    if (compare !== null && compare <= price) {
      setMessage(ar ? "السعر السابق لازم يكون أعلى من السعر الحالي، أو اتركه فارغاً." : "Previous price must be higher than the current price, or leave it blank.");
      return;
    }

    setBusyId(product.id);
    setMessage("");
    try {
      await adminFetch(`/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name_ar: String(form.get("name_ar") || "").trim(),
          name_en: String(form.get("name_en") || form.get("name_ar") || "").trim(),
          description_ar: String(form.get("description_ar") || "").trim() || null,
          description_en: String(form.get("description_en") || "").trim() || null,
          primary_image_url: String(form.get("primary_image_url") || "").trim() || null,
          is_active: form.get("is_active") === "on",
        }),
      });
      await adminFetch(`/variants/${variant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ price, compare_at_price: compare, stock_quantity: stock }),
      });
      setMessage(ar ? "تم حفظ التعديلات." : "Changes saved.");
      await load();
    } catch (error) {
      setMessage(friendlyError(error, ar));
    } finally {
      setBusyId(null);
    }
  }

  async function setStock(product: Product, quantity: number) {
    const variant = product.variants[0];
    if (!variant) return;
    setBusyId(product.id);
    setMessage("");
    try {
      await adminFetch(`/variants/${variant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ stock_quantity: Math.max(0, quantity) }),
      });
      await load();
    } catch (error) {
      setMessage(friendlyError(error, ar));
    } finally {
      setBusyId(null);
    }
  }

  async function changeStock(product: Product, delta: number) {
    const variant = product.variants[0];
    if (!variant) return;
    await setStock(product, variant.stock_quantity + delta);
  }

  async function toggleVisibility(product: Product) {
    setBusyId(product.id);
    setMessage("");
    try {
      await adminFetch(`/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !product.is_active }),
      });
      await load();
    } catch (error) {
      setMessage(friendlyError(error, ar));
    } finally {
      setBusyId(null);
    }
  }

  if (authorized === null) return <main className="content-page shell"><p>{ar ? "جارٍ التحميل…" : "Loading…"}</p></main>;
  if (!authorized) return <main className="content-page shell"><h1>{ar ? "المنتجات والمخزون" : "Products & inventory"}</h1><p>{ar ? "سجل دخول الإدارة أولاً." : "Sign in to admin first."}</p><Link className="primary-button" href={`/${locale}/admin`}>{ar ? "دخول الإدارة" : "Admin sign in"}</Link></main>;

  const lowStock = products.filter((item) => item.is_active && (item.variants[0]?.stock_quantity ?? 0) > 0 && (item.variants[0]?.stock_quantity ?? 0) <= 5).length;
  const outOfStock = products.filter((item) => (item.variants[0]?.stock_quantity ?? 0) === 0).length;
  const filters: { key: StockFilter; ar: string; en: string }[] = [
    { key: "all", ar: "الكل", en: "All" },
    { key: "available", ar: "متوفر", en: "Available" },
    { key: "low", ar: "مخزون منخفض", en: "Low stock" },
    { key: "out", ar: "نفد", en: "Out of stock" },
    { key: "hidden", ar: "مخفي", en: "Hidden" },
  ];

  return <main className="content-page shell commerce-page">
    <p className="eyebrow">XVOND VAULT ADMIN</p>
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
      <div>
        <h1>{ar ? "المنتجات والمخزون" : "Products & inventory"}</h1>
        <p>{ar ? "إدارة المنتجات من داخل اللوحة بدون الحاجة لاستخدام زر رجوع المتصفح." : "Manage products inside the admin panel without relying on the browser back button."}</p>
      </div>
      <div style={{ display: "flex", gap: ".65rem", flexWrap: "wrap" }}>
        <Link className="secondary-button" href={`/${locale}/admin`}>{ar ? "← لوحة التحكم" : "← Control center"}</Link>
        <button className="primary-button" type="button" onClick={() => setShowAdd((value) => !value)}>{showAdd ? (ar ? "إغلاق الإضافة" : "Close add form") : (ar ? "+ إضافة قطعة" : "+ Add product")}</button>
      </div>
    </div>

    {message && <p className="admin-message">{message}</p>}

    <div className="admin-kpis" style={{ marginBlock: "1.5rem" }}>
      <article><span>{ar ? "كل القطع" : "All products"}</span><strong>{products.length}</strong></article>
      <article><span>{ar ? "ظاهرة للبيع" : "Visible"}</span><strong>{products.filter((item) => item.is_active).length}</strong></article>
      <article><span>{ar ? "مخزون منخفض" : "Low stock"}</span><strong>{lowStock}</strong></article>
      <article><span>{ar ? "نفد المخزون" : "Out of stock"}</span><strong>{outOfStock}</strong></article>
    </div>

    {showAdd && <form className="checkout-form" onSubmit={(event) => void createProduct(event)} style={{ marginBottom: "1.5rem" }}>
      <h2>{ar ? "إضافة قطعة جديدة" : "Add a new product"}</h2>
      <div className="form-grid">
        <input name="name_ar" minLength={2} placeholder={ar ? "اسم القطعة" : "Product name"} required />
        <input name="name_en" minLength={2} placeholder={ar ? "الاسم بالإنجليزية (اختياري)" : "English name (optional)"} />
        <input name="price" type="number" step="0.001" min="0.001" placeholder={ar ? "السعر الحالي OMR" : "Current price OMR"} required />
        <input name="stock_quantity" type="number" step="1" min="0" placeholder={ar ? "الكمية المتوفرة" : "Stock quantity"} required />
        <input name="compare_at_price" type="number" step="0.001" min="0.001" placeholder={ar ? "السعر السابق - لازم أعلى من الحالي (اختياري)" : "Previous price - must be higher (optional)"} />
        <ProductImageField key={imageFieldKey} ar={ar} disabled={busyId === "new"} />
        <textarea name="description_ar" placeholder={ar ? "وصف القطعة (اختياري)" : "Description (optional)"} />
        <textarea name="description_en" placeholder={ar ? "الوصف بالإنجليزية (اختياري)" : "English description (optional)"} />
      </div>
      <div style={{ display: "flex", gap: ".65rem", flexWrap: "wrap" }}>
        <button className="primary-button" disabled={busyId === "new"}>{busyId === "new" ? (ar ? "جارٍ الإضافة…" : "Adding…") : (ar ? "إضافة للمتجر" : "Add to store")}</button>
        <button className="secondary-button" type="button" disabled={busyId === "new"} onClick={() => { setShowAdd(false); setMessage(""); }}>{ar ? "إلغاء" : "Cancel"}</button>
      </div>
    </form>}

    <div style={{ display: "grid", gap: ".75rem", marginBottom: "1rem" }}>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "ابحث باسم القطعة…" : "Search products…"} style={{ width: "100%", maxWidth: 480 }} />
      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
        {filters.map((item) => <button key={item.key} type="button" className={filter === item.key ? "primary-button" : "secondary-button"} onClick={() => setFilter(item.key)}>{ar ? item.ar : item.en}</button>)}
      </div>
    </div>

    <div className="admin-cards">
      {filtered.map((product) => {
        const variant = product.variants[0];
        const stock = variant?.stock_quantity ?? 0;
        return <article key={product.id} style={{ alignItems: "stretch", gap: "1rem", opacity: busyId === product.id ? .65 : 1 }}>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", minWidth: 0 }}>
            <div aria-label={ar ? product.name_ar : product.name_en} style={{ width: 82, height: 82, borderRadius: 14, flex: "0 0 auto", background: product.primary_image_url ? `center / cover no-repeat url(${product.primary_image_url})` : "var(--surface-2, #eee)" }} />
            <div style={{ minWidth: 0 }}>
              <strong>{ar ? product.name_ar : product.name_en}</strong>
              <small style={{ display: "block" }}>{variant ? `${variant.price} OMR` : "—"}</small>
              <small style={{ display: "block" }}>{product.is_active ? (ar ? "ظاهر للبيع" : "Visible") : (ar ? "مخفي" : "Hidden")}</small>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
            <strong>{ar ? `المخزون: ${stock}` : `Stock: ${stock}`}</strong>
            <button className="table-button" type="button" disabled={!variant || busyId === product.id || stock === 0} onClick={() => void changeStock(product, -1)}>−1</button>
            <button className="table-button" type="button" disabled={!variant || busyId === product.id} onClick={() => void changeStock(product, 1)}>+1</button>
            <button className="table-button" type="button" disabled={!variant || busyId === product.id || stock === 0} onClick={() => void setStock(product, 0)}>{ar ? "نفد المخزون" : "Out of stock"}</button>
            <button className="secondary-button" type="button" disabled={busyId === product.id} onClick={() => void toggleVisibility(product)}>{product.is_active ? (ar ? "إخفاء" : "Hide") : (ar ? "إظهار" : "Show")}</button>
          </div>
          <details style={{ width: "100%" }}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>{ar ? "تعديل التفاصيل" : "Edit details"}</summary>
            {variant && <form action={async (form) => saveProduct(product, form)} className="checkout-form" style={{ marginTop: "1rem" }}>
              <div className="form-grid">
                <input name="name_ar" minLength={2} defaultValue={product.name_ar} required />
                <input name="name_en" minLength={2} defaultValue={product.name_en} />
                <input name="price" type="number" step="0.001" min="0.001" defaultValue={variant.price} required />
                <input name="stock_quantity" type="number" step="1" min="0" defaultValue={stock} required />
                <input name="compare_at_price" type="number" step="0.001" min="0.001" defaultValue={variant.compare_at_price || ""} placeholder={ar ? "السعر السابق - أعلى من الحالي" : "Previous price - higher than current"} />
                <ProductImageField ar={ar} defaultValue={product.primary_image_url || ""} disabled={busyId === product.id} />
                <textarea name="description_ar" defaultValue={product.description_ar || ""} placeholder={ar ? "الوصف" : "Description"} />
                <textarea name="description_en" defaultValue={product.description_en || ""} placeholder={ar ? "الوصف بالإنجليزية" : "English description"} />
              </div>
              <label style={{ display: "flex", gap: ".5rem", alignItems: "center" }}><input name="is_active" type="checkbox" defaultChecked={product.is_active} /> {ar ? "ظاهر للبيع" : "Visible for sale"}</label>
              <button className="primary-button" disabled={busyId === product.id}>{ar ? "حفظ" : "Save"}</button>
            </form>}
          </details>
        </article>;
      })}
      {!filtered.length && <article><p>{ar ? "ما في منتجات مطابقة." : "No matching products."}</p></article>}
    </div>
  </main>;
}
