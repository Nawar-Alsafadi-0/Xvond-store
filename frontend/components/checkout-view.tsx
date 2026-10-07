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
});

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

export function CheckoutView({ locale }: { locale: Locale }) {
  const { cart, clearCart } = useCommerce();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ar = locale === "ar";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
  const whatsappNumber = (process.env.NEXT_PUBLIC_ORDER_WHATSAPP || "96891118075").replace(/\D/g, "");
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

  async function submit(formData: FormData) {
    setError("");
    const parsed = checkoutSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success || cart.length === 0) {
      setError(ar ? "تأكد من الاسم ورقم الهاتف." : "Check your name and phone number.");
      return;
    }
    if (checkoutItems.some((item) => !item.variant_id)) {
      setError(ar ? "أعد اختيار خيار المنتج قبل إتمام الطلب." : "Please reselect the product option before checkout.");
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
      if (!response.ok) throw new Error("order_failed");

      const order = await response.json() as ManualOrder;
      const lines = cart.map((line) => `- ${line.product.name[locale]} × ${line.quantity}`).join("\n");
      const total = formatPrice(Number(order.grand_total), locale);
      const message = ar
        ? `مرحباً Xvond، أريد تأكيد طلبي.\n\nرقم الطلب: ${order.order_number}\nالاسم: ${parsed.data.fullName}\nالهاتف: ${parsed.data.phone}\n\nالطلب:\n${lines}\n\nالإجمالي: ${total}\nالدفع: كاش عند الاستلام\n\nأرسل لكم لتأكيد التوصيل.`
        : `Hello Xvond, I would like to confirm my order.\n\nOrder: ${order.order_number}\nName: ${parsed.data.fullName}\nPhone: ${parsed.data.phone}\n\nItems:\n${lines}\n\nTotal: ${total}\nPayment: Cash on delivery\n\nI am messaging to confirm delivery.`;

      clearCart();
      window.location.assign(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`);
    } catch {
      setError(ar ? "تعذر حفظ الطلب الآن. حاول مرة أخرى." : "We could not save the order. Please try again.");
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
          <p>{ar ? "اختياراتك محفوظة في السلة. بعد تسجيل الدخول ارجع للسلة واضغط إتمام الطلب." : "Your items stay in the cart. After signing in, return to the cart and continue checkout."}</p>
          <Link className="primary-button" href={`/${locale}/account`}>{ar ? "تسجيل الدخول أو إنشاء حساب" : "Sign in or create an account"}</Link>
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

  return (
    <main className="content-page shell commerce-page">
      <p className="eyebrow">XVOND STORE</p>
      <h1>{ar ? "تأكيد الطلب" : "Confirm order"}</h1>
      <div className="checkout-layout">
        <form className="checkout-form" action={submit}>
          <h2>{ar ? "بيانات التواصل" : "Contact details"}</h2>
          <p>{ar ? "الدفع كاش فقط. بعد تسجيل الطلب سيفتح واتساب لتأكيد الطلب والتوصيل معنا." : "Cash only. After the order is saved, WhatsApp will open so you can confirm the order and delivery with us."}</p>
          <div className="form-grid">
            <label>{ar ? "الاسم الكامل" : "Full name"}<input name="fullName" autoComplete="name" defaultValue={profile.full_name === "Xvond Member" ? "" : profile.full_name} required /></label>
            <label>{ar ? "رقم الهاتف" : "Phone number"}<input name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={profile.phone ?? ""} placeholder="+968" required /></label>
          </div>
          <div className="pending-choice">
            <strong>{ar ? "طريقة الدفع" : "Payment"}</strong>
            <p>{ar ? "كاش عند الاستلام — لا يوجد دفع إلكتروني حالياً." : "Cash on delivery — online payment is not available right now."}</p>
          </div>
          <div className="pending-choice">
            <strong>{ar ? "تأكيد التوصيل" : "Delivery confirmation"}</strong>
            <p>{ar ? "بعد إرسال الطلب سيفتح واتساب برسالة جاهزة. نؤكد معك العنوان وموعد التوصيل هناك." : "After placing the order, WhatsApp opens with a ready message. We confirm your address and delivery time there."}</p>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={busy}>{busy ? (ar ? "جارٍ تسجيل الطلب…" : "Saving order…") : (ar ? "تأكيد الطلب وفتح واتساب" : "Place order & open WhatsApp")}</button>
        </form>

        <aside className="order-summary">
          <h2>{ar ? "طلبك" : "Your order"}</h2>
          {cart.map((line) => <div key={`${line.product.slug}-${line.product.variantId ?? "default"}`}><span>{line.product.name[locale]} × {line.quantity}</span><strong>{formatPrice(line.product.price * line.quantity, locale)}</strong></div>)}
          <div><span>{ar ? "المجموع" : "Total"}</span><strong>{formatPrice(subtotal, locale)}</strong></div>
          <p>{ar ? "أي تفاصيل توصيل إضافية يتم تأكيدها معك على واتساب." : "Any additional delivery details are confirmed with you on WhatsApp."}</p>
        </aside>
      </div>
    </main>
  );
}
