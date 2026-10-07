"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { StoreLogo } from "./store-logo";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type Overview = {
  products: number;
  orders: number;
  customers: number;
  low_stock: number;
  pending_orders: number;
  paid_revenue: string;
  returns: number;
};

export function AdminControlCenter({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState("");

  const loadOverview = useCallback(async () => {
    const response = await fetch(`${apiUrl}/admin/overview`, { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error("overview");
    setOverview(await response.json() as Overview);
  }, []);

  useEffect(() => {
    void fetch(`${apiUrl}/auth/admin/me`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        setAuthenticated(true);
        await loadOverview();
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setChecking(false));
  }, [loadOverview]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`${apiUrl}/auth/admin/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      setMessage(ar ? "بيانات الدخول غير صحيحة." : "Invalid sign-in details.");
      return;
    }
    setAuthenticated(true);
    await loadOverview();
  }

  async function logout() {
    await fetch(`${apiUrl}/auth/logout`, { method: "POST", credentials: "include" });
    setAuthenticated(false);
    setOverview(null);
  }

  if (checking) return <main className="content-page shell"><p>{ar ? "جارٍ التحميل…" : "Loading…"}</p></main>;

  if (!authenticated) {
    return <main className="admin-login"><form onSubmit={(event) => void login(event)}>
      <StoreLogo size={64} />
      <p>XVOND STORE ADMIN</p>
      <h1>{ar ? "دخول الإدارة" : "Admin access"}</h1>
      <label>{ar ? "البريد الإلكتروني" : "Email"}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>{ar ? "كلمة المرور" : "Password"}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} /></label>
      {message && <small>{message}</small>}
      <button className="primary-button">{ar ? "دخول" : "Sign in"}</button>
    </form></main>;
  }

  const cards = [
    [ar ? "طلبات جديدة" : "New orders", overview?.pending_orders ?? 0],
    [ar ? "المنتجات" : "Products", overview?.products ?? 0],
    [ar ? "مخزون منخفض" : "Low stock", overview?.low_stock ?? 0],
    [ar ? "الطلبات" : "Orders", overview?.orders ?? 0],
    [ar ? "العملاء" : "Customers", overview?.customers ?? 0],
    [ar ? "المبيعات المحصلة" : "Collected sales", `${overview?.paid_revenue ?? "0"} OMR`],
  ];

  return <main className="content-page shell commerce-page">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
      <div><p className="eyebrow">XVOND STORE ADMIN</p><h1>{ar ? "لوحة التحكم" : "Control center"}</h1><p>{ar ? "كل ما تحتاجه لتشغيل المتجر من مكان واحد." : "Run the store from one simple control center."}</p></div>
      <button className="secondary-button" onClick={() => void logout()}>{ar ? "تسجيل الخروج" : "Sign out"}</button>
    </div>

    <div className="admin-kpis" style={{ marginTop: "2rem" }}>
      {cards.map(([label, value]) => <article key={String(label)}><span>{String(label)}</span><strong>{String(value)}</strong></article>)}
    </div>

    <section style={{ marginTop: "2rem" }}>
      <div className="section-heading"><div><p>OPERATIONS</p><h2>{ar ? "إدارة المتجر" : "Store operations"}</h2></div></div>
      <div className="admin-cards">
        <Link href={`/${locale}/admin/catalog`}><article><div><strong>{ar ? "المنتجات والمخزون" : "Products & inventory"}</strong><small>{ar ? "إضافة القطع، تعديل السعر والكمية والصورة." : "Add items and edit price, stock and image."}</small></div><span>→</span></article></Link>
        <Link href={`/${locale}/admin/orders`}><article><div><strong>{ar ? "الطلبات" : "Orders"}</strong><small>{ar ? "تأكيد وتجهيز وتوصيل الطلبات." : "Confirm, prepare and deliver orders."}</small></div><span>→</span></article></Link>
        <Link href={`/${locale}/admin/shipping`}><article><div><strong>{ar ? "إعدادات التوصيل" : "Delivery settings"}</strong><small>{ar ? "سعر ومدة التوصيل الداخلي حسب المحافظة." : "Internal delivery price and timing by governorate."}</small></div><span>→</span></article></Link>
        <Link href={`/${locale}/admin/readiness`}><article><div><strong>{ar ? "جاهزية المتجر" : "Store readiness"}</strong><small>{ar ? "فحص سريع قبل الإطلاق." : "Quick launch checks."}</small></div><span>→</span></article></Link>
      </div>
    </section>
  </main>;
}
