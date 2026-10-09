import type { Locale } from "@/lib/i18n";

export function safeReturnPath(value: string | null | undefined, locale: Locale): string | null {
  if (!value) return null;
  const path = value.trim();
  if (!path || path.includes("\\") || path.startsWith("//")) return null;
  if (path === `/${locale}` || path.startsWith(`/${locale}/`)) return path;
  return null;
}
