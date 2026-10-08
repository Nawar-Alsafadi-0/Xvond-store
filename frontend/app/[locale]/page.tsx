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
      ? "اكتشف المختارات المتوفرة حالياً في XVOND VAULT."
      : "Discover the pieces currently available at XVOND VAULT.",
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
        <span>{ar ? "قطع مختارة ومتجددة بكميات محدودة. إذا لفتتك قطعة، لا تفترض أنها ستبقى." : "A rotating selection of distinctive pieces in limited quantities. If something catches your eye, do not assume it will stay."}</span>
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
          <p className={styles.emptyState}>{ar ? "لا توجد قطع معروضة حالياً." : "No pieces are on display right now."}</p>
        )}
      </section>
    </main>
  );
}
