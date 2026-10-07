import { notFound } from "next/navigation";
import { AdminControlCenter } from "@/components/admin-control-center";
import { isLocale } from "@/lib/i18n";

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminControlCenter locale={locale} />;
}
