"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type Rate = {
  id: string;
  governorate: string;
  name_ar: string;
  name_en: string;
  amount: string;
  free_over: string | null;
  estimated_days_min: number;
  estimated_days_max: number;
  is_active: boolean;
};

export function ShippingAdmin({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [rates, setRates] = useState<Rate[]>([]);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const me = await fetch(`${apiUrl}/auth/admin/me`, { credentials: "include" });
    if (!me.ok) { setAuthorized(false); return; }
    setAuthorized(true);
    const response = await fetch(`${apiUrl}/admin/shipping-rates`, { credentials: "include" });
    if (response.ok) setRates(await response.json() as Rate[]);
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = {
      governorate: String(values.governorate),
      name_ar: String(values.name_ar),
      name_en: String(values.name_en),
      amount: Number(values.amount),
      free_over: values.free_over ? Number(values.free_over) : null,
      estimated_days_min: Number(values.estimated_days_min),
      estimated_days_max: Number(values.estimated_days_max),
      is_active: true,
    };
    const response = await fetch(`${apiUrl}/admin/shipping-rates`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setMessage(response.ok
      ? (ar ? "تمت إضافة منطقة التوصيل." : "Delivery area added.")
      : (ar ? "تعذر الحفظ. قد تكون المنطقة موجودة مسبقًا." : "Could not save. The area may already exist."));
    if (response.ok) { event.currentTarget.reset(); await load(); }
  }

  async function remove(id: string) {
    const response = await fetch(`${apiUrl}/admin/shipping-rates/${id}`, { method: "DELETE", credentials: "include" });
    if (response.ok) await load();
  }

  if (authorized === null) return <main className="content-page shell"><p>{ar ? "جارٍ التحميل…" : "Loading…"}</p></main>;
  if (!authorized) return <main className="content-page shell"><h1>{ar ? "إعدادات التوصيل" : "Delivery settings"}</h1><p>{ar ? "سجل دخول الإدارة أولًا." : "Sign in to admin first."}</p><Link className="primary-button" href={`/${locale}/admin`}>{ar ? "دخول الإدارة" : "Admin sign in"}</Link></main>;

  return <main className="content-page shell commerce-page">
    <p className="eyebrow">XVOND STORE ADMIN</p>
    <h1>{ar ? "إعدادات التوصيل الداخلي" : "Internal delivery settings"}</h1>
    <p>{ar ? "حدد المناطق التي يوصل لها فريقكم، السعر المتوقع، ومدة التوصيل. لا يوجد ربط مع شركة لوجستية." : "Set the areas your team delivers to, delivery fee and estimated time. No logistics provider is connected."}</p>
    <p><Link href={`/${locale}/admin`}>← {ar ? "العودة للوحة الإدارة" : "Back to admin"}</Link></p>
    {message && <p className="admin-message">{message}</p>}
    <form className="checkout-form" onSubmit={(event) => void save(event)}>
      <h2>{ar ? "إضافة محافظة / منطقة توصيل" : "Add delivery governorate / area"}</h2>
      <div className="form-grid">
        <input name="governorate" placeholder={ar ? "المحافظة مثل Muscat" : "Governorate e.g. Muscat"} required />
        <input name="name_ar" placeholder="الاسم بالعربي" required />
        <input name="name_en" placeholder="English name" required />
        <input name="amount" type="number" min="0" step="0.001" placeholder={ar ? "رسوم التوصيل OMR" : "Delivery fee OMR"} required />
        <input name="free_over" type="number" min="0" step="0.001" placeholder={ar ? "توصيل مجاني فوق مبلغ (اختياري)" : "Free delivery over amount (optional)"} />
        <input name="estimated_days_min" type="number" min="1" max="30" defaultValue="1" required />
        <input name="estimated_days_max" type="number" min="1" max="30" defaultValue="3" required />
      </div>
      <button className="primary-button">{ar ? "إضافة منطقة" : "Add area"}</button>
    </form>
    <div className="admin-cards">{rates.map((rate) => <article key={rate.id}><div><strong>{ar ? rate.name_ar : rate.name_en}</strong><small>{rate.amount} OMR · {rate.estimated_days_min}-{rate.estimated_days_max} {ar ? "أيام" : "days"}{rate.free_over ? ` · ${ar ? "مجاني فوق" : "free over"} ${rate.free_over}` : ""}</small></div><button className="danger-link" onClick={() => void remove(rate.id)}>{ar ? "حذف" : "Delete"}</button></article>)}</div>
  </main>;
}
