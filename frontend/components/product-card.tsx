"use client";

import Image from "next/image";
import Link from "next/link";
import { HeartIcon, ShoppingBagIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import type { Locale } from "@/lib/i18n";
import type { Product } from "@/lib/catalog";
import { formatPrice } from "@/lib/catalog";
import { useCommerce } from "./commerce-provider";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function normalizeProductImageSource(source: string): string {
  try {
    const imageUrl = new URL(source);
    const configuredApiUrl = new URL(apiUrl);
    const mediaMarker = "/media/products/";
    const mediaIndex = imageUrl.pathname.indexOf(mediaMarker);
    const localImageHost = imageUrl.hostname === "localhost" || imageUrl.hostname === "127.0.0.1";

    if (mediaIndex >= 0 && localImageHost) {
      const apiPath = configuredApiUrl.pathname.replace(/\/$/, "");
      const mediaPath = imageUrl.pathname.slice(mediaIndex);
      return `${configuredApiUrl.origin}${apiPath}${mediaPath}${imageUrl.search}`;
    }
  } catch {
    // Relative placeholders and already-valid image URLs can be used as-is.
  }

  return source;
}

function isLocalImageSource(source: string): boolean {
  try {
    const imageUrl = new URL(source);
    return imageUrl.hostname === "localhost" || imageUrl.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function ProductCard({ product, locale }: { product: Product; locale: Locale }) {
  const { addToCart, toggleWishlist, wishlist } = useCommerce();
  const wished = wishlist.includes(product.slug);
  const discount = product.previousPrice && product.previousPrice > product.price
    ? Math.round((1 - product.price / product.previousPrice) * 100)
    : 0;
  const ar = locale === "ar";
  const productHref = `/${locale}/product/${product.slug}`;
  const imageSource = normalizeProductImageSource(product.image);

  return (
    <article className="product-card marketplace-product-card">
      <Link href={productHref} className="product-image-wrap marketplace-product-image">
        <Image
          src={imageSource}
          alt={product.name[locale]}
          fill
          sizes="(max-width: 640px) 48vw, (max-width: 1100px) 24vw, 220px"
          className="product-image"
          unoptimized={isLocalImageSource(imageSource)}
        />
        {discount > 0 && <span className="marketplace-discount">-{discount}%</span>}
        {product.stock < 1 && <span className="marketplace-stock-badge">{ar ? "نفد" : "Sold out"}</span>}
      </Link>
      <div className="product-copy marketplace-product-copy">
        <div className="product-info">
          <Link href={productHref} className="product-name">{product.name[locale]}</Link>
          <div className="price-line">
            <strong>{formatPrice(product.price, locale)}</strong>
            {product.previousPrice && <del>{formatPrice(product.previousPrice, locale)}</del>}
          </div>
          {discount > 0 && <small className="saving-label">{ar ? `وفر ${discount}%` : `Save ${discount}%`}</small>}
        </div>
        <div className="card-actions marketplace-card-actions">
          <button type="button" className="quick-cart-button" disabled={product.stock < 1} onClick={() => addToCart(product)} aria-label={ar ? "أضف إلى السلة" : "Add to cart"}><ShoppingBagIcon /><span>{ar ? "أضف" : "Add"}</span></button>
          <button type="button" className={`heart-button ${wished ? "is-wished" : ""}`} onClick={() => toggleWishlist(product.slug)} aria-pressed={wished} aria-label={ar ? "أضف إلى المفضلة" : "Add to wishlist"}>{wished ? <HeartSolidIcon /> : <HeartIcon />}</button>
        </div>
      </div>
    </article>
  );
}
