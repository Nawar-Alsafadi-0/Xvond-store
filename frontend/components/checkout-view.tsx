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
  email_verified: boolean;
  phone_verified: boolean;
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

function mapEmbedUrl(location: Location): string {
  const latitude = location.latitude;
  const longitude = location.longitude;
  const delta = 0.006;
  const bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

function mapPageUrl(location: Location): string {
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(location.latitude)}&mlon=${encodeURIComponent(location.longitude)}#map=17/${location.latitude}/${location.longitude}`;
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
        if (!nextProfile?.email_verified || !nextProfile.phone_verified) return;
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
        setError(ar ? "إحدى القطع لم تعد متوفرة بالكمية المطلوبة. حدّث السلة للمتابعة." : "One of the items is no longer available in the requested quantity. Update your bag to continue.");
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
      setError(ar ? "تحديد الموقع غير متاح على هذا الجهاز." : "Location is not available on this device.");
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
        setError(ar ? "فعّل إذن الموقع ثم حاول مرة أخرى." : "Allow location access and try again.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  async function submit(formData: FormData) {
    setError("");
    const parsed = checkoutSchema.safeParse({
      fullName: String(formData.get("fullName") || ""),
      phone: profile?.phone ?? "",
      ...delivery,
      latitude: location?.latitude,
      longitude: location?.longitude,
    });
    if (!parsed.success || cart.length === 0) {
      setError(ar ? "أكمل بيانات التوصيل وحدد الموقع للمتابعة." : "Complete the delivery details and set the location to continue.");
      return;
    }
    if (!profile?.email_verified || !profile.phone_verified) {
      setError(ar ? "يرجى إكمال توثيق الحساب قبل الطلب." : "Complete account verification before ordering.");
      return;
    }
    if (checkoutItems.some((item) => !item.variant_id)) {
      setError(ar ? "أعد اختيار خيار المنتج قبل إتمام الشراء." : "Reselect the product option before checkout.");
      return;
    }
    if (!quote || !quote.shipping_available) {
      setError(ar ? "التوصيل غير متاح لهذا العنوان حالياً." : "Delivery is not currently available for this address.");
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
        setError(ar ? "سجّل الدخول لإكمال الشراء." : "Sign in to complete checkout.");
        return;
      }
      if (response.status === 403) {
        const detail = await errorDetail(response);
        setError(detail === "email_verification_required"
          ? (ar ? "يرجى تأكيد البريد الإلكتروني أولاً." : "Verify your email first.")
          : (ar ? "يرجى تأكيد رقم الهاتف أولاً." : "Verify your phone first."));
        return;
      }
      if (response.status === 409) {
        const detail = (await errorDetail(response)).toLowerCase();
        const stockProblem = detail.includes("stock") || detail.includes("unavailable");
        setError(stockProblem
          ? (ar ? "إحدى القطع لم تعد متوفرة بالكمية المطلوبة." : "One of the items is no longer available in the requested quantity.")
          : (ar ? "رقم الهاتف مرتبط بحساب آخر." : "This phone number is linked to another account."));
        return;
      }
      if (response.status === 422) {
        const detail = (await errorDetail(response)).toLowerCase();
        const productProblem = detail.includes("variant") || detail.includes("product");
        setError(productProblem
          ? (ar ? "أحد خيارات المنتج لم يعد متوفراً. اختر خياراً آخر." : "A product option is no longer available. Choose another option.")
          : (ar ? "تعذر التوصيل إلى العنوان المحدد." : "Delivery is not available for the selected address."));
        return;
      }
      if (!response.ok) throw new Error("order_failed");

      const order = await response.json() as ManualOrder;
      setPlacedOrder(order);
      clearCart();
    } catch {
      setError(ar ? "تعذر إتمام الطلب. حاول مرة أخرى." : "We could not place the order. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!sessionReady) {
    return <main className="content-page shell commerce-page"><p>{ar ? "جارٍ التحميل…" : "Loading…"}</p></main>;
  }

  if (!profile) {
    const checkoutPath = `/${locale}/checkout`;
    return <main className="content-page shell commerce-page">
      <p className="eyebrow">XVOND VAULT</p>
      <h1>{ar ? "تسجيل الدخول" : "Sign in"}</h1>
      <div className="empty-card">
        <p>{ar ? "سجّل الدخول لإكمال الشراء." : "Sign in to complete your purchase."}</p>
        <Link className="primary-button" href={`/${locale}/account?next=${encodeURIComponent(checkoutPath)}`}>{ar ? "تسجيل الدخول أو إنشاء حساب" : "Sign in or create an account"}</Link>
      </div>
    </main>;
  }

  if (!profile.email_verified || !profile.phone_verified) {
    const checkoutPath = `/${locale}/checkout`;
    return <main className="content-page shell commerce-page">
      <section className="verification-gate">
        <p className="eyebrow">XVOND VAULT</p>
        <h1>{ar ? "تفعيل الحساب" : "Verify your account"}</h1>
        <p>{ar ? "أكمل التحقق للمتابعة إلى الدفع." : "Complete verification to continue to checkout."}</p>
        <Link className="primary-button" href={`/${locale}/account?next=${encodeURIComponent(checkoutPath)}`}>{ar ? "متابعة" : "Continue"}</Link>
      </section>
    </main>;
  }

  if (placedOrder) {
    return <main className="content-page shell commerce-page">
      <p className="eyebrow">XVOND VAULT</p>
      <h1>{ar ? "تم استلام طلبك" : "Order received"}</h1>
      <div className="empty-card">
        <strong style={{ fontSize: "1.2rem" }}>{placedOrder.order_number}</strong>
        <p>{ar ? "يمكنك متابعة حالة الطلب من حسابك." : "You can follow the order status from your account."}</p>
        <p>{ar ? "الدفع عند الاستلام" : "Cash on delivery"} · {formatPrice(Number(placedOrder.grand_total), locale)}</p>
        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
          <Link className="primary-button" href={`/${locale}/track-order?order=${encodeURIComponent(placedOrder.order_number)}`}>{ar ? "تتبع الطلب" : "Track order"}</Link>
          <Link className="secondary-button" href={`/${locale}/account`}>{ar ? "طلباتي" : "My orders"}</Link>
          <Link className="text-button" href={`/${locale}`}>{ar ? "متابعة التسوق" : "Continue shopping"}</Link>
        </div>
      </div>
    </main>;
  }

  if (!cart.length) {
    return <main className="content-page shell commerce-page">
      <p className="eyebrow">XVOND VAULT</p>
      <h1>{ar ? "سلة التسوق" : "Shopping bag"}</h1>
      <div className="empty-card"><p>{ar ? "سلة التسوق فارغة." : "Your bag is empty."}</p><Link className="primary-button" href={`/${locale}`}>{ar ? "متابعة التسوق" : "Continue shopping"}</Link></div>
    </main>;
  }

  const finalTotal = quote ? Number(quote.grand_total) : subtotal;
  const shipping = quote ? Number(quote.shipping_total) : 0;

  return <main className="content-page shell commerce-page">
    <p className="eyebrow">XVOND VAULT</p>
    <h1>{ar ? "إتمام الشراء" : "Checkout"}</h1>
    <div className="checkout-layout">
      <form className="checkout-form" action={submit}>
        <h2>{ar ? "1. بيانات المستلم" : "1. Recipient"}</h2>
        <div className="form-grid">
          <label>{ar ? "الاسم الكامل" : "Full name"}<input name="fullName" autoComplete="name" defaultValue={profile.full_name === "Xvond Member" ? "" : profile.full_name} required /></label>
          <label>{ar ? "رقم الهاتف" : "Phone number"}<input name="phone" type="tel" value={profile.phone ?? ""} readOnly aria-readonly="true" required /></label>
        </div>

        <h2>{ar ? "2. عنوان التوصيل" : "2. Delivery address"}</h2>
        {addresses.length > 0 && <div style={{ display: "grid", gap: ".65rem" }}>
          <strong>{ar ? "العناوين المحفوظة" : "Saved addresses"}</strong>
          <div style={{ display: "grid", gap: ".65rem", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
            {addresses.map((address) => <button
              key={address.id}
              className={selectedAddressId === address.id ? "primary-button" : "secondary-button"}
              type="button"
              onClick={() => chooseAddress(address)}
              style={{ textAlign: "start", justifyContent: "flex-start", height: "auto" }}
            >
              <span><strong>{address.label}</strong><br />{address.city} · {address.address_line}{address.latitude == null ? <><br /><small>{ar ? "حدد الموقع" : "Set location"}</small></> : null}</span>
            </button>)}
          </div>
          <button className="text-button" type="button" onClick={startNewAddress}>{ar ? "+ عنوان جديد" : "+ New address"}</button>
        </div>}

        {!selectedAddressId && <label>{ar ? "اسم العنوان" : "Address label"}<input value={addressLabel} onChange={(event) => setAddressLabel(event.target.value)} placeholder={ar ? "المنزل، العمل..." : "Home, work..."} /></label>}
        <div className="form-grid">
          <label>{ar ? "المحافظة" : "Governorate"}
            <select value={delivery.governorate} onChange={(event) => {
              const governorate = event.target.value;
              setDelivery((current) => ({ ...current, governorate }));
              void updateQuote(governorate);
            }} required>
              <option value="">{ar ? "اختر المحافظة" : "Choose governorate"}</option>
              {GOVERNORATES.map(([value, labelAr, labelEn]) => <option key={value} value={value}>{ar ? labelAr : labelEn}</option>)}
            </select>
          </label>
          <label>{ar ? "المدينة / المنطقة" : "City / area"}<input value={delivery.city} onChange={(event) => setDelivery((current) => ({ ...current, city: event.target.value }))} autoComplete="address-level2" placeholder={ar ? "مثال: الخوير" : "Example: Al Khuwair"} required /></label>
        </div>
        <label>{ar ? "العنوان" : "Address"}<input value={delivery.addressLine} onChange={(event) => setDelivery((current) => ({ ...current, addressLine: event.target.value }))} autoComplete="street-address" placeholder={ar ? "الشارع، المبنى، رقم الشقة أو أقرب معلم" : "Street, building, apartment or nearest landmark"} required /></label>

        <div className="pending-choice">
          <strong>{ar ? "موقع التوصيل" : "Delivery location"}</strong>
          <button className="table-button" type="button" onClick={captureLocation} disabled={locating}>
            {locating ? (ar ? "جارٍ تحديد الموقع…" : "Getting location…") : location ? (ar ? "تحديث الموقع" : "Update location") : (ar ? "تحديد الموقع" : "Set location")}
          </button>
          {location && <>
            <div className="checkout-map-preview"><iframe title={ar ? "موقع التوصيل" : "Delivery location"} src={mapEmbedUrl(location)} loading="lazy" referrerPolicy="no-referrer" /></div>
            <div className="checkout-map-coordinates"><a href={mapPageUrl(location)} target="_blank" rel="noreferrer">{ar ? "عرض الخريطة" : "View map"}</a></div>
          </>}
        </div>

        <div className="pending-choice"><strong>{ar ? "3. الدفع" : "3. Payment"}</strong><p>{ar ? "عند الاستلام" : "Cash on delivery"}</p></div>

        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy || quoteLoading || !quote?.shipping_available || !location}>
          {busy ? (ar ? "جارٍ التأكيد…" : "Confirming…") : (ar ? "تأكيد الطلب" : "Place order")}
        </button>
      </form>

      <aside className="order-summary">
        <h2>{ar ? "الملخص" : "Summary"}</h2>
        {cart.map((line) => <div key={`${line.product.slug}-${line.product.variantId ?? "default"}`}><span>{line.product.name[locale]} × {line.quantity}</span><strong>{formatPrice(line.product.price * line.quantity, locale)}</strong></div>)}
        <div><span>{ar ? "المنتجات" : "Items"}</span><strong>{formatPrice(subtotal, locale)}</strong></div>
        <div><span>{ar ? "التوصيل" : "Delivery"}</span><strong>{quoteLoading ? "…" : quote ? (shipping === 0 ? (ar ? "مجاني" : "Free") : formatPrice(shipping, locale)) : "—"}</strong></div>
        <div><span>{ar ? "الإجمالي" : "Total"}</span><strong>{formatPrice(finalTotal, locale)}</strong></div>
        {quote?.shipping_available && quote.estimated_days_min != null && quote.estimated_days_max != null && <p>{ar ? `التوصيل المتوقع: ${quote.estimated_days_min}–${quote.estimated_days_max} أيام` : `Estimated delivery: ${quote.estimated_days_min}–${quote.estimated_days_max} days`}</p>}
      </aside>
    </div>
  </main>;
}
