import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product-card";
import { getProducts } from "@/lib/catalog";
import { isLocale } from "@/lib/i18n";
import { absoluteUrl } from "@/lib/urls";
import styles from "./curated-home.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: { absolute: "XVOND VAULT" },
    description: locale === "ar"
      ? "مختارات منتقاة بعناية من XVOND VAULT."
      : "A considered selection from XVOND VAULT.",
    alternates: {
      canonical: absoluteUrl(`/${locale}`),
      languages: { "ar-OM": absoluteUrl("/ar"), "en-OM": absoluteUrl("/en") },
    },
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const ar = locale === "ar";
  const products = await getProducts({ sort: "newest", limit: 48 });

  return (
    <main className={styles.page}>
      <header className={styles.intro} dir={ar ? "rtl" : "ltr"}>
        <p>XVOND VAULT</p>
        <h1>{ar ? "المختارات" : "The Selection"}</h1>
        <span>{ar ? "مختارات منتقاة بعناية، بهوية واضحة وتفاصيل تستحق الاقتناء." : "A considered edit of distinctive pieces, selected for detail and character."}</span>
      </header>

      <section className={styles.gallery} aria-label={ar ? "المنتجات المتوفرة" : "Available products"}>
        {products.length ? (
          <div className={styles.grid}>
            {products.map((product) => (
              <div className={styles.item} key={product.id}>
                <ProductCard product={product} locale={locale} />
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyState}>{ar ? "لا توجد قطع متوفرة حالياً." : "No pieces are available right now."}</p>
        )}
      </section>
    </main>
  );
}
