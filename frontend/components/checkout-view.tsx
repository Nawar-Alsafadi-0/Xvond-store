"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { formatPrice } from "@/lib/catalog";
import type { Locale } from "@/lib/i18n";
import { useCommerce } from "./commerce-provider";

const coordinate = (min: number, max: number) => z.string()
  .min(1)
  .regex(/^-?\d+(?:\.\d+)?$/)
  .transform(Number)
  .refine((value) => value >= min && value <= max);

const checkoutSchema = z.object({
  fullName: z.string().trim().min(2).max(180),
  phone: z.string().trim().min(8).max(20),
  governorate: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  addressLine: z.string().trim().min(5).max(220),
  latitude: coordinate(-90, 90),
  longitude: coordinate(-180, 180),
});

const GOVERNORATES = [
  ["muscat", "مسقط", "Muscat"],
  ["dhofar", "ظفار", "Dhofar"],
  ["musandam", "مسندم", "Musandam"],
  ["al buraimi", "البريمي", "Al Buraimi"],
  ["ad dakhiliyah", "الداخلية", "Ad Dakhiliyah"],
  ["north al batinah", "شمال الباطنة", "North Al Batinah"],
  ["south al batinah", "جنوب الباطنة", "South Al Batinah"],
  ["north ash sharqiyah", "شمال الشرقية", "North Ash Sharqiyah"],
  ["south ash sharqiyah", "جنوب الشرقية", "South Ash Sharqiyah"],
  ["al wusta", "الوسطى", "Al Wusta"],
  ["ad dhahirah", "الظاهرة", "Ad Dhahirah"],
] as const;

type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  phone?: string | null;
};

type SessionResult = {
  authenticated: boolean;
  profile?: Profile | null;
};

type ManualOrder = {
  order_number: string;
  grand_total: string | number;
};

type Quote = {
  shipping_total: string | number;
  grand_total: string | number;
  shipping_available: boolean;
  estimated_days_min: number | null;
  estimated_days_max: number | null;
};

type Location = { latitude: number; longitude: number; accuracy: number | null };

export function CheckoutView({ locale }: { locale: Locale }) {
  const { cart, clearCart } = useCommerce();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [location, setLocation] = useState<Location | null>(null);
  const [governorate, setGovernorate] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<ManualOrder | null>(null);
  const ar = locale === "ar";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
  const subtotal = cart.reduce((total, line) => total + line.product.price * line.quantity, 0);

  const checkoutItems = useMemo(
    () => cart.map((line) => ({
      product_slug: line.product.slug,
      variant_id: line.product.variantId ?? null,
      quantity: line.quantity,
    })),
    [cart],
  );

  useEffect(() => {
    let active = true;
    void fetch(`${apiUrl}/auth/session`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return { authenticated: false } as SessionResult;
        return await response.json() as SessionResult;
      })
      .then((session) => {
        if (!active) return;
        setProfile(session.authenticated ? session.profile ?? null : null);
      })
      .catch(() => { if (active) setProfile(null); })
      .finally(() => { if (active) setSessionReady(true); });
    return () => { active = false; };
  }, [apiUrl]);

  async function updateGovernorate(nextGovernorate: string) {
    setGovernorate(nextGovernorate);
    setQuote(null);
    if (!nextGovernorate || !checkoutItems.length || checkoutItems.some((item) => !item.variant_id)) return;
    setQuoteLoading(true);
    try {
      const response = await fetch(`${apiUrl}/orders/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: checkoutItems, governorate: nextGovernorate }),
      });
      setQuote(response.ok ? await response.json() as Quote : null);
    } catch {
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }

  function captureLocation() {
    setError("");
    if (!navigator.geolocation) {
      setError(ar ? "جهازك لا يدعم تحديد الموقع. جرّب من هاتف يدعم خدمات الموقع." : "This device does not support location services.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError(ar ? "لم نتمكن من تحديد موقعك. اسمح للموقع باستخدام GPS ثم حاول مجدداً." : "We could not get your location. Allow location access and try again.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  async function submit(formData: FormData) {
    setError("");
    const parsed = checkoutSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success || cart.length === 0) {
      setError(ar ? "أكمل بيانات الاستلام وحدد موقعك قبل تأكيد الطلب." : "Complete the delivery details and set your location before placing the order.");
      return;
    }
    if (checkoutItems.some((item) => !item.variant_id)) {
      setError(ar ? "أعد اختيار خيار المنتج قبل إتمام الطلب." : "Please reselect the product option before checkout.");
      return;
    }
    if (quote && !quote.shipping_available) {
      setError(ar ? "التوصيل غير متاح حالياً لهذه المحافظة." : "Delivery is not currently available for this governorate.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${apiUrl}/manual-orders`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: parsed.data,
          items: checkoutItems,
          payment_method: "cash_on_delivery",
        }),
      });

      if (response.status === 401) {
        setProfile(null);
        setError(ar ? "سجّل الدخول أولاً لإكمال الطلب." : "Sign in first to place the order.");
        return;
      }
      if (response.status === 422) {
        setError(ar ? "تعذر التوصيل للعنوان المحدد. راجع المحافظة والعنوان وحاول مجدداً." : "We cannot deliver to this address yet. Check the governorate and try again.");
        return;
      }
      if (!response.ok) throw new Error("order_failed");

      const order = await response.json() as ManualOrder;
      setPlacedOrder(order);
      clearCart();
    } catch {
      setError(ar ? "تعذر تسجيل الطلب الآن. حاول مرة أخرى." : "We could not place the order. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!sessionReady) {
    return <main className="content-page shell commerce-page"><p>{ar ? "جارٍ التحقق من الحساب…" : "Checking your account…"}</p></main>;
  }

  if (!profile) {
    return (
      <main className="content-page shell commerce-page">
        <p className="eyebrow">XVOND STORE</p>
        <h1>{ar ? "سجّل الدخول لإكمال الطلب" : "Sign in to place your order"}</h1>
        <div className="empty-card">
          <p>{ar ? "اختياراتك محفوظة في السلة. سجّل الدخول ثم ارجع لإكمال بيانات التوصيل." : "Your items stay in the cart. Sign in, then return to complete delivery details."}</p>
          <Link className="primary-button" href={`/${locale}/account`}>{ar ? "تسجيل الدخول أو إنشاء حساب" : "Sign in or create an account"}</Link>
        </div>
      </main>
    );
  }

  if (placedOrder) {
    return (
      <main className="content-page shell commerce-page">
        <p className="eyebrow">XVOND STORE</p>
        <h1>{ar ? "تم استلام طلبك" : "Order received"}</h1>
        <div className="empty-card">
          <strong style={{ fontSize: "1.2rem" }}>{placedOrder.order_number}</strong>
          <p>{ar ? "تم تسجيل الطلب بنجاح وهو الآن بانتظار التأكيد من فريق المتجر." : "Your order was placed successfully and is now waiting for store confirmation."}</p>
          <p>{ar ? "الدفع عند الاستلام" : "Cash on delivery"} · {formatPrice(Number(placedOrder.grand_total), locale)}</p>
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
            <Link className="primary-button" href={`/${locale}/account`}>{ar ? "عرض طلباتي" : "View my orders"}</Link>
            <Link className="secondary-button" href={`/${locale}`}>{ar ? "متابعة التسوق" : "Continue shopping"}</Link>
          </div>
        </div>
      </main>
    );
  }

  if (!cart.length) {
    return (
      <main className="content-page shell commerce-page">
        <p className="eyebrow">XVOND STORE</p>
        <h1>{ar ? "الطلب" : "Order"}</h1>
        <div className="empty-card"><p>{ar ? "السلة فارغة." : "Your cart is empty."}</p><Link className="primary-button" href={`/${locale}`}>{ar ? "العودة للمعرض" : "Back to the gallery"}</Link></div>
      </main>
    );
  }

  const finalTotal = quote ? Number(quote.grand_total) : subtotal;
  const shipping = quote ? Number(quote.shipping_total) : 0;

  return (
    <main className="content-page shell commerce-page">
      <p className="eyebrow">XVOND STORE</p>
      <h1>{ar ? "إتمام الطلب" : "Checkout"}</h1>
      <div className="checkout-layout">
        <form className="checkout-form" action={submit}>
          <h2>{ar ? "1. بيانات المستلم" : "1. Recipient details"}</h2>
          <div className="form-grid">
            <label>{ar ? "الاسم الكامل" : "Full name"}<input name="fullName" autoComplete="name" defaultValue={profile.full_name === "Xvond Member" ? "" : profile.full_name} required /></label>
            <label>{ar ? "رقم الهاتف" : "Phone number"}<input name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={profile.phone ?? ""} placeholder="+968" required /></label>
          </div>

          <h2>{ar ? "2. عنوان التوصيل" : "2. Delivery address"}</h2>
          <div className="form-grid">
            <label>{ar ? "المحافظة" : "Governorate"}
              <select name="governorate" value={governorate} onChange={(event) => void updateGovernorate(event.target.value)} required>
                <option value="">{ar ? "اختر المحافظة" : "Choose governorate"}</option>
                {GOVERNORATES.map(([value, labelAr, labelEn]) => <option key={value} value={value}>{ar ? labelAr : labelEn}</option>)}
              </select>
            </label>
            <label>{ar ? "المدينة / المنطقة" : "City / area"}<input name="city" autoComplete="address-level2" placeholder={ar ? "مثال: الخوير" : "Example: Al Khuwair"} required /></label>
          </div>
          <label>{ar ? "العنوان بالتفصيل" : "Detailed address"}<input name="addressLine" autoComplete="street-address" placeholder={ar ? "الشارع، المبنى، رقم الشقة أو أقرب معلم" : "Street, building, apartment or nearest landmark"} required /></label>

          <div className="pending-choice">
            <strong>{ar ? "الموقع على الخريطة" : "Map location"}</strong>
            <p>{ar ? "مطلوب للتوصيل بدقة. اضغط الزر وأعطِ الموقع صلاحية الوصول إلى GPS." : "Required for accurate delivery. Allow location access when prompted."}</p>
            <button className="table-button" type="button" onClick={captureLocation} disabled={locating}>
              {locating ? (ar ? "جارٍ تحديد الموقع…" : "Getting location…") : location ? (ar ? "تحديث موقعي" : "Update my location") : (ar ? "تحديد موقعي الحالي" : "Use my current location")}
            </button>
            {location && <small style={{ display: "block", marginTop: ".6rem" }}>{ar ? "تم تحديد الموقع بنجاح" : "Location captured"}{location.accuracy ? ` · ±${Math.round(location.accuracy)}m` : ""}</small>}
          </div>
          <input type="hidden" name="latitude" value={location?.latitude ?? ""} readOnly />
          <input type="hidden" name="longitude" value={location?.longitude ?? ""} readOnly />

          <h2>{ar ? "3. الدفع" : "3. Payment"}</h2>
          <div className="pending-choice">
            <strong>{ar ? "الدفع عند الاستلام" : "Cash on delivery"}</strong>
            <p>{ar ? "تدفع قيمة الطلب عند استلامه. لا يوجد دفع إلكتروني حالياً." : "Pay when your order is delivered. Online payment is not enabled right now."}</p>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={busy || quoteLoading || !location}>
            {busy ? (ar ? "جارٍ إرسال الطلب…" : "Placing order…") : (ar ? "تأكيد الطلب" : "Place order")}
          </button>
        </form>

        <aside className="order-summary">
          <h2>{ar ? "ملخص الطلب" : "Order summary"}</h2>
          {cart.map((line) => <div key={`${line.product.slug}-${line.product.variantId ?? "default"}`}><span>{line.product.name[locale]} × {line.quantity}</span><strong>{formatPrice(line.product.price * line.quantity, locale)}</strong></div>)}
          <div><span>{ar ? "المجموع الفرعي" : "Subtotal"}</span><strong>{formatPrice(subtotal, locale)}</strong></div>
          <div><span>{ar ? "التوصيل" : "Delivery"}</span><strong>{quoteLoading ? "…" : governorate && quote ? formatPrice(shipping, locale) : (ar ? "اختر المحافظة" : "Choose governorate")}</strong></div>
          <div><span>{ar ? "الإجمالي" : "Total"}</span><strong>{formatPrice(finalTotal, locale)}</strong></div>
          {quote?.shipping_available && quote.estimated_days_min && quote.estimated_days_max && <p>{ar ? `التوصيل المتوقع خلال ${quote.estimated_days_min}–${quote.estimated_days_max} أيام.` : `Estimated delivery in ${quote.estimated_days_min}–${quote.estimated_days_max} days.`}</p>}
          {governorate && quote && !quote.shipping_available && <p className="form-error">{ar ? "التوصيل غير متاح لهذه المحافظة حالياً." : "Delivery is not available for this governorate yet."}</p>}
        </aside>
      </div>
    </main>
  );
}
