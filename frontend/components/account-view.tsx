"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { safeReturnPath } from "@/lib/safe-return-path";
import { MultiAuthOptions } from "./multi-auth-options";

type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  phone?: string | null;
  email_verified: boolean;
  phone_verified: boolean;
};
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

async function readError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { detail?: unknown };
    return typeof payload.detail === "string" ? payload.detail : String(response.status);
  } catch {
    return String(response.status);
  }
}

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
  const [pendingPhone, setPendingPhone] = useState("");
  const [accountPhoneStage, setAccountPhoneStage] = useState<"phone" | "code">("phone");

  const request = useCallback(async (path: string, options?: RequestInit) => {
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    });
    if (!response.ok) throw new Error(await readError(response));
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
      setProfile(session.profile);
      if (!session.profile.email_verified || !session.profile.phone_verified) {
        setAddresses([]);
        setOrders([]);
        return;
      }
      const [savedAddresses, savedOrders] = await Promise.all([
        request("/account/addresses"),
        request("/account/orders"),
      ]);
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
    const handler = () => void load();
    window.addEventListener("xvond-account-changed", handler);
    return () => window.removeEventListener("xvond-account-changed", handler);
  }, [load]);

  useEffect(() => {
    if (!profile?.email_verified || !profile.phone_verified) return;
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
      setMessage(ar ? "أدخل بريدًا إلكترونيًا أو رقم هاتف عماني صحيحًا." : "Enter a valid email or Oman phone number.");
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
          body: JSON.stringify({
            email: identifier,
            full_name: data.get("full_name"),
            password: data.get("password"),
          }),
        });
      }
      await load();
      window.dispatchEvent(new Event("xvond-account-changed"));
      if (stage === "register") {
        setMessage(ar ? "أنشأنا الحساب وأرسلنا رابط تأكيد إلى بريدك. لازم تأكده قبل المتابعة." : "Account created. Check your email and verify it before continuing.");
      }
    } catch {
      setMessage(
        stage === "password"
          ? (ar ? "البريد أو كلمة المرور غير صحيحة." : "Incorrect email or password.")
          : (ar ? "تعذر إنشاء الحساب. تأكد أن البريد غير مستخدم وحاول مرة أخرى." : "Could not create the account. Check that the email is not already used."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyPhoneLogin(event: FormEvent<HTMLFormElement>) {
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

  async function resendEmailVerification() {
    setMessage("");
    setBusy(true);
    try {
      await request("/auth/email/resend", { method: "POST", body: "{}" });
      setMessage(ar ? "أعدنا إرسال رابط التأكيد إلى بريدك." : "We sent a new verification link to your email.");
    } catch {
      setMessage(ar ? "تعذر إرسال رابط التأكيد الآن." : "Could not send the verification link right now.");
    } finally {
      setBusy(false);
    }
  }

  async function addMissingEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await request("/account/profile/email/start", {
        method: "POST",
        body: JSON.stringify({ email: data.get("email"), locale }),
      });
      setMessage(ar ? "أرسلنا رابط تأكيد إلى البريد. افتحه ثم ارجع للحساب." : "We sent a verification link. Open it, then return to your account.");
    } catch {
      setMessage(ar ? "تعذر استخدام هذا البريد أو أنه مرتبط بحساب آخر." : "Could not use this email, or it belongs to another account.");
    } finally {
      setBusy(false);
    }
  }

  async function startAccountPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await request("/account/profile/phone/start", {
        method: "POST",
        body: JSON.stringify({ phone: data.get("phone"), locale }),
      }) as { phone: string };
      setPendingPhone(response.phone);
      setAccountPhoneStage("code");
      setMessage(ar ? "أرسلنا رمز OTP إلى الرقم." : "We sent an OTP code to the phone.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      setMessage(detail.includes("503") || detail.includes("configured")
        ? (ar ? "خدمة تأكيد الهاتف غير مفعّلة على السيرفر بعد." : "Phone verification is not configured on the server yet.")
        : (ar ? "تعذر إرسال الرمز أو الرقم مرتبط بحساب آخر." : "Could not send the code, or the phone belongs to another account."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmAccountPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await request("/account/profile/phone/confirm", {
        method: "POST",
        body: JSON.stringify({ phone: pendingPhone, code: data.get("code") }),
      });
      setAccountPhoneStage("phone");
      setPendingPhone("");
      await load();
      window.dispatchEvent(new Event("xvond-account-changed"));
      setMessage(ar ? "تم تأكيد رقم الهاتف." : "Phone number verified.");
    } catch {
      setMessage(ar ? "رمز التحقق غير صحيح أو منتهي." : "The verification code is invalid or expired.");
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
        {returnTo && <p className="coupon-message">{ar ? "بعد توثيق البريد ورقم الهاتف سنرجعك مباشرة لإكمال طلبك." : "After verifying your email and phone, we’ll take you back to checkout."}</p>}
        {stage === "identifier" && <form onSubmit={(event) => void identify(event)}>
          <label>{ar ? "البريد الإلكتروني أو رقم الهاتف" : "Email or phone number"}<input name="identifier" autoComplete="username" placeholder={ar ? "البريد الإلكتروني أو رقم الهاتف" : "Email or phone number"} required /></label>
          {message && <p className="form-error">{message}</p>}
          <button className="primary-button" disabled={busy}>{ar ? "متابعة" : "Continue"}</button>
        </form>}
        {(stage === "password" || stage === "register") && <form onSubmit={(event) => void submitEmail(event)}>
          <p className="coupon-message">{identifier}</p>
          <h2>{stage === "password" ? (ar ? "أدخل كلمة المرور" : "Enter your password") : (ar ? "إنشاء حساب جديد" : "Create a new account")}</h2>
          {stage === "register" && <><p>{ar ? "بعد إنشاء الحساب رح نرسل رابط لتأكيد البريد، وبعده نؤكد رقم الهاتف." : "We’ll verify your email first, then your phone number."}</p><label>{ar ? "الاسم الكامل" : "Full name"}<input name="full_name" autoComplete="name" minLength={2} required /></label></>}
          <label>{ar ? "كلمة المرور" : "Password"}<input name="password" type="password" autoComplete={stage === "password" ? "current-password" : "new-password"} minLength={stage === "register" ? 10 : 1} required /></label>
          {message && <p className="form-error">{message}</p>}
          <button className="primary-button" disabled={busy}>{stage === "password" ? (ar ? "تسجيل الدخول" : "Sign in") : (ar ? "إنشاء الحساب وإرسال التأكيد" : "Create account & verify email")}</button>
          {stage === "password" && <Link className="text-button" href={`/${locale}/account/reset`}>{ar ? "نسيت كلمة المرور؟" : "Forgot password?"}</Link>}
          <button className="text-button" type="button" onClick={resetAuth}>{ar ? "استخدام بريد أو رقم آخر" : "Use another email or phone"}</button>
        </form>}
        {stage === "phone_code" && <form onSubmit={(event) => void verifyPhoneLogin(event)}>
          <p className="coupon-message">{identifier}</p>
          <h2>{ar ? "أدخل رمز التحقق" : "Enter verification code"}</h2>
          <p>{ar ? "أدخل الرمز الذي أرسلناه إلى رقم هاتفك. إذا كان الحساب ناقص بريد موثّق رح نطلبه قبل أي طلب." : "Enter the code sent to your phone. A verified email is still required before checkout."}</p>
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

  if (!profile.email_verified) {
    return <main className="content-page shell commerce-page"><section className="verification-gate">
      <p className="eyebrow">XVOND SECURITY</p>
      <h1>{ar ? "أكد بريدك الإلكتروني" : "Verify your email"}</h1>
      {profile.email ? <>
        <p>{ar ? `أرسلنا رابط تأكيد إلى ${profile.email}. ما فيك تكمل الطلب قبل فتح الرابط وتأكيد البريد.` : `We sent a verification link to ${profile.email}. Checkout stays locked until you confirm it.`}</p>
        <div className="verification-actions"><button className="primary-button" type="button" disabled={busy} onClick={() => void resendEmailVerification()}>{ar ? "إعادة إرسال رابط التأكيد" : "Resend verification email"}</button><button className="secondary-button" type="button" onClick={() => void load()}>{ar ? "تحققت، حدّث الحالة" : "I verified it — refresh"}</button></div>
      </> : <form onSubmit={(event) => void addMissingEmail(event)}>
        <p>{ar ? "الحساب مرتبط برقم فقط. أضف بريدًا حقيقيًا وسنرسل له رابط تأكيد." : "This account only has a phone number. Add a real email and verify it."}</p>
        <label>{ar ? "البريد الإلكتروني" : "Email"}<input name="email" type="email" autoComplete="email" required /></label>
        <button className="primary-button" disabled={busy}>{ar ? "إرسال رابط التأكيد" : "Send verification link"}</button>
      </form>}
      {message && <p className="coupon-message">{message}</p>}
      <div className="verification-actions"><button className="text-button" type="button" onClick={() => void logout()}>{ar ? "تسجيل الخروج" : "Sign out"}</button></div>
    </section></main>;
  }

  if (!profile.phone_verified) {
    return <main className="content-page shell commerce-page"><section className="verification-gate">
      <p className="eyebrow">XVOND SECURITY</p>
      <h1>{ar ? "أكد رقم هاتفك" : "Verify your phone"}</h1>
      <p>{ar ? "رقم الهاتف ضروري للطلب والتوصيل، ولا نقبل رقم مكتوب بدون OTP." : "A verified phone number is required for ordering and delivery."}</p>
      {accountPhoneStage === "phone" ? <form onSubmit={(event) => void startAccountPhone(event)}>
        <label>{ar ? "رقم الهاتف العماني" : "Oman phone number"}<input name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={profile.phone ?? ""} placeholder="+968 9XXXXXXX" required /></label>
        <button className="primary-button" disabled={busy}>{ar ? "إرسال رمز OTP" : "Send OTP"}</button>
      </form> : <form onSubmit={(event) => void confirmAccountPhone(event)}>
        <p className="coupon-message">{pendingPhone}</p>
        <label>{ar ? "رمز التحقق" : "Verification code"}<input name="code" inputMode="numeric" autoComplete="one-time-code" required /></label>
        <button className="primary-button" disabled={busy}>{ar ? "تأكيد الرقم" : "Verify phone"}</button>
        <button className="text-button" type="button" onClick={() => setAccountPhoneStage("phone")}>{ar ? "تغيير الرقم" : "Change number"}</button>
      </form>}
      {message && <p className="coupon-message">{message}</p>}
      <div className="verification-actions"><button className="text-button" type="button" onClick={() => void logout()}>{ar ? "تسجيل الخروج" : "Sign out"}</button></div>
    </section></main>;
  }

  const accountLabel = profile.email || profile.phone || (ar ? "عضو Xvond" : "Xvond member");
  return <main className="content-page shell account-page">
    <header><div><p className="eyebrow">XVOND MEMBERS</p><h1>{ar ? `أهلًا، ${profile.full_name}` : `Welcome, ${profile.full_name}`}</h1><p>{accountLabel}</p><small>{ar ? "✓ البريد موثّق · ✓ الهاتف موثّق" : "✓ Email verified · ✓ Phone verified"}</small>{message && <small>{message}</small>}</div><button className="secondary-button" onClick={() => void logout()}>{ar ? "تسجيل الخروج" : "Sign out"}</button></header>
    <section><h2>{ar ? "عناويني" : "My addresses"}</h2><form className="account-address-form" action={addAddress}><input name="label" placeholder={ar ? "اسم العنوان: المنزل" : "Label: Home"} defaultValue="home" required /><input name="governorate" placeholder={ar ? "المحافظة" : "Governorate"} required /><input name="city" placeholder={ar ? "المدينة" : "City"} required /><input name="address_line" placeholder={ar ? "العنوان بالتفصيل" : "Full address"} required /><input name="postal_code" placeholder={ar ? "الرمز البريدي (اختياري)" : "Postal code (optional)"} /><button className="primary-button">{ar ? "حفظ العنوان" : "Save address"}</button></form><div className="account-cards">{addresses.map((address) => <article key={address.id}><strong>{address.label}</strong><p>{address.governorate} — {address.city}</p><small>{address.address_line}</small><button className="danger-link" onClick={() => void removeAddress(address.id)}>{ar ? "حذف" : "Remove"}</button></article>)}</div></section>
    <section><h2>{ar ? "طلباتي" : "My orders"}</h2><div className="account-orders">{orders.length ? orders.map((order) => <article key={order.order_number}><div><strong>{order.order_number}</strong><small>{new Date(order.created_at).toLocaleDateString(ar ? "ar-OM" : "en-OM")}</small></div><span>{order.grand_total} {order.currency}</span><span>{order.status}</span><Link href={`/${locale}/track-order?order=${order.order_number}`}>{ar ? "تتبع الطلب" : "Track order"}</Link></article>) : <div className="empty-card"><p>{ar ? "لا توجد طلبات بعد." : "No orders yet."}</p></div>}</div></section>
    <section><h2>{ar ? "طلب استرجاع" : "Request a return"}</h2><form className="return-form" action={requestReturn}><input name="order_number" placeholder={ar ? "رقم الطلب" : "Order number"} required /><textarea name="reason" minLength={5} maxLength={2000} placeholder={ar ? "سبب طلب الاسترجاع" : "Reason for the return request"} required /><button className="primary-button">{ar ? "إرسال للمراجعة" : "Submit for review"}</button></form></section>
  </main>;
}
