import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getCategories } from "./catalog";
import HomePage from "@/app/[locale]/page";
import SearchPage from "@/app/[locale]/search/page";
import NewArrivalsPage from "@/app/[locale]/new-arrivals/page";
import sitemap from "@/app/sitemap";
import config from "../next.config";

vi.mock("@/components/product-card", () => ({ ProductCard: ({ product }: { product: { slug: string } }) => <article>{product.slug}</article> }));

const products = ["women", "kids", "electronics", "automotive", "luxury-gifts", "xvond-box", "custom-category"].map((slug) => ({
  id: slug, slug: `product-${slug}`, sku: slug, name_ar: slug, name_en: slug,
  category: { id: slug, slug, name_ar: slug, name_en: slug }, variants: [],
}));

function mockCatalog() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    return { ok: true, json: async () => url.includes("/catalog/categories") ? [{ id: "live-women", slug: "women", name_ar: "نساء", name_en: "Fashion", description_en: "Clothing" }] : products } as Response;
  });
}

afterEach(() => vi.restoreAllMocks());

describe("single XVOND VAULT storefront", () => {
  it("uses the agreed department names even with the old live catalog labels", async () => {
    mockCatalog();
    const categories = await getCategories();
    expect(categories.map((c) => c.label.ar)).toEqual(["تقنية وإكسسوارات", "للنساء", "للأطفال", "للسيارة", "هدايا مميزة", "Xvond Box"]);
    expect(categories.find((c) => c.slug === "women")).toMatchObject({ id: "live-women", label: { en: "For Women" } });
  });

  it.each(["ar", "en"])("opens %s directly as a product gallery without category navigation", async (locale) => {
    mockCatalog();
    const html = renderToStaticMarkup(await HomePage({ params: Promise.resolve({ locale }) }));
    for (const product of products) expect(html).toContain(product.slug);
    expect(html).not.toContain(`/${locale}/category/`);
    expect(html).not.toContain(`/${locale}/new-arrivals`);
    expect(html).not.toMatch(/Lifestyle|Choose Your Store|اختر متجرك|وصل حديث|New Arrival|Handpicked/);
    expect(html).toContain("XVOND VAULT");
    expect(html).toContain(locale === "ar" ? "المختارات" : "The Selection");
  });

  it.each([undefined, "lifestyle", "smart"])("searches all departments with legacy store=%s", async (store) => {
    const fetch = mockCatalog();
    const html = renderToStaticMarkup(await SearchPage({ params: Promise.resolve({ locale: "ar" }), searchParams: Promise.resolve({ q: "device", store }) }));
    for (const product of products) expect(html).toContain(product.slug);
    expect(String(fetch.mock.calls[0][0])).toContain("query=device");
    expect(html).not.toContain("Lifestyle");
  });

  it("paginates new arrivals across all departments", async () => {
    const fetch = mockCatalog();
    const html = renderToStaticMarkup(await NewArrivalsPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({ page: "2" }) }));
    expect(String(fetch.mock.calls[0][0])).toContain("offset=24");
    for (const product of products) expect(html).toContain(product.slug);
    expect(html).toContain("/en/new-arrivals?page=1");
  });

  it("indexes the unified store and keeps products from every department", async () => {
    mockCatalog();
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls.some((url) => url.includes("/lifestyle") || url.includes("/smart"))).toBe(false);
    for (const locale of ["ar", "en"]) {
      expect(urls.some((url) => url.endsWith(`/${locale}/new-arrivals`))).toBe(true);
      for (const product of products) expect(urls.some((url) => url.endsWith(`/${locale}/product/${product.slug}`))).toBe(true);
    }
  });

  it("permanently redirects both old storefronts and their new-arrivals pages", async () => {
    const redirects = await config.redirects!();
    for (const channel of ["lifestyle", "smart"]) {
      expect(redirects).toContainEqual({ source: `/:locale(ar|en)/${channel}`, destination: "/:locale", permanent: true });
      expect(redirects).toContainEqual({ source: `/:locale(ar|en)/${channel}/new-arrivals`, destination: "/:locale/new-arrivals", permanent: true });
    }
  });
});
