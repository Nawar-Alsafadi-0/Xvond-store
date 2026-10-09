"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
};

export function AdminCustomers({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const me = await fetch(`${apiUrl}/auth/admin/me`, { credentials: "include", cache: "no-store" });
      if (!me.ok) { setAuthorized(false); return; }
      setAuthorized(true);
      const response = await fetch(`${apiUrl}/admin/customers`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("customers");
      setCustomers(await response.json() as Customer[]);
      setMessage("");
    } catch {
      setMessage(ar ? "تعذر تحميل العملاء." : "Could not load customers.");
    }
  }, [ar]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((customer) => [customer.name, customer.email || "", customer.phone]
      .some((value) => value.toLowerCase().includes(needle)));
  }, [customers, query]);

  if (authorized === null) return <main className="content-page shell"><p>{ar ? "جارٍ التحميل…" : "Loading…"}</p></main>;
  if (!authorized) return <main className="content-page shell"><h1>{ar ? "العملاء" : "Customers"}</h1><p>{ar ? "سجل دخول الإدارة أولًا." : "Sign in to admin first."}</p><Link className="primary-button" href={`/${locale}/admin`}>{ar ? "دخول الإدارة" : "Admin sign in"}</Link></main>;

  return <main className="content-page shell commerce-page">
    <p className="eyebrow">XVOND STORE ADMIN</p>
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
      <div><h1>{ar ? "العملاء" : "Customers"}</h1><p><Link href={`/${locale}/admin`}>← {ar ? "لوحة التحكم" : "Control center"}</Link></p></div>
      <button className="secondary-button" onClick={() => void load()}>{ar ? "تحديث" : "Refresh"}</button>
    </div>

    {message && <p className="admin-message">{message}</p>}

    <div className="admin-kpis" style={{ marginBlock: "1.5rem" }}>
      <article><span>{ar ? "إجمالي العملاء" : "Total customers"}</span><strong>{customers.length}</strong></article>
      <article><span>{ar ? "لديهم بريد" : "With email"}</span><strong>{customers.filter((item) => Boolean(item.email)).length}</strong></article>
      <article><span>{ar ? "لديهم هاتف" : "With phone"}</span><strong>{customers.filter((item) => Boolean(item.phone)).length}</strong></article>
    </div>

    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "ابحث بالاسم أو البريد أو الهاتف…" : "Search name, email or phone…"} style={{ width: "100%", maxWidth: 520, marginBottom: "1rem" }} />

    <div className="admin-cards">
      {filtered.map((customer) => <article key={customer.id}>
        <div>
          <strong>{customer.name || (ar ? "عميل" : "Customer")}</strong>
          <small style={{ display: "block" }}>{customer.phone || (ar ? "بدون رقم هاتف" : "No phone")}</small>
          <small style={{ display: "block" }}>{customer.email || (ar ? "بدون بريد إلكتروني" : "No email")}</small>
        </div>
      </article>)}
      {!filtered.length && <article><p>{ar ? "لا يوجد عملاء مطابقون." : "No matching customers."}</p></article>}
    </div>
  </main>;
}
