"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type Category = { id: string; is_active: boolean };
type Variant = { price: string; stock_quantity: number };
type Product = {
  id: string;
  name_ar: string;
  name_en: string;
  primary_image_url: string | null;
  is_active: boolean;
  variants: Variant[];
};
type Discount = { id: string; name: string; discount_type: string; value: string; is_active: boolean };
type Coupon = { id: string; code: string; discount_type: string; value: string; is_active: boolean };
type UploadResponse = { url: string };

function makeSlug(value: string) {
  const normalized = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${normalized || "item"}-${Date.now().toString(36)}`;
}

function makeSku() {
  return `XV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function OperatorCatalog({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [query, setQuery] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const api = useCallback(async <T,>(path: string, options?: RequestInit): Promise<T> => {
    const response = await fetch(`${apiUrl}/admin${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    });
    if (!response.ok) throw new Error(await response.text());
    return (response.status === 204 ? null : await response.json()) as T;
  }, []);

  const load = useCallback(async () => {
    try {
      const [productRows, categoryRows, discountRows, couponRows] = await Promise.all([
        api<Product[]>("/products"),
        api<Category[]>("/categories"),
        api<Discount[]>("/discounts"),
        api<Coupon[]>("/coupons"),
      ]);
      setProducts(productRows);
      setCategories(categoryRows);
      setDiscounts(discountRows);
      setCoupons(couponRows);
      setMessage("");
    } catch {
      setMessage(ar ? "تعذر تحميل بيانات التشغيل." : "Could not load operator data.");
    }
  }, [api, ar]);

  useEffect(() => { void load(); }, [load]);

  const visibleProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => !needle || [product.name_ar, product.name_en].some((value) => value.toLowerCase().includes(needle)));
  }, [products, query]);

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("image");
    setMessage("");
    try {
      const form = new FormData();
      form.append("image", file);
      const response = await fetch(`${apiUrl}/admin/uploads/product-image`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!response.ok) throw new Error("upload");
      const result = await response.json() as UploadResponse;
      setImageUrl(result.url);
    } catch {
      setMessage(ar ? "تعذر رفع الصورة. استخدم JPG أو PNG أو WebP حتى 8MB." : "Image upload failed. Use JPG, PNG or WebP up to 8 MB.");
    } finally {
      setBusy("");
    }
  }

  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const category = categories.find((item) => item.is_active);
    if (!category) {
      setMessage(ar ? "لا توجد فئة داخلية فعالة. اطلب من المالك تهيئة المتجر أولاً." : "No active internal category. Ask the owner to initialize the store first.");
      return;
    }
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const nameAr = String(values.name_ar || "").trim();
    const nameEn = String(values.name_en || "").trim() || nameAr;
    const sku = makeSku();
    setBusy("product");
    setMessage("");
    try {
      await api("/products", {
        method: "POST",
        body: JSON.stringify({
          slug: makeSlug(nameEn),
          sku,
          name_ar: nameAr,
          name_en: nameEn,
          description_ar: String(values.description_ar || "").trim() || null,
          description_en: String(values.description_en || "").trim() || null,
          primary_image_url: imageUrl || null,
          category_id: category.id,
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
      setImageUrl("");
      setMessage(ar ? "تمت إضافة المنتج." : "Product added.");
      await load();
    } catch {
      setMessage(ar ? "تعذر إضافة المنتج. راجع الاسم والسعر والكمية." : "Could not add product. Check name, price and stock.");
    } finally {
      setBusy("");
    }
  }

  async function archiveProduct(product: Product) {
    const ok = window.confirm(ar ? `حذف ${product.name_ar} من المتجر؟` : `Remove ${product.name_en} from the store?`);
    if (!ok) return;
    setBusy(product.id);
    setMessage("");
    try {
      await api(`/products/${product.id}`, { method: "DELETE" });
      setMessage(ar ? "تم حذف المنتج من المتجر." : "Product removed from the store.");
      await load();
    } catch {
      setMessage(ar ? "تعذر حذف المنتج." : "Could not remove product.");
    } finally {
      setBusy("");
    }
  }

  async function addDiscount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy("discount");
    setMessage("");
    try {
      await api("/discounts", {
        method: "POST",
        body: JSON.stringify({
          name: String(values.name),
          discount_type: String(values.discount_type),
          value: Number(values.value),
          scope: "store",
          scope_reference: null,
          starts_at: null,
          ends_at: null,
          is_active: true,
        }),
      });
      form.reset();
      setMessage(ar ? "تم إنشاء الخصم." : "Discount created.");
      await load();
    } catch {
      setMessage(ar ? "تعذر إنشاء الخصم." : "Could not create discount.");
    } finally {
      setBusy("");
    }
  }

  async function addCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy("coupon");
    setMessage("");
    try {
      await api("/coupons", {
        method: "POST",
        body: JSON.stringify({
          code: String(values.code).trim().toUpperCase(),
          discount_type: String(values.discount_type),
          value: Number(values.value),
          minimum_order_amount: null,
          usage_limit: null,
          starts_at: null,
          ends_at: null,
          is_active: true,
        }),
      });
      form.reset();
      setMessage(ar ? "تم إنشاء كود الخصم." : "Coupon created.");
      await load();
    } catch {
      setMessage(ar ? "تعذر إنشاء كود الخصم." : "Could not create coupon.");
    } finally {
      setBusy("");
    }
  }

  async function removePromotion(kind: "discounts" | "coupons", id: string) {
    setBusy(id);
    setMessage("");
    try {
      await api(`/${kind}/${id}`, { method: "DELETE" });
      await load();
    } catch {
      setMessage(ar ? "تعذر حذف الخصم." : "Could not remove promotion.");
    } finally {
      setBusy("");
    }
  }

  return <main className="content-page shell commerce-page">
    <p className="eyebrow">XVOND VAULT OPERATOR</p>
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
      <div>
        <h1>{ar ? "المنتجات والخصومات" : "Products & discounts"}</h1>
        <p>{ar ? "يمكنك الإضافة والحذف والخصومات فقط. تعديل المنتجات الحالية غير متاح." : "You can add/remove products and manage discounts only. Existing products cannot be edited."}</p>
      </div>
      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
        <Link className="secondary-button" href={`/${locale}/admin/orders`}>{ar ? "الطلبات" : "Orders"}</Link>
        <Link className="secondary-button" href={`/${locale}/admin`}>{ar ? "لوحة التحكم" : "Dashboard"}</Link>
      </div>
    </div>

    {message && <p className="admin-message">{message}</p>}

    <section style={{ marginTop: "2rem" }}>
      <h2>{ar ? "إضافة منتج" : "Add product"}</h2>
      <form className="checkout-form" onSubmit={(event) => void addProduct(event)}>
        <div className="form-grid">
          <input name="name_ar" required placeholder={ar ? "اسم المنتج" : "Product name"} />
          <input name="name_en" placeholder={ar ? "الاسم بالإنجليزية (اختياري)" : "English name (optional)"} />
          <input name="price" type="number" min="0.001" step="0.001" required placeholder={ar ? "السعر OMR" : "Price OMR"} />
          <input name="stock_quantity" type="number" min="0" required placeholder={ar ? "الكمية" : "Stock"} />
          <textarea name="description_ar" placeholder={ar ? "الوصف (اختياري)" : "Description (optional)"} />
          <textarea name="description_en" placeholder={ar ? "الوصف بالإنجليزية (اختياري)" : "English description (optional)"} />
        </div>
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center", flexWrap: "wrap" }}>
          <label className="secondary-button" style={{ cursor: "pointer" }}>
            {busy === "image" ? (ar ? "جارٍ رفع الصورة…" : "Uploading…") : (ar ? "رفع صورة المنتج" : "Upload product image")}
            <input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={busy === "image"} onChange={(event) => void uploadImage(event)} />
          </label>
          {imageUrl && <small>{ar ? "تم رفع الصورة" : "Image ready"}</small>}
        </div>
        <button className="primary-button" disabled={busy === "product"}>{ar ? "إضافة المنتج" : "Add product"}</button>
      </form>
    </section>

    <section style={{ marginTop: "2rem" }}>
      <div className="section-heading"><div><p>CATALOG</p><h2>{ar ? "المنتجات الحالية" : "Current products"}</h2></div></div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "بحث بالاسم" : "Search by name"} style={{ width: "100%", maxWidth: 480, marginBottom: "1rem" }} />
      <div className="admin-cards">
        {visibleProducts.map((product) => {
          const variant = product.variants[0];
          return <article key={product.id} style={{ alignItems: "center" }}>
            <div style={{ display: "flex", gap: ".8rem", alignItems: "center" }}>
              <div style={{ width: 64, height: 64, borderRadius: 12, background: product.primary_image_url ? `center / cover no-repeat url(${product.primary_image_url})` : "var(--surface-2, #eee)" }} />
              <div>
                <strong>{ar ? product.name_ar : product.name_en}</strong>
                <small style={{ display: "block" }}>{variant ? `${variant.price} OMR · ${ar ? "المخزون" : "Stock"}: ${variant.stock_quantity}` : "—"}</small>
                <small style={{ display: "block" }}>{product.is_active ? (ar ? "ظاهر" : "Visible") : (ar ? "محذوف/مخفي" : "Removed/hidden")}</small>
              </div>
            </div>
            {product.is_active && <button className="danger-link" type="button" disabled={busy === product.id} onClick={() => void archiveProduct(product)}>{ar ? "حذف من المتجر" : "Remove from store"}</button>}
          </article>;
        })}
      </div>
    </section>

    <section style={{ marginTop: "2.5rem" }}>
      <div className="section-heading"><div><p>PROMOTIONS</p><h2>{ar ? "الخصومات" : "Discounts"}</h2></div></div>
      <div className="admin-cards" style={{ marginBottom: "1rem" }}>
        <article style={{ alignItems: "stretch" }}>
          <strong>{ar ? "خصم تلقائي على المتجر" : "Store-wide automatic discount"}</strong>
          <form className="checkout-form" onSubmit={(event) => void addDiscount(event)}>
            <input name="name" required placeholder={ar ? "اسم الخصم" : "Discount name"} />
            <select name="discount_type" defaultValue="percentage"><option value="percentage">{ar ? "نسبة %" : "Percentage %"}</option><option value="fixed">{ar ? "مبلغ ثابت" : "Fixed amount"}</option></select>
            <input name="value" type="number" min="0.001" step="0.001" required placeholder={ar ? "القيمة" : "Value"} />
            <button className="primary-button" disabled={busy === "discount"}>{ar ? "إنشاء الخصم" : "Create discount"}</button>
          </form>
        </article>
        <article style={{ alignItems: "stretch" }}>
          <strong>{ar ? "كود خصم" : "Coupon code"}</strong>
          <form className="checkout-form" onSubmit={(event) => void addCoupon(event)}>
            <input name="code" required pattern="[A-Za-z0-9_-]+" placeholder={ar ? "مثال: SALE10" : "Example: SALE10"} />
            <select name="discount_type" defaultValue="percentage"><option value="percentage">{ar ? "نسبة %" : "Percentage %"}</option><option value="fixed">{ar ? "مبلغ ثابت" : "Fixed amount"}</option></select>
            <input name="value" type="number" min="0.001" step="0.001" required placeholder={ar ? "القيمة" : "Value"} />
            <button className="primary-button" disabled={busy === "coupon"}>{ar ? "إنشاء الكود" : "Create coupon"}</button>
          </form>
        </article>
      </div>

      <div className="admin-cards">
        {discounts.map((item) => <article key={item.id}><div><strong>{item.name}</strong><small style={{ display: "block" }}>{item.value}{item.discount_type === "percentage" ? "%" : " OMR"}</small></div><button className="danger-link" type="button" disabled={busy === item.id} onClick={() => void removePromotion("discounts", item.id)}>{ar ? "حذف" : "Delete"}</button></article>)}
        {coupons.map((item) => <article key={item.id}><div><strong>{item.code}</strong><small style={{ display: "block" }}>{item.value}{item.discount_type === "percentage" ? "%" : " OMR"}</small></div><button className="danger-link" type="button" disabled={busy === item.id} onClick={() => void removePromotion("coupons", item.id)}>{ar ? "حذف" : "Delete"}</button></article>)}
        {!discounts.length && !coupons.length && <article><p>{ar ? "لا توجد خصومات حالياً." : "No promotions yet."}</p></article>}
      </div>
    </section>
  </main>;
}
