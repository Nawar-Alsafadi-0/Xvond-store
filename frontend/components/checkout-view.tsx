"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { formatPrice } from "@/lib/catalog";
import type { Locale } from "@/lib/i18n";
import { useCommerce } from "./commerce-provider";

const checkoutSchema = z.object({
  fullName: z.string().trim().min(2).max(180),
  phone: z.string().trim().min(8).max(20),
  governorate: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  addressLine: z.string().trim().min(5).max(220),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
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

type SavedAddress = {
  id: string;
  label: string;
  governorate: string;
  city: string;
  address_line: string;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
type Delivery = { governorate: string; city: string; addressLine: string };

const emptyDelivery: Delivery = { governorate: "", city: "", addressLine: "" };

async function errorDetail(response: Response) {
  try {
    const payload = await response.json() as { detail?: unknown };
    return typeof payload.detail === "string" ? payload.detail : "";
  } catch {
    return "";
  }
}

export function CheckoutView({ locale }: { locale: Locale }) {
  const { cart, clearCart } = useCommerce();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [sessionReady, setSessionReady] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<Delivery>(emptyDelivery);
  const [addressLabel, setAddressLabel] = useState("home");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [location, setLocation] = useState<Location | null>(null);
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
      .then(async (session) => {
        if (!active) return;
        const nextProfile = session.authenticated ? session.profile ?? null : null;
        setProfile(nextProfile);
        if (!nextProfile) return;
        const response = await fetch(`${apiUrl}/account/addresses`, {
          credentials: "include",
          cache: "no-store",
        });
        if (active && response.ok) setAddresses(await response.json() as SavedAddress[]);
      })
      .catch(() => { if (active) setProfile(null); })
      .finally(() => { if (active) setSessionReady(true); });
    return () => { active = false; };
  }, [apiUrl]);

  async function updateQuote(governorate: string) {
    setQuote(null);
    setError("");
    if (!governorate || !checkoutItems.length || checkoutItems.some((item) => !item.variant_id)) return;
    setQuoteLoading(true);
    try {
      const response = await fetch(`${apiUrl}/orders/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: checkoutItems, governorate }),
      });
      if (response.ok) {
        setQuote(await response.json() as Quote);
      } else if (response.status === 409) {
        setError(ar ? "تغيّر مخزون إحدى القطع أو نفدت الكمية. ارجع للسلة وحدّث الكمية قبل المتابعة." : "One of the items changed stock or sold out. Return to the cart and update the quantity before continuing.");
      } else {
        setQuote(null);
      }
    } catch {
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }

  function chooseAddress(address: SavedAddress) {
    setSelectedAddressId(address.id);
    setDelivery({
      governorate: address.governorate,
      city: address.city,
      addressLine: address.address_line,
    });
    if (address.latitude != null && address.longitude != null) {
      setLocation({ latitude: address.latitude, longitude: address.longitude, accuracy: null });
    } else {
      setLocation(null);
    }
    setError("");
    void updateQuote(address.governorate);
  }

  function startNewAddress() {
    setSelectedAddressId(null);
    setDelivery(emptyDelivery);
    setLocation(null);
    setQuote(null);
    setAddressLabel("home");
    setError("");
  }

  function captureLocation() {
    setError("");
    if (!navigator.geolocation) {
      setError(ar ? "جهازك لا يدعم تحديد الموقع." : "This device does not support location services.");
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
        setError(ar ? "اسمح للموقع باستخدام GPS ثم حاول مجدداً." : "Allow location access and try again.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  async function submit(formData: FormData) {
    setError("");
    const parsed = checkoutSchema.safeParse({
      fullName: String(formData.get("fullName") || ""),
      phone: String(formData.get("phone") || ""),
      ...delivery,
      latitude: location?.latitude,
      longitude: location?.longitude,
    });
    if (!parsed.success || cart.length === 0) {
      setError(ar ? "أكمل بيانات الاستلام وحدد موقع التوصيل قبل تأكيد الطلب." : "Complete the delivery details and set the delivery location.");
      return;
    }
    if (checkoutItems.some((item) => !item.variant_id)) {
      setError(ar ? "أعد اختيار خيار المنتج قبل إتمام الطلب." : "Please reselect the product option before checkout.");
      return;
    }
    if (!quote || !quote.shipping_available) {
      setError(ar ? "اختر محافظة متاحة للتوصيل وانتظر حساب تكلفة التوصيل." : "Choose an available delivery area and wait for the delivery quote.");
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
          address_id: selectedAddressId,
          save_address: !selectedAddressId,
          address_label: addressLabel || "home",
        }),
      });

      if (response.status === 401) {
        setProfile(null);
        setError(ar ? "سجّل الدخول أولاً لإكمال الطلب." : "Sign in first to place the order.");
        return;
      }
      if (response.status === 409) {
        const detail = (await errorDetail(response)).toLowerCase();
        const stockProblem = detail.includes("stock") || detail.includes("unavailable");
        setError(stockProblem
          ? (ar ? "تغيّر مخزون إحدى القطع أو نفدت الكمية قبل تأكيد الطلب. عدّل السلة ثم حاول مجدداً." : "One of the items changed stock or sold out before confirmation. Update your cart and try again.")
          : (ar ? "رقم الهاتف مستخدم بحساب آخر." : "This phone number belongs to another account."));
        return;
      }
      if (response.status === 422) {
        const detail = (await errorDetail(response)).toLowerCase();
        const productProblem = detail.includes("variant") || detail.includes("product");
        setError(productProblem
          ? (ar ? "تغيّر أحد خيارات المنتج. ارجع للقطعة واختر الخيار المتوفر من جديد." : "A product option changed. Return to the product and select an available option again.")
          : (ar ? "تعذر التوصيل للعنوان المحدد. راجع بيانات العنوان والموقع." : "We cannot deliver to this address yet. Check the address and location."));
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
          <p>{ar ? "السلة محفوظة. سجّل الدخول ثم أكمل عنوان التوصيل." : "Your cart is saved. Sign in, then complete the delivery address."}</p>
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
          <p>{ar ? "طلبك وصل إلى لوحة المتجر وهو الآن بانتظار التأكيد والتجهيز." : "Your order is now in the store dashboard and waiting for confirmation."}</p>
          <p>{ar ? "الدفع عند الاستلام" : "Cash on delivery"} · {formatPrice(Number(placedOrder.grand_total), locale)}</p>
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
            <Link className="primary-button" href={`/${locale}/track-order?order=${encodeURIComponent(placedOrder.order_number)}`}>{ar ? "تتبع الطلب" : "Track order"}</Link>
            <Link className="secondary-button" href={`/${locale}/account`}>{ar ? "عرض طلباتي" : "View my orders"}</Link>
            <Link className="text-button" href={`/${locale}`}>{ar ? "متابعة التسوق" : "Continue shopping"}</Link>
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
          {addresses.length > 0 && <div style={{ display: "grid", gap: ".65rem" }}>
            <strong>{ar ? "اختر عنواناً محفوظاً" : "Choose a saved address"}</strong>
            <div style={{ display: "grid", gap: ".65rem", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
              {addresses.map((address) => <button
                key={address.id}
                className={selectedAddressId === address.id ? "primary-button" : "secondary-button"}
                type="button"
                onClick={() => chooseAddress(address)}
                style={{ textAlign: "start", justifyContent: "flex-start", height: "auto" }}
              >
                <span><strong>{address.label}</strong><br />{address.city} · {address.address_line}{address.latitude == null ? <><br /><small>{ar ? "يحتاج تحديد الموقع" : "Location needed"}</small></> : null}</span>
              </button>)}
            </div>
            <button className="text-button" type="button" onClick={startNewAddress}>{ar ? "+ إضافة عنوان جديد" : "+ Add a new address"}</button>
          </div>}

          {!selectedAddressId && <label>{ar ? "اسم العنوان" : "Address label"}<input value={addressLabel} onChange={(event) => setAddressLabel(event.target.value)} placeholder={ar ? "المنزل، العمل..." : "Home, work..."} /></label>}
          <div className="form-grid">
            <label>{ar ? "المحافظة" : "Governorate"}
              <select
                value={delivery.governorate}
                onChange={(event) => {
                  const governorate = event.target.value;
                  setDelivery((current) => ({ ...current, governorate }));
                  void updateQuote(governorate);
                }}
                required
              >
                <option value="">{ar ? "اختر المحافظة" : "Choose governorate"}</option>
                {GOVERNORATES.map(([value, labelAr, labelEn]) => <option key={value} value={value}>{ar ? labelAr : labelEn}</option>)}
              </select>
            </label>
            <label>{ar ? "المدينة / المنطقة" : "City / area"}<input value={delivery.city} onChange={(event) => setDelivery((current) => ({ ...current, city: event.target.value }))} autoComplete="address-level2" placeholder={ar ? "مثال: الخوير" : "Example: Al Khuwair"} required /></label>
          </div>
          <label>{ar ? "العنوان بالتفصيل" : "Detailed address"}<input value={delivery.addressLine} onChange={(event) => setDelivery((current) => ({ ...current, addressLine: event.target.value }))} autoComplete="street-address" placeholder={ar ? "الشارع، المبنى، رقم الشقة أو أقرب معلم" : "Street, building, apartment or nearest landmark"} required /></label>

          <div className="pending-choice">
            <strong>{ar ? "الموقع الدقيق للتوصيل" : "Exact delivery location"}</strong>
            <p>{ar ? "نستخدم الموقع فقط حتى يوصل مندوبنا للعنوان الصحيح." : "We use this location only so our delivery team can reach the correct address."}</p>
            <button className="table-button" type="button" onClick={captureLocation} disabled={locating}>
              {locating ? (ar ? "جارٍ تحديد الموقع…" : "Getting location…") : location ? (ar ? "تحديث الموقع" : "Update location") : (ar ? "تحديد موقعي الحالي" : "Use my current location")}
            </button>
            {location && <small style={{ display: "block", marginTop: ".6rem" }}>{ar ? "تم تحديد الموقع" : "Location set"}{location.accuracy ? ` · ±${Math.round(location.accuracy)}m` : ""}</small>}
          </div>

          <div className="pending-choice">
            <strong>{ar ? "3. الدفع" : "3. Payment"}</strong>
            <p>{ar ? "الدفع كاش عند الاستلام." : "Cash on delivery."}</p>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={busy || quoteLoading || !quote?.shipping_available || !location}>
            {busy ? (ar ? "جارٍ تسجيل الطلب…" : "Placing order…") : (ar ? "تأكيد الطلب" : "Place order")}
          </button>
        </form>

        <aside className="order-summary">
          <h2>{ar ? "ملخص الطلب" : "Order summary"}</h2>
          {cart.map((line) => <div key={`${line.product.slug}-${line.product.variantId ?? "default"}`}><span>{line.product.name[locale]} × {line.quantity}</span><strong>{formatPrice(line.product.price * line.quantity, locale)}</strong></div>)}
          <div><span>{ar ? "المنتجات" : "Items"}</span><strong>{formatPrice(subtotal, locale)}</strong></div>
          <div><span>{ar ? "التوصيل" : "Delivery"}</span><strong>{quoteLoading ? "…" : quote ? formatPrice(shipping, locale) : "—"}</strong></div>
          <div><span>{ar ? "الإجمالي" : "Total"}</span><strong>{formatPrice(finalTotal, locale)}</strong></div>
          {quote?.shipping_available && quote.estimated_days_min != null && quote.estimated_days_max != null && <p>{ar ? `التوصيل المتوقع: ${quote.estimated_days_min}–${quote.estimated_days_max} أيام` : `Estimated delivery: ${quote.estimated_days_min}–${quote.estimated_days_max} days`}</p>}
          <p>{ar ? "التوصيل يتم بواسطة فريق المتجر مباشرة." : "Delivery is handled directly by the store team."}</p>
        </aside>
      </div>
    </main>
  );
}
