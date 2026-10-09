import { notFound } from "next/navigation";
import { AdminReturns } from "@/components/admin-returns";
import { isLocale } from "@/lib/i18n";

export default async function AdminReturnsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminReturns locale={locale} />;
}
