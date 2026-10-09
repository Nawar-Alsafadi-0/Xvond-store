import { notFound } from "next/navigation";
import { AdminOrdersByRole } from "@/components/admin-role-access";
import { isLocale } from "@/lib/i18n";

export default async function OrdersAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminOrdersByRole locale={locale} />;
}
