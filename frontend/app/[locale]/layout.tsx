import { Suspense } from "react";
import { notFound } from "next/navigation";
import { direction, isLocale, locales } from "@/lib/i18n";
import { StoreHeader } from "@/components/store-header";
import { StoreFooter } from "@/components/store-footer";
import { MobileStoreNav } from "@/components/mobile-store-nav";
import { absoluteUrl } from "@/lib/urls";
import { CommerceProvider } from "@/components/commerce-provider";
import "../legal.css";
import "../marketplace.css";

export function generateStaticParams() { return locales.map((locale) => ({ locale })); }

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const organization = {
    "@context": "https://schema.org", "@type": "OnlineStore", name: "XVOND VAULT",
    url: absoluteUrl(`/${locale}`), parentOrganization: { "@type": "Organization", name: "Xvond", url: "https://xvond.com" },
    areaServed: { "@type": "Country", name: "Oman" }
  };
  return (
    <div lang={locale} dir={direction(locale)} className={`locale-${locale}`}>
      <CommerceProvider>
        <Suspense fallback={null}><StoreHeader locale={locale} /></Suspense>
        {children}
        <Suspense fallback={null}><StoreFooter locale={locale} /></Suspense>
        <Suspense fallback={null}><MobileStoreNav locale={locale} /></Suspense>
      </CommerceProvider>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization).replace(/</g, "\\u003c") }} />
    </div>
  );
}
