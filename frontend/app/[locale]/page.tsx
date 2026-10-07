import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLongRightIcon, ShieldCheckIcon, SparklesIcon, TruckIcon } from "@heroicons/react/24/outline";
import { ProductCard } from "@/components/product-card";
import { getProducts } from "@/lib/catalog";
import { isLocale } from "@/lib/i18n";
import { absoluteUrl } from "@/lib/urls";
import styles from "./curated-home.module.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  return {
    title: { absolute: "Xvond Store — Curated Finds" },
    description: locale === "ar"
      ? "مجموعة صغيرة ومتجددة من القطع المختارة بعناية. اكتشف ما هو موجود الآن في Xvond Store."
      : "A small, changing collection of carefully selected finds. Discover what is available now at Xvond Store.",
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
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const products = await getProducts({ sort: "newest", limit: 24 });

  const badgeFor = (index: number, stock: number) => {
    if (stock === 1) return ar ? "قطعة واحدة" : "One piece";
    if (index < 3) return ar ? "وصل حديثاً" : "New find";
    return ar ? "مختارة" : "Handpicked";
  };

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <Image
          src={`${basePath}/assets/hero-no-text.png`}
          alt=""
          fill
          priority
          sizes="100vw"
          className={styles.heroImage}
        />

        <div className={styles.heroCopy} dir={ar ? "rtl" : "ltr"}>
          <p className={styles.eyebrow}>{ar ? "XVOND / قطع مختارة" : "XVOND / CURATED FINDS"}</p>
          <h1 id="hero-title" className={styles.heroTitle}>
            {ar ? "مو متجر كل شيء." : "NOT A STORE OF EVERYTHING."}
            <span>{ar ? "كل قطعة هون إلها سبب." : "EVERY PIECE IS HERE FOR A REASON."}</span>
          </h1>
          <p className={styles.heroDescription}>
            {ar
              ? "مجموعة صغيرة ومتغيّرة من الأشياء التي لفتتنا فعلًا. ما منعبّي رفوف لمجرد التعبئة؛ منضيف القطعة لما تستحق تكون هون."
              : "A small, changing collection of things that genuinely caught our attention. We do not fill shelves for the sake of it — a piece appears here when it earns its place."}
          </p>

          <div className={styles.heroActions}>
            <Link href="#collection" className={styles.primaryCta}>
              {ar ? "شوف القطع الموجودة" : "See what is here"}
              <ArrowLongRightIcon width={18} aria-hidden="true" />
            </Link>
            <Link href={`/${locale}/search`} className={styles.secondaryCta}>
              {ar ? "عم تدور على شي معيّن؟" : "Looking for something?"}
            </Link>
          </div>

          <ul className={styles.heroNotes}>
            <li><SparklesIcon aria-hidden="true" /><span>{ar ? "اختيار قطعة بقطعة" : "Chosen piece by piece"}</span></li>
            <li><TruckIcon aria-hidden="true" /><span>{ar ? "توصيل داخل عُمان" : "Delivery in Oman"}</span></li>
            <li><ShieldCheckIcon aria-hidden="true" /><span>{ar ? "تسوّق ودفع آمن" : "Secure shopping"}</span></li>
          </ul>
        </div>
      </section>

      <section className={styles.editorial} aria-labelledby="store-idea-title">
        <div className={styles.editorialIntro}>
          <p>{ar ? "فكرة المتجر" : "THE STORE IDEA"}</p>
          <h2 id="store-idea-title">
            {ar ? "تدخل لتكتشف شو موجود اليوم، مو لتضيع بين ألف قسم." : "Come in to discover what is here today — not to get lost in a thousand departments."}
          </h2>
        </div>

        <div className={styles.editorialPoints}>
          <div className={styles.editorialPoint}>
            <strong>{ar ? "مجموعة صغيرة" : "Small collection"}</strong>
            <span>{ar ? "الموجود قدّامك هو المجموعة الحالية، بدون أقسام فاضية أو حشو." : "What you see is the current collection, without empty departments or filler."}</span>
          </div>
          <div className={styles.editorialPoint}>
            <strong>{ar ? "منوّعة عن قصد" : "Mixed on purpose"}</strong>
            <span>{ar ? "تقنية، قطعة للبيت، هدية أو شيء غريب — المعيار إنه يستحق العرض." : "Tech, home, gifts or something unexpected — the rule is simply that it deserves a place here."}</span>
          </div>
          <div className={styles.editorialPoint}>
            <strong>{ar ? "بتتغيّر باستمرار" : "Always changing"}</strong>
            <span>{ar ? "منضيف ونبدّل القطع مع الوقت، فكل زيارة ممكن تلاقي فيها شيء جديد." : "Pieces are added and rotated over time, so the store can feel different on every visit."}</span>
          </div>
        </div>
      </section>

      <section id="collection" className={styles.collection} aria-labelledby="collection-title">
        <div className={styles.collectionHeading}>
          <div>
            <p>{ar ? "الموجود حالياً" : "AVAILABLE NOW"}</p>
            <h2 id="collection-title">{ar ? "المجموعة الحالية" : "The Current Collection"}</h2>
          </div>
          <small>
            {ar
              ? "كل القطع المنشورة حالياً بمكان واحد. ما في داعي تعرف بأي تصنيف لازم تدور."
              : "Every published piece in one place. No need to decide which category it belongs to before you browse."}
          </small>
        </div>

        {products.length ? (
          <div className={styles.collectionGrid}>
            {products.map((product, index) => (
              <div className={styles.item} key={product.id}>
                <span className={styles.findTag}>{badgeFor(index, product.stock)}</span>
                <ProductCard product={product} locale={locale} />
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyState}>
            {ar ? "المجموعة الجديدة قيد التجهيز. ارجع قريباً." : "The next collection is being prepared. Check back soon."}
          </p>
        )}
      </section>

      <section className={styles.closing}>
        <p>{ar ? "مو كتالوج لا نهائي" : "NOT AN ENDLESS CATALOGUE"}</p>
        <h2>{ar ? "لما نلاقي قطعة تستحق، منضيفها." : "When we find something worth keeping, it joins the collection."}</h2>
        <span>
          {ar
            ? "Xvond Store رح يكبر مع الوقت، لكن الفكرة بتضل نفسها: عدد أقل، اختيار أحسن، وتصفّح ممتع مثل محل تدخل عليه لتشوف شو وصل جديد."
            : "Xvond Store will grow over time, but the idea stays the same: fewer things, better choices, and the feeling of walking into a shop to see what just arrived."}
        </span>
      </section>
    </main>
  );
}
