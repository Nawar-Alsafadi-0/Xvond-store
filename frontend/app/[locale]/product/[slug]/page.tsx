import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductPurchase } from "@/components/product-purchase";
import { formatPrice, getProduct } from "@/lib/catalog";
import { isLocale } from "@/lib/i18n";
import { isLocalImageSource, normalizeProductImageSource } from "@/lib/product-image";
import { absoluteUrl } from "@/lib/urls";
import styles from "./product-detail.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const product = await getProduct(slug);
  if (!product) return {};
  return {
    title: product.name[locale],
    description: product.description[locale] || `${product.name[locale]} — Xvond Store`,
    alternates: { canonical: absoluteUrl(`/${locale}/product/${slug}`) },
    openGraph: { title: product.name[locale], images: [product.image] },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const product = await getProduct(slug);
  if (!product) notFound();
  const ar = locale === "ar";
  const discount = product.previousPrice
    ? Math.round((1 - product.price / product.previousPrice) * 100)
    : 0;
  const imageSource = normalizeProductImageSource(product.image);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name[locale],
    description: product.description[locale],
    image: [product.image],
    sku: product.sku,
    offers: {
      "@type": "Offer",
      priceCurrency: "OMR",
      price: product.price,
      availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: absoluteUrl(`/${locale}/product/${slug}`),
    },
  };

  return (
    <main className={`content-page shell ${styles.page}`}>
      <div className={styles.backRow}>
        <Link href={`/${locale}`} className="secondary-button">← {ar ? "المعرض" : "Gallery"}</Link>
        <small>{ar ? "قطعة من Xvond Store" : "Xvond Store selection"}</small>
      </div>

      <section className={styles.layout}>
        <div className={styles.media}>
          <div className={styles.imageWrap}>
            <Image
              src={imageSource}
              alt={product.name[locale]}
              fill
              priority
              sizes="(max-width: 860px) 100vw, 55vw"
              unoptimized={isLocalImageSource(imageSource)}
            />
          </div>
        </div>

        <div className={styles.info}>
          <div>
            <p className="eyebrow">XVOND STORE</p>
            <h1 className={styles.title}>{product.name[locale]}</h1>
          </div>

          <div className={styles.price}>
            <strong>{formatPrice(product.price, locale)}</strong>
            {product.previousPrice && <del>{formatPrice(product.previousPrice, locale)}</del>}
          </div>

          {discount > 0 && <span className={styles.discount}>{ar ? `وفر ${discount}%` : `Save ${discount}%`}</span>}

          {product.description[locale] && <p className={styles.description}>{product.description[locale]}</p>}

          <div className={styles.stock}>
            <span className={styles.dot} aria-hidden="true" />
            <span>{product.stock > 0 ? (ar ? `متوفر الآن — ${product.stock} قطعة` : `Available now — ${product.stock} in stock`) : (ar ? "نفدت الكمية حالياً" : "Currently out of stock")}</span>
          </div>

          <div className={styles.buyBox}>
            <ProductPurchase product={product} locale={locale} />
            <p className={styles.note}>{ar ? "التوصيل مجاني. الدفع حالياً كاش عند الاستلام." : "Delivery is free. Payment is currently cash on delivery."}</p>
          </div>

          <div className={styles.promises}>
            <div className={styles.promise}>
              <strong>{ar ? "توصيل مجاني" : "Free delivery"}</strong>
              <span>{ar ? "التوصيل من طرف فريق المتجر بدون رسوم." : "Delivered directly by the store team at no extra charge."}</span>
            </div>
            <div className={styles.promise}>
              <strong>{ar ? "موقع دقيق" : "Exact location"}</strong>
              <span>{ar ? "تحدد موقعك أثناء إتمام الطلب." : "Set your exact delivery location at checkout."}</span>
            </div>
            <div className={styles.promise}>
              <strong>{ar ? "تتبع الطلب" : "Order tracking"}</strong>
              <span>{ar ? "تابع الطلب من حسابك حتى التسليم." : "Track your order from your account until delivery."}</span>
            </div>
          </div>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </main>
  );
}
