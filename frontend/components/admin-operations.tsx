"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type Check = { key: string; ready: boolean; detail: string };
type Readiness = { ready: boolean; ready_count: number; total_checks: number; checks: Check[] };

export function AdminOperations({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const me = await fetch(`${apiUrl}/auth/admin/me`, { credentials: "include", cache: "no-store" });
      if (!me.ok) { setAuthorized(false); return; }
      setAuthorized(true);
      const response = await fetch(`${apiUrl}/admin/launch-readiness`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("readiness");
      setReadiness(await response.json() as Readiness);
      setMessage("");
    } catch {
      setMessage(ar ? "تعذر تحميل حالة المتجر." : "Could not load store status.");
    }
  }, [ar]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  if (authorized === null) return <main className="content-page shell"><p>{ar ? "جارٍ التحميل…" : "Loading…"}</p></main>;
  if (!authorized) return <main className="content-page shell"><h1>{ar ? "تشغيل المتجر" : "Store operations"}</h1><p>{ar ? "سجل دخول الإدارة أولًا." : "Sign in to admin first."}</p><Link className="primary-button" href={`/${locale}/admin`}>{ar ? "دخول الإدارة" : "Admin sign in"}</Link></main>;

  return <main className="content-page shell commerce-page">
    <p className="eyebrow">XVOND VAULT ADMIN</p>
    <h1>{ar ? "تشغيل المتجر" : "Store operations"}</h1>
    <p><Link href={`/${locale}/admin`}>← {ar ? "لوحة التحكم" : "Control center"}</Link></p>
    {message && <p className="admin-message">{message}</p>}

    <section style={{ marginBlock: "2rem" }}>
      <div className="section-heading"><div><p>STORE STATUS</p><h2>{ar ? "جاهزية المتجر" : "Store readiness"}</h2></div><button className="secondary-button" onClick={() => void load()}>{ar ? "تحديث" : "Refresh"}</button></div>
      {readiness && <div className="admin-kpis">
        <article><span>{ar ? "الفحوصات الجاهزة" : "Checks ready"}</span><strong>{readiness.ready_count}/{readiness.total_checks}</strong></article>
        <article><span>{ar ? "الحالة" : "Status"}</span><strong>{readiness.ready ? (ar ? "جاهز" : "Ready") : (ar ? "يحتاج مراجعة" : "Needs review")}</strong></article>
      </div>}
    </section>

    <section style={{ marginTop: "2rem" }}>
      <div className="section-heading"><div><p>OPERATIONS</p><h2>{ar ? "الإدارة اليومية" : "Daily operations"}</h2></div></div>
      <div className="admin-cards">
        <article><div><strong>{ar ? "المنتجات والمخزون" : "Products & inventory"}</strong><small>{ar ? "إضافة المنتجات وتعديل السعر والكمية والصورة والظهور." : "Add products and manage price, stock, image and visibility."}</small></div><Link className="primary-button" href={`/${locale}/admin/catalog`}>{ar ? "فتح" : "Open"}</Link></article>
        <article><div><strong>{ar ? "الطلبات" : "Orders"}</strong><small>{ar ? "تأكيد وتجهيز وإخراج الطلبات للتوصيل وتسجيل التسليم." : "Confirm, prepare, dispatch and complete orders."}</small></div><Link className="primary-button" href={`/${locale}/admin/orders`}>{ar ? "فتح" : "Open"}</Link></article>
        <article><div><strong>{ar ? "العملاء" : "Customers"}</strong><small>{ar ? "متابعة بيانات العملاء والبحث السريع." : "Review customer records and search quickly."}</small></div><Link className="primary-button" href={`/${locale}/admin/customers`}>{ar ? "فتح" : "Open"}</Link></article>
        <article><div><strong>{ar ? "الاسترجاعات" : "Returns"}</strong><small>{ar ? "مراجعة طلبات الاسترجاع وتحديث حالتها." : "Review and resolve return requests."}</small></div><Link className="primary-button" href={`/${locale}/admin/returns`}>{ar ? "فتح" : "Open"}</Link></article>
        <article><div><strong>{ar ? "مناطق التوصيل" : "Delivery areas"}</strong><small>{ar ? "التوصيل مجاني؛ حدد المناطق التي يخدمها الفريق والمدة المتوقعة." : "Delivery is free; set service areas and expected delivery time."}</small></div><Link className="primary-button" href={`/${locale}/admin/shipping`}>{ar ? "فتح" : "Open"}</Link></article>
        <article><div><strong>{ar ? "فحص الجاهزية" : "Launch checks"}</strong><small>{ar ? "تفاصيل المتطلبات قبل الإطلاق." : "Detailed checks before launch."}</small></div><Link className="secondary-button" href={`/${locale}/admin/readiness`}>{ar ? "التفاصيل" : "Details"}</Link></article>
      </div>
    </section>
  </main>;
}
