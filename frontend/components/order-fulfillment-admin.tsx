"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type Order = {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_country_code: string;
  shipping_governorate: string | null;
  shipping_city: string | null;
  shipping_address_line: string | null;
  status: string;
  payment_status: string;
  payment_method: string;
  currency: string;
  subtotal: string;
  discount_total: string;
  shipping_total: string;
  tax_total: string;
  grand_total: string;
  promotion_code: string | null;
  created_at: string;
};

type OrderItem = {
  id: string;
  product_name: string;
  sku: string;
  unit_price: string;
  quantity: number;
  line_total: string;
};

type OrderDetail = Order & { items: OrderItem[] };
type ParsedAddress = { address: string | null; mapUrl: string | null };

const orderStates = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "returned"];
const paymentStates = ["pending", "authorized", "paid", "failed", "refunded"];
const activeFilters = ["all", "pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];

function parseAddress(value: string | null): ParsedAddress {
  if (!value) return { address: null, mapUrl: null };
  const match = value.match(/^(.*?)\s*\|\s*GPS\s*(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/i);
  if (!match) return { address: value, mapUrl: null };
  return {
    address: match[1].trim(),
    mapUrl: `https://www.google.com/maps?q=${encodeURIComponent(`${match[2]},${match[3]}`)}`,
  };
}

function orderStatusLabel(status: string, ar: boolean): string {
  const labels: Record<string, [string, string]> = {
    all: ["الكل", "All"],
    pending: ["جديد", "New"],
    confirmed: ["مؤكد", "Confirmed"],
    processing: ["جاري التجهيز", "Preparing"],
    shipped: ["خرج للتوصيل", "Out for delivery"],
    delivered: ["تم التسليم", "Delivered"],
    cancelled: ["ملغي", "Cancelled"],
    returned: ["مرتجع", "Returned"],
  };
  const value = labels[status] ?? [status, status];
  return ar ? value[0] : value[1];
}

function paymentStatusLabel(status: string, ar: boolean): string {
  const labels: Record<string, [string, string]> = {
    pending: ["عند الاستلام", "Due on delivery"],
    authorized: ["معتمد", "Authorized"],
    paid: ["مدفوع", "Paid"],
    failed: ["فشل", "Failed"],
    refunded: ["مسترد", "Refunded"],
  };
  const value = labels[status] ?? [status, status];
  return ar ? value[0] : value[1];
}

export function OrderFulfillmentAdmin({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [orders, setOrders] = useState<Order[]>([]);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, OrderDetail>>({});
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const me = await fetch(`${apiUrl}/auth/admin/me`, { credentials: "include" });
    if (!me.ok) { setAuthorized(false); return; }
    setAuthorized(true);
    const response = await fetch(`${apiUrl}/admin/orders`, { credentials: "include", cache: "no-store" });
    if (!response.ok) { setMessage(ar ? "تعذر تحميل الطلبات." : "Could not load orders."); return; }
    setOrders(await response.json() as Order[]);
  }, [ar]);

  useEffect(() => {
    queueMicrotask(() => void load());
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: orders.length };
    for (const order of orders) result[order.status] = (result[order.status] ?? 0) + 1;
    return result;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (filter !== "all" && order.status !== filter) return false;
      if (!term) return true;
      const haystack = [
        order.order_number,
        order.customer_name,
        order.customer_phone,
        order.customer_email,
        order.shipping_governorate,
        order.shipping_city,
        order.shipping_address_line,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [filter, orders, search]);

  async function update(id: string, body: Record<string, string>) {
    setBusyId(id); setMessage("");
    const response = await fetch(`${apiUrl}/admin/orders/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (!response.ok) { setMessage(ar ? "تعذر تحديث الطلب." : "Could not update order."); return; }
    setDetails((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    await load();
  }

  async function toggleDetails(order: Order) {
    if (expandedId === order.id) { setExpandedId(null); return; }
    setExpandedId(order.id);
    if (details[order.id]) return;
    setBusyId(order.id); setMessage("");
    const response = await fetch(`${apiUrl}/admin/orders/${order.id}/detail`, {
      credentials: "include",
      cache: "no-store",
    });
    setBusyId(null);
    if (!response.ok) {
      setExpandedId(null);
      setMessage(ar ? "تعذر تحميل تفاصيل الطلب." : "Could not load order details.");
      return;
    }
    const detail = await response.json() as OrderDetail;
    setDetails((current) => ({ ...current, [order.id]: detail }));
  }

  if (authorized === null) return <main className="content-page shell"><p>{ar ? "جارٍ التحميل…" : "Loading…"}</p></main>;
  if (!authorized) return <main className="content-page shell"><h1>{ar ? "إدارة الطلبات" : "Order management"}</h1><p>{ar ? "سجل دخول الإدارة أولًا." : "Sign in to admin first."}</p><Link className="primary-button" href={`/${locale}/admin`}>{ar ? "دخول الإدارة" : "Admin sign in"}</Link></main>;

  return <main className="content-page shell commerce-page">
    <p className="eyebrow">XVOND STORE ADMIN</p>
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
      <div>
        <h1>{ar ? "الطلبات والتوصيل" : "Orders & delivery"}</h1>
        <p>{ar ? "التوصيل داخلي من فريق المتجر. يتم تحديث القائمة تلقائياً كل 30 ثانية." : "Delivery is handled by the store team. Orders refresh automatically every 30 seconds."}</p>
      </div>
      <button className="secondary-button" type="button" onClick={() => void load()}>{ar ? "تحديث الآن" : "Refresh now"}</button>
    </div>
    <p><Link href={`/${locale}/admin`}>← {ar ? "العودة للوحة الإدارة" : "Back to admin"}</Link></p>
    {message && <p className="admin-message">{message}</p>}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: ".75rem", margin: "1.25rem 0" }}>
      {activeFilters.slice(1, 6).map((status) => <button key={status} type="button" className={filter === status ? "primary-button" : "table-button"} onClick={() => setFilter(status)} style={{ display: "grid", gap: ".25rem", textAlign: ar ? "right" : "left" }}>
        <strong style={{ fontSize: "1.3rem" }}>{counts[status] ?? 0}</strong>
        <span>{orderStatusLabel(status, ar)}</span>
      </button>)}
    </div>

    <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1rem" }}>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ar ? "ابحث برقم الطلب، الاسم، الهاتف أو المنطقة" : "Search order, name, phone or area"} style={{ minWidth: "min(100%, 320px)", flex: "1 1 280px" }} />
      <select value={filter} onChange={(event) => setFilter(event.target.value)}>
        {activeFilters.map((status) => <option key={status} value={status}>{orderStatusLabel(status, ar)} ({counts[status] ?? 0})</option>)}
      </select>
      {filter !== "all" && <button type="button" className="text-button" onClick={() => setFilter("all")}>{ar ? "عرض الكل" : "Show all"}</button>}
    </div>

    {(counts.pending ?? 0) > 0 && <div className="pending-choice" style={{ marginBottom: "1rem" }}>
      <strong>{ar ? `لديك ${counts.pending} طلب جديد بحاجة للمراجعة` : `${counts.pending} new order${counts.pending === 1 ? "" : "s"} need review`}</strong>
    </div>}

    <div className="admin-cards">
      {filteredOrders.length ? filteredOrders.map((order) => {
        const detail = details[order.id];
        const expanded = expandedId === order.id;
        const location = parseAddress(order.shipping_address_line);
        return <article key={order.id} style={{ alignItems: "stretch", gap: "1rem", outline: order.status === "pending" ? "2px solid currentColor" : undefined }}>
          <div style={{ display: "grid", gap: ".35rem" }}>
            <div style={{ display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
              <strong>{order.order_number}</strong>
              <span>{orderStatusLabel(order.status, ar)}</span>
            </div>
            <small>{new Date(order.created_at).toLocaleString(ar ? "ar-OM" : "en-OM")}</small>
            <span>{order.customer_name || "—"}</span>
            <small>{order.customer_email || "—"}{order.customer_phone ? ` · ${order.customer_phone}` : ""}</small>
            <small>{[order.shipping_governorate, order.shipping_city, location.address].filter(Boolean).join(" · ") || (ar ? "طلب قديم بدون عنوان" : "Legacy order without address")}</small>
            {location.mapUrl && <a href={location.mapUrl} target="_blank" rel="noreferrer" className="table-button" style={{ width: "fit-content" }}>{ar ? "فتح موقع التوصيل" : "Open delivery location"}</a>}
          </div>
          <div style={{ display: "grid", gap: ".35rem" }}>
            <strong>{order.grand_total} {order.currency}</strong>
            <small>{ar ? "التوصيل" : "Delivery"}: {order.shipping_total} {order.currency}{order.discount_total !== "0.000" ? ` · ${ar ? "خصم" : "Discount"}: ${order.discount_total}` : ""}</small>
            <small>{ar ? "الدفع" : "Payment"}: {order.payment_method === "cash_on_delivery" ? (ar ? "كاش عند الاستلام" : "Cash on delivery") : order.payment_method} · {paymentStatusLabel(order.payment_status, ar)}</small>
            <label>{ar ? "حالة الطلب" : "Order status"}
              <select value={order.status} disabled={busyId === order.id} onChange={(event) => void update(order.id, { status: event.target.value })}>
                {orderStates.map((state) => <option key={state} value={state}>{orderStatusLabel(state, ar)}</option>)}
              </select>
            </label>
            <label>{ar ? "حالة الدفع" : "Payment status"}
              <select value={order.payment_status} disabled={busyId === order.id} onChange={(event) => void update(order.id, { payment_status: event.target.value })}>
                {paymentStates.map((state) => <option key={state} value={state}>{paymentStatusLabel(state, ar)}</option>)}
              </select>
            </label>
            <button className="table-button" type="button" disabled={busyId === order.id} onClick={() => void toggleDetails(order)}>{expanded ? (ar ? "إخفاء التفاصيل" : "Hide details") : (ar ? "تفاصيل الطلب" : "Order details")}</button>
          </div>
          {expanded && detail && <div style={{ gridColumn: "1 / -1", display: "grid", gap: ".75rem", borderTop: "1px solid var(--line, #d9d9d9)", paddingTop: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <small>{ar ? "المجموع الفرعي" : "Subtotal"}: {detail.subtotal} {detail.currency}</small>
              <small>{ar ? "التوصيل" : "Delivery"}: {detail.shipping_total} {detail.currency}</small>
              {detail.discount_total !== "0.000" && <small>{ar ? "الخصم" : "Discount"}: {detail.discount_total} {detail.currency}</small>}
              {detail.promotion_code && <small>{ar ? "العرض" : "Promotion"}: {detail.promotion_code}</small>}
            </div>
            <div style={{ display: "grid", gap: ".5rem" }}>
              {detail.items.map((item) => <div key={item.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: ".5rem 1rem" }}>
                <div><strong>{item.product_name}</strong><small style={{ display: "block" }}>{item.sku} · {ar ? "الكمية" : "Qty"}: {item.quantity}</small></div>
                <div style={{ textAlign: "end" }}><strong>{item.line_total} {detail.currency}</strong><small style={{ display: "block" }}>{item.unit_price} × {item.quantity}</small></div>
              </div>)}
            </div>
          </div>}
        </article>;
      }) : <article><p>{ar ? "لا توجد طلبات مطابقة." : "No matching orders."}</p></article>}
    </div>
  </main>;
}
