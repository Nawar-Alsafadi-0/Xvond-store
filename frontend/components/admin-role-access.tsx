"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { AdminCatalogPromotions } from "./admin-catalog-promotions";
import { AdminHistoryGuard } from "./admin-history-guard";
import { OperatorCatalog } from "./operator-catalog";
import { OperatorOrders } from "./operator-orders";
import { OrderFulfillmentAdmin } from "./order-fulfillment-admin";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type Role = "admin" | "operator" | null;
type Session = { role: "admin" | "operator"; email: string };

function useAdminRole() {
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRole() {
      const response = await fetch(`${apiUrl}/auth/admin/me`, { credentials: "include", cache: "no-store" });
      if (!response.ok) {
        setRole(null);
        return;
      }
      const session = await response.json() as Session;
      setRole(session.role);
    }
    void loadRole().catch(() => setRole(null)).finally(() => setLoading(false));
  }, []);

  return { role, loading };
}

function Unauthorized({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  return <main className="content-page shell">
    <h1>{ar ? "لوحة الإدارة" : "Admin"}</h1>
    <p>{ar ? "سجل دخول الإدارة أولاً." : "Sign in to admin first."}</p>
    <Link className="primary-button" href={`/${locale}/admin`}>{ar ? "تسجيل الدخول" : "Sign in"}</Link>
  </main>;
}

export function AdminCatalogByRole({ locale }: { locale: Locale }) {
  const { role, loading } = useAdminRole();
  const ar = locale === "ar";
  if (loading) return <main className="content-page shell"><p>{ar ? "جارٍ التحميل…" : "Loading…"}</p></main>;
  if (role === "operator") return <AdminHistoryGuard locale={locale}><OperatorCatalog locale={locale} /></AdminHistoryGuard>;
  if (role === "admin") return <AdminHistoryGuard locale={locale}><AdminCatalogPromotions locale={locale} /></AdminHistoryGuard>;
  return <Unauthorized locale={locale} />;
}

export function AdminOrdersByRole({ locale }: { locale: Locale }) {
  const { role, loading } = useAdminRole();
  const ar = locale === "ar";
  if (loading) return <main className="content-page shell"><p>{ar ? "جارٍ التحميل…" : "Loading…"}</p></main>;
  if (role === "operator") return <AdminHistoryGuard locale={locale}><OperatorOrders locale={locale} /></AdminHistoryGuard>;
  if (role === "admin") return <AdminHistoryGuard locale={locale}><OrderFulfillmentAdmin locale={locale} /></AdminHistoryGuard>;
  return <Unauthorized locale={locale} />;
}
