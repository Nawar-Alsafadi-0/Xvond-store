"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { StoreLogo } from "./store-logo";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type AdminRole = "admin" | "operator";

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

type AdminSession = { role: AdminRole; email: string };

export function AdminControlCenter({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [role, setRole] = useState<AdminRole | null>(null);
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
    async function restoreSession() {
      for (const endpoint of ["/auth/admin/me", "/auth/operator/me"]) {
        const response = await fetch(`${apiUrl}${endpoint}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) continue;
        const session = await response.json() as AdminSession;
        setRole(session.role);
        await loadDashboard();
        return;
      }
      setRole(null);
    }

    void restoreSession()
      .catch(() => setRole(null))
      .finally(() => setChecking(false));
  }, [loadDashboard]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    let response = await fetch(`${apiUrl}/auth/admin/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      response = await fetch(`${apiUrl}/auth/operator/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    }
    if (!response.ok) {
      setMessage(ar ? "بيانات الدخول غير صحيحة." : "Invalid sign-in details.");
      return;
    }

    const session = await response.json() as AdminSession;
    setRole(session.role);
    try {
      await loadDashboard();
    } catch {
      setMessage(ar ? "تم تسجيل الدخول لكن تعذر تحميل بيانات اللوحة." : "Signed in, but the dashboard could not be loaded.");
    }
  }

  async function logout() {
    await fetch(`${apiUrl}/auth/logout`, { method: "POST", credentials: "include" });
    setRole(null);
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

  if (!role) {
    return <main className="admin-login"><form onSubmit={(event) => void login(event)}>
      <StoreLogo size={64} />
      <p>XVOND VAULT ADMIN</p>
      <h1>{ar ? "دخول الإدارة" : "Admin access"}</h1>
      <label>{ar ? "البريد الإلكتروني" : "Email"}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>{ar ? "كلمة المرور" : "Password"}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></label>
      {message && <small>{message}</small>}
      <button className="primary-button">{ar ? "دخول" : "Sign in"}</button>
    </form></main>;
  }

  const owner = role === "admin";
  const cards = owner
    ? [
        [ar ? "طلبات جديدة" : "New orders", overview?.pending_orders ?? 0],
        [ar ? "المنتجات" : "Products", overview?.products ?? 0],
        [ar ? "مخزون منخفض" : "Low stock", overview?.low_stock ?? 0],
        [ar ? "كل الطلبات" : "All orders", overview?.orders ?? 0],
        [ar ? "العملاء" : "Customers", overview?.customers ?? 0],
        [ar ? "طلبات الاسترجاع" : "Return requests", overview?.returns ?? 0],
        [ar ? "المبيعات المحصلة" : "Collected sales", `${overview?.paid_revenue ?? "0"} OMR`],
      ]
    : [
        [ar ? "طلبات جديدة" : "New orders", overview?.pending_orders ?? 0],
        [ar ? "المنتجات" : "Products", overview?.products ?? 0],
        [ar ? "مخزون منخفض" : "Low stock", overview?.low_stock ?? 0],
        [ar ? "كل الطلبات" : "All orders", overview?.orders ?? 0],
      ];

  return <main className="content-page shell commerce-page">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
      <div>
        <p className="eyebrow">XVOND VAULT ADMIN</p>
        <h1>{ar ? "لوحة التحكم" : "Control center"}</h1>
        <p>{owner
          ? (ar ? "صلاحيات المالك الكاملة." : "Full owner access.")
          : (ar ? "صلاحية تشغيل محدودة: المنتجات والخصومات ومتابعة الطلبات فقط." : "Restricted operations access: catalog, discounts and order viewing only.")}</p>
      </div>
      <div style={{ display: "flex", gap: ".65rem", flexWrap: "wrap" }}>
        <button className="secondary-button" onClick={() => void loadDashboard()}>{ar ? "تحديث البيانات" : "Refresh"}</button>
        <button className="secondary-button" onClick={() => void logout()}>{ar ? "تسجيل الخروج" : "Sign out"}</button>
      </div>
    </div>

    {message && <p className="admin-message">{message}</p>}

    <div className="admin-kpis" style={{ marginTop: "2rem" }}>
      {cards.map(([label, value]) => <article key={String(label)}><span>{String(label)}</span><strong>{String(value)}</strong></article>)}
    </div>

    <section style={{ marginTop: "2rem" }}>
      <div className="section-heading"><div><p>OPERATIONS</p><h2>{ar ? "إدارة المتجر" : "Store operations"}</h2></div></div>
      <div className="admin-cards">
        <Link href={`/${locale}/admin/catalog`}><article><div><strong>{ar ? "المنتجات والخصومات" : "Products & discounts"}</strong><small>{ar ? "إضافة وتعديل وأرشفة المنتجات وإدارة الخصومات." : "Add, edit and archive products and manage discounts."}</small></div><span>→</span></article></Link>
        <Link href={`/${locale}/admin/orders`}><article><div><strong>{ar ? "الطلبات" : "Orders"}</strong><small>{owner ? (ar ? "إدارة الطلبات والتوصيل." : "Manage orders and fulfillment.") : (ar ? "عرض ومتابعة الطلبات فقط، بدون تعديل حالتها." : "View orders only; status changes are blocked.")}</small></div><span>→</span></article></Link>
        {owner && <Link href={`/${locale}/admin/customers`}><article><div><strong>{ar ? "العملاء" : "Customers"}</strong><small>{ar ? "عرض العملاء والبحث بالاسم أو البريد أو الهاتف." : "View customers and search by name, email or phone."}</small></div><span>→</span></article></Link>}
        {owner && <Link href={`/${locale}/admin/returns`}><article><div><strong>{ar ? "الاسترجاعات" : "Returns"}</strong><small>{ar ? "مراجعة طلبات الاسترجاع وتحديث حالتها." : "Review and update return requests."}</small></div><span>→</span></article></Link>}
        {owner && <Link href={`/${locale}/admin/shipping`}><article><div><strong>{ar ? "مناطق التوصيل" : "Delivery areas"}</strong><small>{ar ? "إدارة مناطق التوصيل والمدة المتوقعة." : "Manage service areas and ETA."}</small></div><span>→</span></article></Link>}
        {owner && <Link href={`/${locale}/admin/readiness`}><article><div><strong>{ar ? "جاهزية المتجر" : "Store readiness"}</strong><small>{ar ? "فحص متطلبات الإطلاق والإعدادات الحساسة." : "Check launch and sensitive configuration readiness."}</small></div><span>→</span></article></Link>}
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
