"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const AUTH_RETURN_KEY = "xvond_auth_return_to";

type Providers = { email: boolean; phone: boolean; google: boolean; apple: boolean; facebook: boolean };

export function MultiAuthOptions({ locale, returnTo = null }: { locale: Locale; returnTo?: string | null }) {
  const ar = locale === "ar";
  const [providers, setProviders] = useState<Providers>({
    email: true,
    phone: false,
    google: false,
    apple: false,
    facebook: false,
  });

  useEffect(() => {
    void Promise.all([
      fetch(`${apiUrl}/auth/providers`).then(async (response) => response.ok ? response.json() as Promise<Omit<Providers, "facebook">> : null),
      fetch(`${apiUrl}/auth/facebook/status`).then(async (response) => response.ok ? response.json() as Promise<{ enabled: boolean }> : null),
    ]).then(([base, facebook]) => {
      if (base) setProviders({ ...base, facebook: Boolean(facebook?.enabled) });
    }).catch(() => undefined);
  }, []);

  function rememberReturnPath() {
    if (!returnTo) return;
    window.sessionStorage.setItem(AUTH_RETURN_KEY, returnTo);
  }

  if (!providers.google && !providers.apple && !providers.facebook) return null;

  return <div className="multi-auth-options">
    <p>{ar ? "أو تابع باستخدام" : "Or continue with"}</p>
    <div className="admin-actions">
      {providers.google && <a className="secondary-button" href={`${apiUrl}/auth/google/start?locale=${locale}`} onClick={rememberReturnPath}>Google</a>}
      {providers.facebook && <a className="secondary-button" href={`${apiUrl}/auth/facebook/start?locale=${locale}`} onClick={rememberReturnPath}>Facebook</a>}
      {providers.apple && <a className="secondary-button" href={`${apiUrl}/auth/apple/start?locale=${locale}`} onClick={rememberReturnPath}>Apple</a>}
    </div>
  </div>;
}
