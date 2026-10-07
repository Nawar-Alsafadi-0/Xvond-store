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
    title: { absolute: "Xvond Store" },
    description: locale === "ar"
      ? "شاهد القطع المتوفرة حالياً في Xvond Store."
      : "Browse the pieces currently available at Xvond Store.",
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
        <p>XVOND STORE</p>
        <h1>{ar ? "المعرض" : "The Gallery"}</h1>
        <span>{ar ? "القطع المتوفرة حالياً. تصفّح واختر القطعة التي تعجبك." : "The pieces available right now. Browse and choose what catches your eye."}</span>
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
