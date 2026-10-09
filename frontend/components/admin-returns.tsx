"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type ReturnStatus = "requested" | "reviewing" | "approved" | "rejected" | "received" | "refunded";
type ReturnRequest = {
  id: string;
  order_number: string;
  status: ReturnStatus;
  reason: string;
  created_at: string;
};

const STATUSES: ReturnStatus[] = ["requested", "reviewing", "approved", "received", "refunded", "rejected"];

export function AdminReturns({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [items, setItems] = useState<ReturnRequest[]>([]);
  const [filter, setFilter] = useState<"all" | ReturnStatus>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const me = await fetch(`${apiUrl}/auth/admin/me`, { credentials: "include", cache: "no-store" });
      if (!me.ok) { setAuthorized(false); return; }
      setAuthorized(true);
      const response = await fetch(`${apiUrl}/admin/returns`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("returns");
      setItems(await response.json() as ReturnRequest[]);
      setMessage("");
    } catch {
      setMessage(ar ? "تعذر تحميل طلبات الاسترجاع." : "Could not load return requests.");
    }
  }, [ar]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const visible = useMemo(() => filter === "all" ? items : items.filter((item) => item.status === filter), [filter, items]);

  function statusLabel(status: ReturnStatus) {
    const labels: Record<ReturnStatus, [string, string]> = {
      requested: ["جديد", "Requested"],
      reviewing: ["قيد المراجعة", "Reviewing"],
      approved: ["موافق عليه", "Approved"],
      rejected: ["مرفوض", "Rejected"],
      received: ["تم استلام المرتجع", "Received"],
      refunded: ["تم رد المبلغ", "Refunded"],
    };
    return labels[status][ar ? 0 : 1];
  }

  async function updateStatus(id: string, status: ReturnStatus) {
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}/admin/returns/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("update");
      await load();
      setMessage(ar ? "تم تحديث حالة الاسترجاع." : "Return status updated.");
    } catch {
      setMessage(ar ? "تعذر تحديث الحالة." : "Could not update the status.");
    } finally {
      setBusyId(null);
    }
  }

  if (authorized === null) return <main className="content-page shell"><p>{ar ? "جارٍ التحميل…" : "Loading…"}</p></main>;
  if (!authorized) return <main className="content-page shell"><h1>{ar ? "الاسترجاعات" : "Returns"}</h1><p>{ar ? "سجل دخول الإدارة أولًا." : "Sign in to admin first."}</p><Link className="primary-button" href={`/${locale}/admin`}>{ar ? "دخول الإدارة" : "Admin sign in"}</Link></main>;

  return <main className="content-page shell commerce-page">
    <p className="eyebrow">XVOND STORE ADMIN</p>
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
      <div><h1>{ar ? "طلبات الاسترجاع" : "Return requests"}</h1><p><Link href={`/${locale}/admin`}>← {ar ? "لوحة التحكم" : "Control center"}</Link></p></div>
      <button className="secondary-button" onClick={() => void load()}>{ar ? "تحديث" : "Refresh"}</button>
    </div>

    {message && <p className="admin-message">{message}</p>}

    <div className="admin-kpis" style={{ marginBlock: "1.5rem" }}>
      <article><span>{ar ? "إجمالي الطلبات" : "Total requests"}</span><strong>{items.length}</strong></article>
      <article><span>{ar ? "تحتاج مراجعة" : "Needs review"}</span><strong>{items.filter((item) => item.status === "requested" || item.status === "reviewing").length}</strong></article>
      <article><span>{ar ? "مكتملة" : "Completed"}</span><strong>{items.filter((item) => item.status === "refunded" || item.status === "rejected").length}</strong></article>
    </div>

    <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
      <button type="button" className={filter === "all" ? "primary-button" : "secondary-button"} onClick={() => setFilter("all")}>{ar ? "الكل" : "All"}</button>
      {STATUSES.map((status) => <button key={status} type="button" className={filter === status ? "primary-button" : "secondary-button"} onClick={() => setFilter(status)}>{statusLabel(status)}</button>)}
    </div>

    <div className="admin-cards">
      {visible.map((item) => <article key={item.id} style={{ alignItems: "stretch", gap: "1rem", opacity: busyId === item.id ? .65 : 1 }}>
        <div>
          <strong>{item.order_number}</strong>
          <small style={{ display: "block" }}>{new Date(item.created_at).toLocaleString(ar ? "ar-OM" : "en-OM")}</small>
          <small style={{ display: "block" }}>{statusLabel(item.status)}</small>
          <p>{item.reason}</p>
        </div>
        <label style={{ minWidth: 220 }}>{ar ? "الحالة" : "Status"}
          <select value={item.status} disabled={busyId === item.id} onChange={(event) => void updateStatus(item.id, event.target.value as ReturnStatus)}>
            {STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
        </label>
      </article>)}
      {!visible.length && <article><p>{ar ? "لا توجد طلبات استرجاع بهذه الحالة." : "No return requests in this status."}</p></article>}
    </div>
  </main>;
}
