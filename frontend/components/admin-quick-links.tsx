"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export function AdminQuickLinks({ locale }: { locale: Locale }) {
  const [visible, setVisible] = useState(false);
  const ar = locale === "ar";

  useEffect(() => {
    void fetch(`${apiUrl}/auth/admin/me`, { credentials: "include" })
      .then((response) => setVisible(response.ok))
      .catch(() => setVisible(false));
  }, []);

  if (!visible) return null;

  return <nav style={{ position: "fixed", insetInlineEnd: 18, bottom: 18, zIndex: 50, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}><Link className="primary-button" href={`/${locale}/admin/catalog`}>{ar ? "إدارة المتجر" : "Store management"}</Link><Link className="secondary-button" href={`/${locale}/admin/operations`}>{ar ? "تشغيل المتجر" : "Store operations"}</Link><Link className="secondary-button" href={`/${locale}/admin/orders`}>{ar ? "الطلبات" : "Orders"}</Link><Link className="secondary-button" href={`/${locale}/admin/readiness`}>{ar ? "جاهزية الإطلاق" : "Launch readiness"}</Link><Link className="secondary-button" href={`/${locale}/admin/shipping`}>{ar ? "إعدادات التوصيل" : "Delivery settings"}</Link></nav>;
}
