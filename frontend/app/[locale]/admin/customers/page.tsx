import { notFound } from "next/navigation";
import { AdminCustomers } from "@/components/admin-customers";
import { isLocale } from "@/lib/i18n";

export default async function AdminCustomersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminCustomers locale={locale} />;
}
