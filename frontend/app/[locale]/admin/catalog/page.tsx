import { notFound } from "next/navigation";
import { AdminCatalogByRole } from "@/components/admin-role-access";
import { isLocale } from "@/lib/i18n";

export default async function AdminCatalogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminCatalogByRole locale={locale} />;
}
