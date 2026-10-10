"use client";

import Image from "next/image";
import Link from "next/link";
import { HeartIcon, ShoppingBagIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import type { Locale } from "@/lib/i18n";
import type { Product } from "@/lib/catalog";
import { formatPrice } from "@/lib/catalog";
import { isLocalImageSource, normalizeProductImageSource } from "@/lib/product-image";
import { useCommerce } from "./commerce-provider";

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
