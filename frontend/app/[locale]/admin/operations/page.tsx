import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

export default async function AdminOperationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/admin/catalog`);
}
