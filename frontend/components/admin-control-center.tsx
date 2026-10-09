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

type OrderSummary = {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  shipping_city: string | null;
  status: string;
  payment_status: string;
  grand_total: string;
  currency: string;
  created_at: string;
};

export function AdminControlCenter({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);
  const [message, setMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    const [overviewResponse, ordersResponse] = await Promise.all([
      fetch(`${apiUrl}/admin/overview`, { credentials: "include", cache: "no-store" }),
      fetch(`${apiUrl}/admin/orders`, { credentials: "include", cache: "no-store" }),
    ]);
    if (!overviewResponse.ok || !ordersResponse.ok) throw new Error("dashboard");
    setOverview(await overviewResponse.json() as Overview);
    const orders = await ordersResponse.json() as OrderSummary[];
    setRecentOrders(orders.slice(0, 5));
  }, []);

  useEffect(() => {
    void fetch(`${apiUrl}/auth/admin/me`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        setAuthenticated(true);
        await loadDashboard();
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setChecking(false));
  }, [loadDashboard]);

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
    try {
      await loadDashboard();
    } catch {
      setMessage(ar ? "تم تسجيل الدخول لكن تعذر تحميل بيانات اللوحة." : "Signed in, but the dashboard could not be loaded.");
    }
  }

  async function logout() {
    await fetch(`${apiUrl}/auth/logout`, { method: "POST", credentials: "include" });
    setAuthenticated(false);
    setOverview(null);
    setRecentOrders([]);
  }

  function statusLabel(status: string) {
    const labels: Record<string, [string, string]> = {
      pending: ["جديد", "New"],
      confirmed: ["مؤكد", "Confirmed"],
      processing: ["قيد التجهيز", "Processing"],
      shipped: ["خرج للتوصيل", "Out for delivery"],
      delivered: ["تم التسليم", "Delivered"],
      cancelled: ["ملغي", "Cancelled"],
      returned: ["مرتجع", "Returned"],
    };
    const label = labels[status];
    return label ? label[ar ? 0 : 1] : status;
  }

  if (checking) return <main className="content-page shell"><p>{ar ? "جارٍ التحميل…" : "Loading…"}</p></main>;

  if (!authenticated) {
    return <main className="admin-login"><form onSubmit={(event) => void login(event)}>
      <StoreLogo size={64} />
      <p>XVOND VAULT ADMIN</p>
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
    [ar ? "كل الطلبات" : "All orders", overview?.orders ?? 0],
    [ar ? "العملاء" : "Customers", overview?.customers ?? 0],
    [ar ? "طلبات الاسترجاع" : "Return requests", overview?.returns ?? 0],
    [ar ? "المبيعات المحصلة" : "Collected sales", `${overview?.paid_revenue ?? "0"} OMR`],
  ];
  const needsAttention = Boolean((overview?.pending_orders ?? 0) || (overview?.low_stock ?? 0) || (overview?.returns ?? 0));

  return <main className="content-page shell commerce-page">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
      <div><p className="eyebrow">XVOND VAULT ADMIN</p><h1>{ar ? "لوحة التحكم" : "Control center"}</h1><p>{ar ? "المنتجات والمخزون والطلبات والعملاء والتوصيل من مكان واحد." : "Products, stock, orders, customers and delivery in one place."}</p></div>
      <div style={{ display: "flex", gap: ".65rem", flexWrap: "wrap" }}>
        <button className="secondary-button" onClick={() => void loadDashboard()}>{ar ? "تحديث البيانات" : "Refresh"}</button>
        <button className="secondary-button" onClick={() => void logout()}>{ar ? "تسجيل الخروج" : "Sign out"}</button>
      </div>
    </div>

    {message && <p className="admin-message">{message}</p>}
    {needsAttention && <div className="pending-choice" style={{ marginTop: "1.5rem" }}>
      <strong>{ar ? "يحتاج انتباهك" : "Needs your attention"}</strong>
      <p>{ar
        ? `${overview?.pending_orders ?? 0} طلب جديد · ${overview?.low_stock ?? 0} مخزون منخفض · ${overview?.returns ?? 0} طلب استرجاع`
        : `${overview?.pending_orders ?? 0} new orders · ${overview?.low_stock ?? 0} low-stock items · ${overview?.returns ?? 0} return requests`}</p>
    </div>}

    <div className="admin-kpis" style={{ marginTop: "2rem" }}>
      {cards.map(([label, value]) => <article key={String(label)}><span>{String(label)}</span><strong>{String(value)}</strong></article>)}
    </div>

    <section style={{ marginTop: "2rem" }}>
      <div className="section-heading"><div><p>OPERATIONS</p><h2>{ar ? "إدارة المتجر" : "Store operations"}</h2></div></div>
      <div className="admin-cards">
        <Link href={`/${locale}/admin/catalog`}><article><div><strong>{ar ? "المنتجات والمخزون" : "Products & inventory"}</strong><small>{ar ? "إضافة المنتجات وتعديل السعر والصورة والكمية والظهور." : "Add products and manage price, image, stock and visibility."}</small></div><span>→</span></article></Link>
        <Link href={`/${locale}/admin/orders`}><article><div><strong>{ar ? "الطلبات والتوصيل" : "Orders & fulfillment"}</strong><small>{ar ? "تأكيد وتجهيز وإخراج الطلب للتوصيل وتسجيل الاستلام." : "Confirm, prepare, deliver and complete orders."}</small></div><span>→</span></article></Link>
        <Link href={`/${locale}/admin/customers`}><article><div><strong>{ar ? "العملاء" : "Customers"}</strong><small>{ar ? "عرض العملاء والبحث بالاسم أو البريد أو الهاتف." : "View customers and search by name, email or phone."}</small></div><span>→</span></article></Link>
        <Link href={`/${locale}/admin/returns`}><article><div><strong>{ar ? "الاسترجاعات" : "Returns"}</strong><small>{ar ? "مراجعة طلبات الاسترجاع وتحديث حالتها حتى الإغلاق." : "Review returns and move them through resolution."}</small></div><span>→</span></article></Link>
        <Link href={`/${locale}/admin/shipping`}><article><div><strong>{ar ? "مناطق التوصيل" : "Delivery areas"}</strong><small>{ar ? "التوصيل مجاني؛ حدد المناطق المتاحة والمدة المتوقعة." : "Delivery is free; control service areas and ETA."}</small></div><span>→</span></article></Link>
        <Link href={`/${locale}/admin/readiness`}><article><div><strong>{ar ? "جاهزية المتجر" : "Store readiness"}</strong><small>{ar ? "فحص سريع لمتطلبات الإطلاق." : "Quick launch readiness checks."}</small></div><span>→</span></article></Link>
      </div>
    </section>

    <section style={{ marginTop: "2rem" }}>
      <div className="section-heading"><div><p>LIVE ORDERS</p><h2>{ar ? "آخر الطلبات" : "Recent orders"}</h2></div><Link className="secondary-button" href={`/${locale}/admin/orders`}>{ar ? "عرض الكل" : "View all"}</Link></div>
      <div className="admin-cards">
        {recentOrders.map((order) => <article key={order.id}>
          <div>
            <strong>{order.order_number}</strong>
            <small style={{ display: "block" }}>{order.customer_name || (ar ? "عميل" : "Customer")}{order.customer_phone ? ` · ${order.customer_phone}` : ""}</small>
            <small style={{ display: "block" }}>{order.shipping_city || "—"} · {statusLabel(order.status)}</small>
          </div>
          <div style={{ textAlign: ar ? "left" : "right" }}><strong>{order.grand_total} {order.currency}</strong><small style={{ display: "block" }}>{new Date(order.created_at).toLocaleString(ar ? "ar-OM" : "en-OM")}</small></div>
        </article>)}
        {!recentOrders.length && <article><p>{ar ? "لا توجد طلبات حتى الآن." : "No orders yet."}</p></article>}
      </div>
    </section>
  </main>;
}
