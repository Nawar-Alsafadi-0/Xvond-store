"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { safeReturnPath } from "@/lib/safe-return-path";
import { MultiAuthOptions } from "./multi-auth-options";

type Profile = { id: string; full_name: string; email: string | null; phone?: string | null };
type Address = { id: string; label: string; governorate: string; city: string; address_line: string; postal_code?: string };
type Order = { order_number: string; status: string; payment_status: string; currency: string; grand_total: string; created_at: string };
type AuthStage = "identifier" | "password" | "register" | "phone_code";
type IdentifyResult = {
  kind: "email" | "phone";
  identifier: string;
  existing: boolean;
  next_action: "password" | "register" | "phone_otp" | "phone_unavailable";
};
type SessionResult = { authenticated: boolean; profile?: Profile | null };

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const AUTH_RETURN_KEY = "xvond_auth_return_to";

export function AccountView({ locale, returnTo = null }: { locale: Locale; returnTo?: string | null }) {
  const ar = locale === "ar";
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stage, setStage] = useState<AuthStage>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const request = useCallback(async (path: string, options?: RequestInit) => {
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    });
    if (!response.ok) throw new Error(String(response.status));
    return response.status === 204 ? null : response.json();
  }, []);

  const load = useCallback(async () => {
    try {
      const session = await request("/auth/session") as SessionResult;
      if (!session.authenticated || !session.profile) {
        setProfile(null);
        setAddresses([]);
        setOrders([]);
        return;
      }
      const [savedAddresses, savedOrders] = await Promise.all([
        request("/account/addresses"),
        request("/account/orders"),
      ]);
      setProfile(session.profile);
      setAddresses(savedAddresses as Address[]);
      setOrders(savedOrders as Order[]);
    } catch {
      setProfile(null);
      setAddresses([]);
      setOrders([]);
    }
  }, [request]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    if (!profile) return;
    const stored = typeof window !== "undefined" ? window.sessionStorage.getItem(AUTH_RETURN_KEY) : null;
    const target = returnTo || safeReturnPath(stored, locale);
    if (!target) return;
    window.sessionStorage.removeItem(AUTH_RETURN_KEY);
    router.replace(target);
  }, [locale, profile, returnTo, router]);

  function resetAuth() {
    setStage("identifier");
    setIdentifier("");
    setMessage("");
  }

  async function sendPhoneCode(phone: string) {
    await request("/auth/phone/start", {
      method: "POST",
      body: JSON.stringify({ phone, locale }),
    });
    setMessage(ar ? "أرسلنا رمز التحقق إلى رقمك." : "We sent a verification code to your phone.");
  }

  async function identify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      const data = new FormData(event.currentTarget);
      const value = String(data.get("identifier") || "").trim();
      const response = await request("/auth/identify", {
        method: "POST",
        body: JSON.stringify({ identifier: value }),
      }) as IdentifyResult;
      setIdentifier(response.identifier);

      if (response.next_action === "password") {
        setStage("password");
      } else if (response.next_action === "register") {
        setStage("register");
      } else if (response.next_action === "phone_otp") {
        await sendPhoneCode(response.identifier);
        setStage("phone_code");
      } else {
        setMessage(ar ? "الدخول برقم الهاتف غير مفعّل حاليًا." : "Phone sign-in is not enabled yet.");
      }
    } catch {
      setMessage(ar ? "أدخل بريدًا إلكترونيًا أو رقم هاتف صحيحًا." : "Enter a valid email or phone number.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      if (stage === "password") {
        await request("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: identifier, password: data.get("password") }),
        });
      } else {
        await request("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email: identifier, password: data.get("password") }),
        });
      }
      await load();
      window.dispatchEvent(new Event("xvond-account-changed"));
    } catch {
      setMessage(
        stage === "password"
          ? (ar ? "كلمة المرور غير صحيحة." : "Incorrect password.")
          : (ar ? "تعذر إنشاء الحساب. جرّب مرة أخرى." : "Could not create the account. Try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await request("/auth/phone/confirm", {
        method: "POST",
        body: JSON.stringify({ phone: identifier, code: data.get("code") }),
      });
      await load();
      window.dispatchEvent(new Event("xvond-account-changed"));
    } catch {
      setMessage(ar ? "رمز التحقق غير صحيح أو منتهي." : "The verification code is invalid or expired.");
    } finally {
      setBusy(false);
    }
  }

  async function resendPhoneCode() {
    setMessage("");
    setBusy(true);
    try {
      await sendPhoneCode(identifier);
    } catch {
      setMessage(ar ? "تعذر إعادة إرسال الرمز. حاول مرة أخرى." : "Could not resend the code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function addAddress(form: FormData) {
    await request("/account/addresses", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form)),
    });
    await load();
  }

  async function removeAddress(id: string) {
    await request(`/account/addresses/${id}`, { method: "DELETE" });
    await load();
  }

  async function logout() {
    await request("/auth/logout", { method: "POST" });
    window.sessionStorage.removeItem(AUTH_RETURN_KEY);
    setProfile(null);
    setAddresses([]);
    setOrders([]);
    resetAuth();
    window.dispatchEvent(new Event("xvond-account-changed"));
  }

  async function requestReturn(form: FormData) {
    setMessage("");
    try {
      await request("/account/returns", {
        method: "POST",
        body: JSON.stringify({ order_number: form.get("order_number"), reason: form.get("reason") }),
      });
      setMessage(ar ? "تم إرسال طلب الاسترجاع للمراجعة." : "Your return request was submitted for review.");
    } catch {
      setMessage(ar ? "تعذر إرسال الطلب. تأكد من رقم الطلب." : "Could not submit the request. Check the order number.");
    }
  }

  if (!profile) {
    return <main className="content-page shell account-auth">
      <div>
        <p className="eyebrow">XVOND MEMBERS</p>
        <h1>{ar ? "تسجيل الدخول أو إنشاء حساب" : "Sign in or create an account"}</h1>
        {returnTo && <p className="coupon-message">{ar ? "بعد تسجيل الدخول سنرجعك مباشرة لإكمال طلبك." : "After sign-in, we’ll take you straight back to checkout."}</p>}
        {stage === "identifier" && <form onSubmit={(event) => void identify(event)}>
          <label>
            {ar ? "البريد الإلكتروني أو رقم الهاتف" : "Email or phone number"}
            <input name="identifier" autoComplete="username" placeholder={ar ? "البريد الإلكتروني أو رقم الهاتف" : "Email or phone number"} required />
          </label>
          {message && <p className="form-error">{message}</p>}
          <button className="primary-button" disabled={busy}>{ar ? "متابعة" : "Continue"}</button>
        </form>}
        {(stage === "password" || stage === "register") && <form onSubmit={(event) => void submitEmail(event)}>
          <p className="coupon-message">{identifier}</p>
          <h2>{stage === "password" ? (ar ? "أدخل كلمة المرور" : "Enter your password") : (ar ? "أنت مستخدم جديد" : "You’re new here")}</h2>
          {stage === "register" && <p>{ar ? "أنشئ كلمة مرور لإكمال حسابك." : "Create a password to finish setting up your account."}</p>}
          <label>{ar ? "كلمة المرور" : "Password"}<input name="password" type="password" autoComplete={stage === "password" ? "current-password" : "new-password"} minLength={stage === "register" ? 10 : 1} required /></label>
          {message && <p className="form-error">{message}</p>}
          <button className="primary-button" disabled={busy}>{stage === "password" ? (ar ? "تسجيل الدخول" : "Sign in") : (ar ? "إنشاء الحساب" : "Create account")}</button>
          {stage === "password" && <Link className="text-button" href={`/${locale}/account/reset`}>{ar ? "نسيت كلمة المرور؟" : "Forgot password?"}</Link>}
          <button className="text-button" type="button" onClick={resetAuth}>{ar ? "استخدام بريد أو رقم آخر" : "Use another email or phone"}</button>
        </form>}
        {stage === "phone_code" && <form onSubmit={(event) => void verifyPhone(event)}>
          <p className="coupon-message">{identifier}</p>
          <h2>{ar ? "أدخل رمز التحقق" : "Enter verification code"}</h2>
          <p>{ar ? "أدخل الرمز الذي أرسلناه إلى رقم هاتفك. إذا كان الرقم جديدًا سننشئ الحساب تلقائيًا." : "Enter the code sent to your phone. If this number is new, your account will be created automatically."}</p>
          <label>{ar ? "رمز التحقق" : "Verification code"}<input name="code" inputMode="numeric" autoComplete="one-time-code" required /></label>
          {message && <p className="coupon-message">{message}</p>}
          <button className="primary-button" disabled={busy}>{ar ? "تأكيد والمتابعة" : "Verify and continue"}</button>
          <button className="text-button" type="button" disabled={busy} onClick={() => void resendPhoneCode()}>{ar ? "إعادة إرسال الرمز" : "Resend code"}</button>
          <button className="text-button" type="button" onClick={resetAuth}>{ar ? "استخدام بريد أو رقم آخر" : "Use another email or phone"}</button>
        </form>}
        {stage === "identifier" && <MultiAuthOptions locale={locale} returnTo={returnTo} />}
      </div>
    </main>;
  }

  const accountLabel = profile.email || profile.phone || (ar ? "عضو Xvond" : "Xvond member");
  return <main className="content-page shell account-page">
    <header><div><p className="eyebrow">XVOND MEMBERS</p><h1>{ar ? `أهلًا، ${profile.full_name}` : `Welcome, ${profile.full_name}`}</h1><p>{accountLabel}</p>{message && <small>{message}</small>}</div><button className="secondary-button" onClick={() => void logout()}>{ar ? "تسجيل الخروج" : "Sign out"}</button></header>
    <section><h2>{ar ? "عناويني" : "My addresses"}</h2><form className="account-address-form" action={addAddress}><input name="label" placeholder={ar ? "اسم العنوان: المنزل" : "Label: Home"} defaultValue="home" required /><input name="governorate" placeholder={ar ? "المحافظة" : "Governorate"} required /><input name="city" placeholder={ar ? "المدينة" : "City"} required /><input name="address_line" placeholder={ar ? "العنوان بالتفصيل" : "Full address"} required /><input name="postal_code" placeholder={ar ? "الرمز البريدي (اختياري)" : "Postal code (optional)"} /><button className="primary-button">{ar ? "حفظ العنوان" : "Save address"}</button></form><div className="account-cards">{addresses.map((address) => <article key={address.id}><strong>{address.label}</strong><p>{address.governorate} — {address.city}</p><small>{address.address_line}</small><button className="danger-link" onClick={() => void removeAddress(address.id)}>{ar ? "حذف" : "Remove"}</button></article>)}</div></section>
    <section><h2>{ar ? "طلباتي" : "My orders"}</h2><div className="account-orders">{orders.length ? orders.map((order) => <article key={order.order_number}><div><strong>{order.order_number}</strong><small>{new Date(order.created_at).toLocaleDateString(ar ? "ar-OM" : "en-OM")}</small></div><span>{order.grand_total} {order.currency}</span><span>{order.status}</span><Link href={`/${locale}/track-order?order=${order.order_number}`}>{ar ? "تتبع الطلب" : "Track order"}</Link></article>) : <div className="empty-card"><p>{ar ? "لا توجد طلبات بعد." : "No orders yet."}</p></div>}</div></section>
    <section><h2>{ar ? "طلب استرجاع" : "Request a return"}</h2><form className="return-form" action={requestReturn}><input name="order_number" placeholder={ar ? "رقم الطلب" : "Order number"} required /><textarea name="reason" minLength={5} maxLength={2000} placeholder={ar ? "سبب طلب الاسترجاع" : "Reason for the return request"} required /><button className="primary-button">{ar ? "إرسال للمراجعة" : "Submit for review"}</button></form></section>
  </main>;
}
