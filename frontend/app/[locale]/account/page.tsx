import { notFound } from "next/navigation";
import { AccountView } from "@/components/account-view";
import { ProfileDetailsCard } from "@/components/profile-details";
import { isLocale } from "@/lib/i18n";
import { safeReturnPath } from "@/lib/safe-return-path";

type SearchParams = Promise<{ next?: string | string[] }>;

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const query = await searchParams;
  const requestedNext = Array.isArray(query.next) ? query.next[0] : query.next;
  const returnTo = safeReturnPath(requestedNext, locale);

  return <>
    <AccountView locale={locale} returnTo={returnTo} />
    <ProfileDetailsCard locale={locale} />
  </>;
}
