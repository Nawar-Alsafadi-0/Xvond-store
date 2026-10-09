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
  grand_total: string;
  created_at: string;
};

type OrderItem = { id: string; product_name: string; sku: string; unit_price: string; quantity: number; line_total: string };
type OrderDetail = Order & { items: OrderItem[] };

type ParsedAddress = { address: string | null; mapUrl: string | null };

function parseAddress(value: string | null): ParsedAddress {
  if (!value) return { address: null, mapUrl: null };
  const match = value.match(/^(.*?)\s*\|\s*GPS\s*(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/i);
  if (!match) return { address: value, mapUrl: null };
  return {
    address: match[1].trim(),
    mapUrl: `https://www.google.com/maps?q=${encodeURIComponent(`${match[2]},${match[3]}`)}`,
  };
}

export function OperatorOrders({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [orders, setOrders] = useState<Order[]>([]);
  const [details, setDetails] = useState<Record<string, OrderDetail>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const labels: Record<string, string> = ar
    ? { pending: "طلب جديد", confirmed: "مؤكد", processing: "جاري التجهيز", shipped: "خرج للتوصيل", delivered: "تم التسليم", cancelled: "ملغي", returned: "مرتجع", paid: "مدفوع" }
    : { pending: "New order", confirmed: "Confirmed", processing: "Preparing", shipped: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled", returned: "Returned", paid: "Paid" };

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/admin/orders`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("orders");
      setOrders(await response.json() as Order[]);
      setMessage("");
    } catch {
      setMessage(ar ? "تعذر تحميل الطلبات." : "Could not load orders.");
    }
  }, [ar]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return orders;
    return orders.filter((order) => [order.order_number, order.customer_name, order.customer_phone, order.customer_email, order.shipping_city, order.shipping_governorate]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)));
  }, [orders, query]);

  async function toggleDetails(order: Order) {
    if (expandedId === order.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(order.id);
    if (details[order.id]) return;
    try {
      const response = await fetch(`${apiUrl}/admin/orders/${order.id}/detail`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("detail");
      const detail = await response.json() as OrderDetail;
      setDetails((current) => ({ ...current, [order.id]: detail }));
    } catch {
      setExpandedId(null);
      setMessage(ar ? "تعذر تحميل تفاصيل الطلب." : "Could not load order details.");
    }
  }

  return <main className="content-page shell commerce-page">
    <p className="eyebrow">XVOND VAULT OPERATOR</p>
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
      <div>
        <h1>{ar ? "متابعة الطلبات" : "Order tracking"}</h1>
        <p>{ar ? "عرض فقط. لا يمكن لهذا الحساب تغيير حالة الطلب أو الدفع أو إلغاء الطلب." : "Read only. This account cannot change order/payment status or cancel orders."}</p>
      </div>
      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
        <Link className="secondary-button" href={`/${locale}/admin/catalog`}>{ar ? "المنتجات والخصومات" : "Products & discounts"}</Link>
        <Link className="secondary-button" href={`/${locale}/admin`}>{ar ? "لوحة التحكم" : "Dashboard"}</Link>
      </div>
    </div>

    {message && <p className="admin-message">{message}</p>}
    <div style={{ display: "flex", gap: ".75rem", marginBlock: "1.25rem", flexWrap: "wrap" }}>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "بحث برقم الطلب أو العميل أو الهاتف أو المنطقة" : "Search order, customer, phone or area"} style={{ flex: "1 1 320px" }} />
      <button className="secondary-button" type="button" onClick={() => void load()}>{ar ? "تحديث" : "Refresh"}</button>
    </div>

    <div className="admin-cards">
      {visible.map((order) => {
        const parsed = parseAddress(order.shipping_address_line);
        const detail = details[order.id];
        const expanded = expandedId === order.id;
        return <article key={order.id} style={{ alignItems: "stretch", gap: "1rem" }}>
          <div style={{ display: "grid", gap: ".35rem" }}>
            <div style={{ display: "flex", gap: ".6rem", alignItems: "center", flexWrap: "wrap" }}>
              <strong>{order.order_number}</strong>
              <span>{labels[order.status] || order.status}</span>
            </div>
            <small>{new Date(order.created_at).toLocaleString(ar ? "ar-OM" : "en-OM")}</small>
            <span>{order.customer_name || (ar ? "عميل" : "Customer")}</span>
            <small>{order.customer_phone || "—"}{order.customer_email ? ` · ${order.customer_email}` : ""}</small>
            <small>{[order.shipping_governorate, order.shipping_city, parsed.address].filter(Boolean).join(" · ") || "—"}</small>
            {parsed.mapUrl && <a className="table-button" style={{ width: "fit-content" }} href={parsed.mapUrl} target="_blank" rel="noreferrer">{ar ? "فتح موقع العميل" : "Open customer location"}</a>}
          </div>
          <div style={{ display: "grid", gap: ".35rem" }}>
            <strong>{order.grand_total} {order.currency}</strong>
            <small>{ar ? "الدفع" : "Payment"}: {order.payment_method === "cash_on_delivery" ? (ar ? "كاش عند الاستلام" : "Cash on delivery") : order.payment_method} · {labels[order.payment_status] || order.payment_status}</small>
            <small>{ar ? "التوصيل" : "Delivery"}: {order.shipping_total} {order.currency}</small>
            <button className="table-button" type="button" onClick={() => void toggleDetails(order)}>{expanded ? (ar ? "إخفاء التفاصيل" : "Hide details") : (ar ? "تفاصيل الطلب" : "Order details")}</button>
          </div>
          {expanded && detail && <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--line, #ddd)", paddingTop: "1rem", display: "grid", gap: ".65rem" }}>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <small>{ar ? "المجموع الفرعي" : "Subtotal"}: {detail.subtotal} {detail.currency}</small>
              <small>{ar ? "الخصم" : "Discount"}: {detail.discount_total} {detail.currency}</small>
              <small>{ar ? "الإجمالي" : "Total"}: {detail.grand_total} {detail.currency}</small>
            </div>
            {detail.items.map((item) => <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <span>{item.product_name} × {item.quantity}</span>
              <small>{item.line_total} {detail.currency} · {item.sku}</small>
            </div>)}
          </div>}
        </article>;
      })}
      {!visible.length && <article><p>{ar ? "لا توجد طلبات مطابقة." : "No matching orders."}</p></article>}
    </div>
  </main>;
}
