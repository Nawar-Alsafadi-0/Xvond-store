export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];

export const isLocale = (value: string): value is Locale =>
  locales.includes(value as Locale);

export const direction = (locale: Locale) => (locale === "ar" ? "rtl" : "ltr");

export const copy = {
  ar: {
    search: "ابحث عن منتج أو هدية",
    women: "نساء",
    kids: "أطفال",
    electronics: "إلكترونيات",
    boxes: "Gift Box",
    gifts: "هدايا فاخرة",
    newArrivals: "وصل حديثًا",
    bestSellers: "الأكثر مبيعًا",
    shopNow: "تسوّق الآن",
    discover: "اكتشف المجموعة",
    heroEyebrow: "اختيارات استثنائية، في مكان واحد",
    heroTitle: "تسوّق بذوق مختلف.",
    heroBody: "منتجات مختارة بعناية، هدايا فاخرة، وبوكسات جاهزة تترك انطباعًا.",
    boxTitle: "هدية جاهزة للحظة التي تهمك",
    boxBody: "Gift Box يجمع منتجات مختارة وتغليفًا أنيقًا لتصل هديتك جاهزة.",
    luxuryTitle: "هدايا لا تُنسى",
    luxuryBody: "تشكيلة أنيقة للمناسبات الكبيرة والتفاصيل الصغيرة.",
    delivery: "توصيل موثوق",
    secure: "تسوّق آمن",
    support: "دعم قريب منك",
    cart: "السلة",
    wishlist: "المفضلة"
  },
  en: {
    search: "Search products or gifts",
    women: "Women",
    kids: "Kids",
    electronics: "Electronics",
    boxes: "Gift Box",
    gifts: "Luxury Gifts",
    newArrivals: "New Arrivals",
    bestSellers: "Best Sellers",
    shopNow: "Shop now",
    discover: "Explore collection",
    heroEyebrow: "Exceptional finds, one destination",
    heroTitle: "Shop with a different taste.",
    heroBody: "Curated products, luxury gifts, and ready-to-gift boxes designed to leave an impression.",
    boxTitle: "Ready for the moment that matters",
    boxBody: "Gift Box pairs curated products with elegant wrapping, ready to gift.",
    luxuryTitle: "Gifts worth remembering",
    luxuryBody: "An elegant selection for major occasions and thoughtful moments.",
    delivery: "Reliable delivery",
    secure: "Secure shopping",
    support: "Helpful support",
    cart: "Cart",
    wishlist: "Wishlist"
  }
} as const;

