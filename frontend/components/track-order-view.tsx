"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";

type Tracking = { order_number: string; status: string; payment_status: string };

const flow = ["pending", "confirmed", "processing", "shipped", "delivered"];

const labelsAr: Record<string, string> = {
  pending: "تم استلام الطلب",
  confirmed: "تم تأكيد الطلب",
  processing: "جاري تجهيز الطلب",
  shipped: "خرج الطلب للتوصيل",
  delivered: "تم تسليم الطلب",
  cancelled: "تم إلغاء الطلب",
  returned: "تم إرجاع الطلب",
  paid: "مدفوع",
};

const labelsEn: Record<string, string> = {
  pending: "Order received",
  confirmed: "Order confirmed",
  processing: "Preparing order",
  shipped: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  paid: "Paid",
};

export function TrackOrderView({ locale, initialOrder }: { locale: Locale; initialOrder: string }) {
  const [result, setResult] = useState<Tracking | null>(null);
  const [error, setError] = useState("");
  const ar = locale === "ar";
  const labels = ar ? labelsAr : labelsEn;
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
        if (!active || !value) return;
        setResult(value);
        setError("");
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

  const currentIndex = result ? flow.indexOf(result.status) : -1;

  return <main className="content-page shell">
    <p className="eyebrow">ORDER TRACKING</p>
    <h1>{ar ? "تتبع طلبك" : "Track your order"}</h1>
    {!result && <form className="checkout-form tracking-form" action={submit}>
      <p>{ar ? "إذا فتحت الطلب من حسابك سيظهر التتبع مباشرة. ويمكنك أيضاً البحث برقم الطلب والبريد." : "Orders opened from your account track automatically. You can also search by order number and email."}</p>
      <div className="form-grid">
        <label>{ar ? "رقم الطلب" : "Order number"}<input name="order" defaultValue={initialOrder} required /></label>
        <label>{ar ? "البريد المستخدم في الطلب" : "Order email"}<input name="email" type="email" required /></label>
      </div>
      <button className="primary-button">{ar ? "عرض حالة الطلب" : "View order status"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>}
    {result && <div className="tracking-result" style={{ display: "grid", gap: "1rem" }}>
      <div>
        <strong>{result.order_number}</strong>
        <p>{labels[result.status] || result.status}</p>
        <small>{ar ? "التوصيل يتم مباشرة بواسطة فريق المتجر." : "Delivery is handled directly by the store team."}</small>
      </div>
      {result.status === "cancelled" || result.status === "returned" ? <strong>{labels[result.status]}</strong> : <div style={{ display: "grid", gap: ".65rem" }}>
        {flow.map((state, index) => {
          const completed = currentIndex >= index;
          const current = currentIndex === index;
          return <div key={state} style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: ".7rem", alignItems: "center", opacity: completed ? 1 : .45 }}>
            <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid currentColor", display: "grid", placeItems: "center" }}>{completed ? "✓" : ""}</span>
            <div><strong>{labels[state]}</strong>{current && <small style={{ display: "block" }}>{ar ? "الحالة الحالية" : "Current status"}</small>}</div>
          </div>;
        })}
      </div>}
      <span>{ar ? "الدفع" : "Payment"}: {result.payment_status === "paid" ? labels.paid : (ar ? "كاش عند الاستلام" : "Cash on delivery")}</span>
      <button className="secondary-button" type="button" onClick={() => { setResult(null); setError(""); }}>{ar ? "تتبع طلب آخر" : "Track another order"}</button>
    </div>}
  </main>;
}
