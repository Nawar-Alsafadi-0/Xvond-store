"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";

type Tracking = {
  order_number: string;
  status: string;
  payment_status: string;
  payment_method?: string;
  grand_total?: string;
  currency?: string;
  created_at?: string;
};

const flow = ["pending", "confirmed", "processing", "shipped", "delivered"] as const;

function statusLabel(status: string, ar: boolean): string {
  const labels: Record<string, [string, string]> = {
    pending: ["تم استلام الطلب", "Order received"],
    confirmed: ["تم تأكيد الطلب", "Order confirmed"],
    processing: ["جاري تجهيز الطلب", "Preparing order"],
    shipped: ["خرج للتوصيل", "Out for delivery"],
    delivered: ["تم التسليم", "Delivered"],
    cancelled: ["تم إلغاء الطلب", "Cancelled"],
    returned: ["تم إرجاع الطلب", "Returned"],
  };
  const value = labels[status] ?? [status, status];
  return ar ? value[0] : value[1];
}

function paymentLabel(status: string, ar: boolean): string {
  const labels: Record<string, [string, string]> = {
    pending: ["الدفع عند الاستلام", "Cash due on delivery"],
    paid: ["مدفوع", "Paid"],
    failed: ["فشل الدفع", "Payment failed"],
    refunded: ["تم رد المبلغ", "Refunded"],
    authorized: ["تم اعتماد الدفع", "Payment authorized"],
  };
  const value = labels[status] ?? [status, status];
  return ar ? value[0] : value[1];
}

export function TrackOrderView({ locale, initialOrder }: { locale: Locale; initialOrder: string }) {
  const [result, setResult] = useState<Tracking | null>(null);
  const [error, setError] = useState("");
  const ar = locale === "ar";
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

  useEffect(() => {
    if (!initialOrder) return;
    let active = true;
    void fetch(`${base}/account/orders/${encodeURIComponent(initialOrder)}/track`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return await response.json() as Tracking;
      })
      .then((value) => {
        if (active && value) {
          setResult(value);
          setError("");
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [base, initialOrder]);

  async function submit(formData: FormData) {
    const order = String(formData.get("order") || "").trim();
    const email = String(formData.get("email") || "").trim();
    setError("");
    setResult(null);
    try {
      const query = `email=${encodeURIComponent(email)}`;
      const response = await fetch(`${base}/orders/${encodeURIComponent(order)}/track?${query}`);
      if (!response.ok) throw new Error("not_found");
      setResult(await response.json() as Tracking);
    } catch {
      setError(ar ? "لم نجد طلبًا مطابقًا لهذه البيانات." : "No order matched these details.");
    }
  }

  const currentIndex = result ? flow.indexOf(result.status as (typeof flow)[number]) : -1;
  const exceptional = result?.status === "cancelled" || result?.status === "returned";

  return <main className="content-page shell commerce-page">
    <p className="eyebrow">ORDER TRACKING</p>
    <h1>{ar ? "تتبع طلبك" : "Track your order"}</h1>
    {!result && <form className="checkout-form tracking-form" action={submit}>
      <p>{ar ? "إذا كنت مسجلاً بالدخول، افتح الطلب من حسابك وسيظهر التتبع مباشرة. أو أدخل رقم الطلب والبريد هنا." : "If you are signed in, open the order from your account for instant tracking. Or enter the order number and email here."}</p>
      <div className="form-grid">
        <label>{ar ? "رقم الطلب" : "Order number"}<input name="order" defaultValue={initialOrder} required /></label>
        <label>{ar ? "البريد المستخدم في الطلب" : "Order email"}<input name="email" type="email" required /></label>
      </div>
      <button className="primary-button">{ar ? "عرض حالة الطلب" : "View order status"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>}

    {result && <section className="tracking-result" style={{ display: "grid", gap: "1rem" }}>
      <div>
        <strong style={{ fontSize: "1.15rem" }}>{result.order_number}</strong>
        <p>{statusLabel(result.status, ar)}</p>
        <small>{ar ? "الدفع" : "Payment"}: {paymentLabel(result.payment_status, ar)}</small>
      </div>

      {exceptional ? <div className="empty-card">
        <strong>{statusLabel(result.status, ar)}</strong>
      </div> : <div style={{ display: "grid", gap: ".65rem" }}>
        {flow.map((step, index) => {
          const reached = currentIndex >= index;
          const current = currentIndex === index;
          return <div key={step} style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: ".75rem", alignItems: "center", opacity: reached ? 1 : .45 }}>
            <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: "50%", display: "grid", placeItems: "center", border: "1px solid currentColor", fontSize: ".75rem" }}>{reached ? "✓" : index + 1}</span>
            <div><strong>{statusLabel(step, ar)}</strong>{current && <small style={{ display: "block" }}>{ar ? "الحالة الحالية" : "Current status"}</small>}</div>
          </div>;
        })}
      </div>}

      <p>{ar ? "التوصيل يتم مباشرة عن طريق فريق المتجر، لذلك لا يوجد رقم تتبع لشركة شحن خارجية." : "Delivery is handled directly by our store team, so there is no external courier tracking number."}</p>
      <button className="secondary-button" type="button" onClick={() => { setResult(null); setError(""); }}>{ar ? "تتبع طلب آخر" : "Track another order"}</button>
    </section>}
  </main>;
}
