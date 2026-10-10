"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";

export function AdminHistoryGuard({ locale, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    window.history.pushState({ ...window.history.state, xvondAdminSection: true }, "");

    function handlePopState() {
      router.replace(`/${locale}/admin`);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [locale, router]);

  return children;
}
