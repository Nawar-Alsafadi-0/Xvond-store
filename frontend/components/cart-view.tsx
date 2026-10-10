"use client";

import Image from "next/image";
import Link from "next/link";
import { MinusIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { formatPrice } from "@/lib/catalog";
import type { Locale } from "@/lib/i18n";
import { cartLineKey, useCommerce } from "./commerce-provider";

export function CartView({ locale }: { locale: Locale }) {
  const { cart, removeFromCart, updateQuantity } = useCommerce();
  const subtotal = cart.reduce((total, line) => total + line.product.price * line.quantity, 0);
  const ar = locale === "ar";
  const continueHref = `/${locale}`;
  const checkoutHref = `/${locale}/checkout`;

  return (
    <main className="content-page shell commerce-page">
      <p className="eyebrow">XVOND VAULT</p><h1>{ar ? "سلة التسوق" : "Shopping bag"}</h1>
      {cart.length === 0 ? (
        <div className="empty-card"><p>{ar ? "سلة التسوق فارغة." : "Your bag is empty."}</p><Link className="primary-button" href={continueHref}>{ar ? "متابعة التسوق" : "Continue shopping"}</Link></div>
      ) : (
        <div className="cart-layout">
          <div className="cart-lines">
            {cart.map(({ product, quantity }) => {
              const lineKey = cartLineKey(product);
              const productHref = `/${locale}/product/${product.slug}`;
              return (
                <article className="cart-line" key={lineKey}>
                  <div className="cart-thumb"><Image src={product.image} alt={product.name[locale]} fill sizes="100px" /></div>
                  <div className="cart-line-copy">
                    <Link href={productHref}>{product.name[locale]}</Link>
                    {product.variantTitle && <small>{product.variantTitle[locale]}</small>}
                    <strong>{formatPrice(product.price, locale)}</strong>
                  </div>
                  <div className="quantity-control"><button onClick={() => updateQuantity(lineKey, quantity - 1)} aria-label={ar ? "تقليل الكمية" : "Decrease quantity"}><MinusIcon /></button><span>{quantity}</span><button onClick={() => updateQuantity(lineKey, quantity + 1)} aria-label={ar ? "زيادة الكمية" : "Increase quantity"}><PlusIcon /></button></div>
                  <button className="remove-button" onClick={() => removeFromCart(lineKey)} aria-label={ar ? "حذف المنتج" : "Remove product"}><TrashIcon /></button>
                </article>
              );
            })}
          </div>
          <aside className="order-summary"><h2>{ar ? "الملخص" : "Summary"}</h2><div><span>{ar ? "الإجمالي" : "Total"}</span><strong>{formatPrice(subtotal, locale)}</strong></div><Link className="primary-button" href={checkoutHref}>{ar ? "إتمام الشراء" : "Checkout"}</Link></aside>
        </div>
      )}
    </main>
  );
}
