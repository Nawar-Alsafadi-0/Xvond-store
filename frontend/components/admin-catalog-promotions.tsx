"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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

type Filter = "all" | "available" | "low" | "out" | "hidden";

function makeSlug(value: string) {
  const normalized = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${normalized || "item"}-${Date.now().toString(36)}`;
}

function makeSku() {
  return `XV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function AdminCatalogPromotions({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

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
    if (!response.ok) throw new Error(await response.text());
    return response.status === 204 ? null : response.json();
  }, []);

  const load = useCallback(async () => {
    try {
      const me = await fetch(`${apiUrl}/auth/admin/me`, { credentials: "include", cache: "no-store" });
      if (!me.ok) { setAuthorized(false); return; }
      setAuthorized(true);
      setProducts(await adminFetch("/products") as Product[]);
    } catch (error) {
      if ((error as Error).message !== "unauthorized") setMessage(ar ? "تعذر تحميل المنتجات." : "Could not load products.");
    }
  }, [adminFetch, ar]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      const stock = product.variants[0]?.stock_quantity ?? 0;
      const matchesQuery = !needle || [product.name_ar, product.name_en, product.sku]
        .some((value) => value.toLowerCase().includes(needle));
      const matchesFilter = filter === "all"
        || (filter === "available" && product.is_active && stock > 0)
        || (filter === "low" && product.is_active && stock > 0 && stock <= 5)
        || (filter === "out" && stock === 0)
        || (filter === "hidden" && !product.is_active);
      return matchesQuery && matchesFilter;
    });
  }, [filter, products, query]);

  async function internalCategoryId() {
    let categories = await adminFetch("/categories") as Category[];
    const active = categories.find((item) => item.is_active);
    if (active) return active.id;
    await adminFetch("/categories", {
      method: "POST",
      body: JSON.stringify({ slug: `catalog-${Date.now().toString(36)}`, name_ar: "المتجر", name_en: "Store" }),
    });
    categories = await adminFetch("/categories") as Category[];
    const created = categories.find((item) => item.is_active);
    if (!created) throw new Error("category");
    return created.id;
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const nameAr = String(values.name_ar).trim();
    const nameEn = String(values.name_en || "").trim() || nameAr;
    const sku = makeSku();
    setBusyId("new"); setMessage("");
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
            price: Number(values.price),
            compare_at_price: null,
            stock_quantity: Number(values.stock_quantity),
          },
        }),
      });
      form.reset();
      setShowAdd(false);
      setMessage(ar ? "تمت إضافة القطعة." : "Product added.");
      await load();
    } catch {
      setMessage(ar ? "تعذر إضافة القطعة. راجع السعر أو رابط الصورة." : "Could not add the product. Check price or image URL.");
    } finally { setBusyId(null); }
  }

  async function saveProduct(product: Product, form: FormData) {
    const variant = product.variants[0];
    if (!variant) return;
    setBusyId(product.id); setMessage("");
    try {
      await adminFetch(`/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name_ar: String(form.get("name_ar")),
          name_en: String(form.get("name_en") || form.get("name_ar")),
          description_ar: String(form.get("description_ar") || "").trim() || null,
          description_en: String(form.get("description_en") || "").trim() || null,
          primary_image_url: String(form.get("primary_image_url") || "").trim() || null,
          is_active: product.is_active,
        }),
      });
      await adminFetch(`/variants/${variant.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          price: Number(form.get("price")),
          stock_quantity: Number(form.get("stock_quantity")),
        }),
      });
      setMessage(ar ? "تم حفظ التعديلات." : "Changes saved.");
      await load();
    } catch {
      setMessage(ar ? "تعذر حفظ المنتج." : "Could not save product.");
    } finally { setBusyId(null); }
  }

  async function setStock(product: Product, quantity: number) {
    const variant = product.variants[0];
    if (!variant) return;
    setBusyId(product.id); setMessage("");
    try {
      await adminFetch(`/inventory/${encodeURIComponent(variant.sku)}?quantity=${Math.max(0, quantity)}`, { method: "PATCH" });
      await load();
    } catch {
      setMessage(ar ? "تعذر تعديل المخزون." : "Could not update stock.");
    } finally { setBusyId(null); }
  }

  async function toggleVisibility(product: Product) {
    setBusyId(product.id); setMessage("");
    try {
      await adminFetch(`/products/${product.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !product.is_active }) });
      await load();
    } catch {
      setMessage(ar ? "تعذر تغيير حالة المنتج." : "Could not change product visibility.");
    } finally { setBusyId(null); }
  }

  if (authorized === null) return <main className="content-page shell"><p>{ar ? "جارٍ التحميل…" : "Loading…"}</p></main>;
  if (!authorized) return <main className="content-page shell"><h1>{ar ? "المنتجات والمخزون" : "Products & inventory"}</h1><p>{ar ? "سجل دخول الإدارة أولاً." : "Sign in to admin first."}</p><Link className="primary-button" href={`/${locale}/admin`}>{ar ? "دخول الإدارة" : "Admin sign in"}</Link></main>;

  const lowStock = products.filter((item) => {
    const stock = item.variants[0]?.stock_quantity ?? 0;
    return item.is_active && stock > 0 && stock <= 5;
  }).length;
  const outOfStock = products.filter((item) => (item.variants[0]?.stock_quantity ?? 0) === 0).length;

  return <main className="content-page shell commerce-page">
    <p className="eyebrow">XVOND STORE ADMIN</p>
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
      <div><h1>{ar ? "المنتجات والمخزون" : "Products & inventory"}</h1><p><Link href={`/${locale}/admin`}>← {ar ? "لوحة التحكم" : "Control center"}</Link></p></div>
      <button className="primary-button" onClick={() => setShowAdd((value) => !value)}>{showAdd ? (ar ? "إغلاق" : "Close") : (ar ? "+ إضافة قطعة" : "+ Add product")}</button>
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
        <input name="name_ar" placeholder={ar ? "اسم القطعة" : "Product name"} required />
        <input name="name_en" placeholder={ar ? "الاسم بالإنجليزية (اختياري)" : "English name (optional)"} />
        <input name="price" type="number" step="0.001" min="0.001" placeholder={ar ? "السعر OMR" : "Price OMR"} required />
        <input name="stock_quantity" type="number" min="0" defaultValue="1" placeholder={ar ? "الكمية المتوفرة" : "Stock quantity"} required />
        <input className="full-field" name="primary_image_url" type="url" placeholder={ar ? "رابط الصورة" : "Image URL"} />
        <textarea name="description_ar" placeholder={ar ? "وصف القطعة (اختياري)" : "Description (optional)"} />
        <textarea name="description_en" placeholder={ar ? "الوصف بالإنجليزية (اختياري)" : "English description (optional)"} />
      </div>
      <button className="primary-button" disabled={busyId === "new"}>{busyId === "new" ? (ar ? "جارٍ الإضافة…" : "Adding…") : (ar ? "إضافة للمتجر" : "Add to store")}</button>
    </form>}

    <div className="form-grid" style={{ marginBottom: "1rem" }}>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "ابحث باسم القطعة…" : "Search products…"} />
      <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
        <option value="all">{ar ? "كل القطع" : "All products"}</option>
        <option value="available">{ar ? "متوفر للبيع" : "Available"}</option>
        <option value="low">{ar ? "مخزون منخفض" : "Low stock"}</option>
        <option value="out">{ar ? "نفد المخزون" : "Out of stock"}</option>
        <option value="hidden">{ar ? "مخفي" : "Hidden"}</option>
      </select>
    </div>

    <div className="admin-cards">
      {filtered.map((product) => {
        const variant = product.variants[0];
        const stock = variant?.stock_quantity ?? 0;
        return <article key={product.id} style={{ alignItems: "stretch", gap: "1rem", opacity: busyId === product.id ? .65 : 1 }}>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", minWidth: 0 }}>
            <div aria-label={ar ? product.name_ar : product.name_en} style={{ width: 82, height: 82, borderRadius: 14, flex: "0 0 auto", background: product.primary_image_url ? `center / cover no-repeat url(${product.primary_image_url})` : "var(--surface-2, #eee)" }} />
            <div style={{ minWidth: 0 }}><strong>{ar ? product.name_ar : product.name_en}</strong><small style={{ display: "block" }}>{variant ? `${variant.price} OMR` : "—"}</small><small style={{ display: "block" }}>{product.is_active ? (ar ? "ظاهر للبيع" : "Visible") : (ar ? "مخفي" : "Hidden")}</small></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
            <strong>{ar ? `المخزون: ${stock}` : `Stock: ${stock}`}</strong>
            <button className="table-button" type="button" disabled={!variant || busyId === product.id || stock === 0} onClick={() => void setStock(product, stock - 1)}>−1</button>
            <button className="table-button" type="button" disabled={!variant || busyId === product.id} onClick={() => void setStock(product, stock + 1)}>+1</button>
            <button className="danger-link" type="button" disabled={!variant || busyId === product.id || stock === 0} onClick={() => void setStock(product, 0)}>{ar ? "نفدت" : "Out of stock"}</button>
            <button className="secondary-button" type="button" disabled={busyId === product.id} onClick={() => void toggleVisibility(product)}>{product.is_active ? (ar ? "إخفاء" : "Hide") : (ar ? "إظهار" : "Show")}</button>
          </div>
          <details style={{ width: "100%" }}><summary style={{ cursor: "pointer", fontWeight: 700 }}>{ar ? "تعديل التفاصيل" : "Edit details"}</summary>
            {variant && <form action={async (form) => saveProduct(product, form)} className="checkout-form" style={{ marginTop: "1rem" }}>
              <div className="form-grid">
                <input name="name_ar" defaultValue={product.name_ar} required />
                <input name="name_en" defaultValue={product.name_en} />
                <input name="price" type="number" step="0.001" min="0.001" defaultValue={variant.price} required />
                <input name="stock_quantity" type="number" min="0" defaultValue={variant.stock_quantity} required />
                <input className="full-field" name="primary_image_url" type="url" defaultValue={product.primary_image_url || ""} placeholder={ar ? "رابط الصورة" : "Image URL"} />
                <textarea name="description_ar" defaultValue={product.description_ar || ""} />
                <textarea name="description_en" defaultValue={product.description_en || ""} />
              </div>
              <button className="primary-button" disabled={busyId === product.id}>{ar ? "حفظ التعديلات" : "Save changes"}</button>
            </form>}
          </details>
        </article>;
      })}
      {!filtered.length && <article><p>{ar ? "ما في قطع مطابقة." : "No matching products."}</p></article>}
    </div>
  </main>;
}
