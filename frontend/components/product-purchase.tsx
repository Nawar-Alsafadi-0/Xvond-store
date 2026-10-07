"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice, productWithVariant } from "@/lib/catalog";
import type { Product } from "@/lib/catalog";
import type { Locale } from "@/lib/i18n";
import { useCommerce } from "./commerce-provider";

export function ProductPurchase({ product, locale }: { product: Product; locale: Locale }) {
  const firstAvailable = product.variants.find((variant) => variant.stock > 0) ?? product.variants[0];
  const [variantId, setVariantId] = useState(product.variantId ?? firstAvailable?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const { addToCart } = useCommerce();
  const router = useRouter();
  const ar = locale === "ar";
  const selected = useMemo(
    () => productWithVariant(product, variantId),
    [product, variantId],
  );
  const unavailable = !selected.variantId || selected.stock < 1;
  const maxQuantity = Math.max(1, Math.min(selected.stock || 1, 99));

  function addSelected() {
    if (unavailable) return;
    addToCart(selected, quantity);
    setAdded(true);
  }

  function buyNow() {
    if (unavailable) return;
    addToCart(selected, quantity);
    router.push(`/${locale}/checkout`);
  }

  return (
    <div className="product-purchase">
      {product.variants.length > 1 && (
        <label className="variant-picker">
          <span>{ar ? "اختر الخيار" : "Choose option"}</span>
          <select
            value={variantId}
            onChange={(event) => {
              setVariantId(event.target.value);
              setQuantity(1);
              setAdded(false);
            }}
          >
            {product.variants.map((variant) => (
              <option key={variant.id} value={variant.id} disabled={variant.stock < 1}>
                {variant.title[locale]} · {formatPrice(variant.price, locale)}{variant.stock < 1 ? (ar ? " · غير متوفر" : " · Out of stock") : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected.variantTitle && product.variants.length > 1 && (
        <p className="variant-summary">
          <strong>{selected.variantTitle[locale]}</strong> · {formatPrice(selected.price, locale)} · {ar ? `${selected.stock} متوفر` : `${selected.stock} in stock`}
        </p>
      )}

      {!unavailable && (
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700 }}>{ar ? "الكمية" : "Quantity"}</span>
          <div style={{ display: "inline-flex", alignItems: "center", border: "1px solid currentColor", borderRadius: 999, overflow: "hidden" }}>
            <button type="button" className="text-button" aria-label={ar ? "إنقاص الكمية" : "Decrease quantity"} disabled={quantity <= 1} onClick={() => { setQuantity((value) => Math.max(1, value - 1)); setAdded(false); }}>−</button>
            <strong style={{ minWidth: 34, textAlign: "center" }}>{quantity}</strong>
            <button type="button" className="text-button" aria-label={ar ? "زيادة الكمية" : "Increase quantity"} disabled={quantity >= maxQuantity} onClick={() => { setQuantity((value) => Math.min(maxQuantity, value + 1)); setAdded(false); }}>+</button>
          </div>
          <small>{ar ? `المتاح ${selected.stock}` : `${selected.stock} available`}</small>
        </div>
      )}

      <div style={{ display: "grid", gap: ".65rem" }}>
        <button className="primary-button" type="button" disabled={unavailable} onClick={buyNow}>
          {unavailable ? (ar ? "غير متوفر" : "Out of stock") : (ar ? "اشترِ الآن" : "Buy now")}
        </button>
        <button className="secondary-button" type="button" disabled={unavailable} onClick={addSelected}>
          {unavailable
            ? (ar ? "غير متوفر" : "Out of stock")
            : added
              ? (ar ? "تمت الإضافة للسلة ✓" : "Added to cart ✓")
              : (ar ? "أضف إلى السلة" : "Add to cart")}
        </button>
      </div>
    </div>
  );
}
