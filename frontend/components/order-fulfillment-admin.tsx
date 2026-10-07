"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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

function parseAddress(value: string | null): ParsedAddress {
  if (!value) return { address: null, mapUrl: null };
  const match = value.match(/^(.*?)\s*\|\s*GPS\s*(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/i);
  if (!match) return { address: value, mapUrl: null };
  return {
    address: match[1].trim(),
    mapUrl: `https://www.google.com/maps?q=${encodeURIComponent(`${match[2]},${match[3]}`)}`,
  };
}

export function OrderFulfillmentAdmin({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [orders, setOrders] = useState<Order[]>([]);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, OrderDetail>>({});
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const me = await fetch(`${apiUrl}/auth/admin/me`, { credentials: "include" });
    if (!me.ok) { setAuthorized(false); return; }
    setAuthorized(true);
    const response = await fetch(`${apiUrl}/admin/orders`, { credentials: "include", cache: "no-store" });
    if (!response.ok) { setMessage(ar ? "تعذر تحميل الطلبات." : "Could not load orders."); return; }
    setOrders(await response.json() as Order[]);
  }, [ar]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

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
    <p className="eyebrow">XVOND SMART STORE ADMIN</p>
    <h1>{ar ? "الطلبات والتجهيز" : "Orders & fulfillment"}</h1>
    <p><Link href={`/${locale}/admin`}>← {ar ? "العودة للوحة الإدارة" : "Back to admin"}</Link></p>
    {message && <p className="admin-message">{message}</p>}
    <div className="admin-cards">
      {orders.length ? orders.map((order) => {
        const detail = details[order.id];
        const expanded = expandedId === order.id;
        const location = parseAddress(order.shipping_address_line);
        return <article key={order.id} style={{ alignItems: "stretch", gap: "1rem" }}>
          <div style={{ display: "grid", gap: ".35rem" }}>
            <strong>{order.order_number}</strong>
            <small>{new Date(order.created_at).toLocaleString(ar ? "ar-OM" : "en-OM")}</small>
            <span>{order.customer_name || "—"}</span>
            <small>{order.customer_email || "—"}{order.customer_phone ? ` · ${order.customer_phone}` : ""}</small>
            <small>{[order.shipping_governorate, order.shipping_city, location.address].filter(Boolean).join(" · ") || (ar ? "طلب قديم بدون عنوان" : "Legacy order without address")}</small>
            {location.mapUrl && <a href={location.mapUrl} target="_blank" rel="noreferrer" className="table-button" style={{ width: "fit-content" }}>{ar ? "فتح موقع التوصيل" : "Open delivery location"}</a>}
          </div>
          <div style={{ display: "grid", gap: ".35rem" }}>
            <strong>{order.grand_total} {order.currency}</strong>
            <small>{ar ? "التوصيل" : "Shipping"}: {order.shipping_total} {order.currency}{order.discount_total !== "0.000" ? ` · ${ar ? "خصم" : "Discount"}: ${order.discount_total}` : ""}</small>
            <small>{ar ? "طريقة الدفع" : "Payment method"}: {order.payment_method === "cash_on_delivery" ? (ar ? "الدفع عند الاستلام" : "Cash on delivery") : order.payment_method === "tap" ? "Tap" : order.payment_method}</small>
            <select value={order.status} disabled={busyId === order.id} onChange={(event) => void update(order.id, { status: event.target.value })}>
              {orderStates.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
            <select value={order.payment_status} disabled={busyId === order.id} onChange={(event) => void update(order.id, { payment_status: event.target.value })}>
              {paymentStates.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
            <button className="table-button" type="button" disabled={busyId === order.id} onClick={() => void toggleDetails(order)}>{expanded ? (ar ? "إخفاء التفاصيل" : "Hide details") : (ar ? "تفاصيل الطلب" : "Order details")}</button>
          </div>
          {expanded && detail && <div style={{ gridColumn: "1 / -1", display: "grid", gap: ".75rem", borderTop: "1px solid var(--line, #d9d9d9)", paddingTop: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <small>{ar ? "المجموع الفرعي" : "Subtotal"}: {detail.subtotal} {detail.currency}</small>
              <small>{ar ? "التوصيل" : "Shipping"}: {detail.shipping_total} {detail.currency}</small>
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
      }) : <article><p>{ar ? "لا توجد طلبات بعد." : "No orders yet."}</p></article>}
    </div>
  </main>;
}
