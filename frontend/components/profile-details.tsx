"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

type ProfileDetails = {
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  pending_email: string | null;
};

export function ProfileDetailsCard({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [profile, setProfile] = useState<ProfileDetails | null>(null);
  const [message, setMessage] = useState("");
  const [phoneStage, setPhoneStage] = useState<"idle" | "code">("idle");
  const [pendingPhone, setPendingPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/account/profile`, { credentials: "include" });
      if (!response.ok) {
        setProfile(null);
        return;
      }
      setProfile(await response.json() as ProfileDetails);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
    const handler = () => void load();
    window.addEventListener("xvond-account-changed", handler);
    return () => window.removeEventListener("xvond-account-changed", handler);
  }, [load]);

  async function saveNames(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${apiUrl}/account/profile`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: data.get("first_name"), last_name: data.get("last_name") }),
      });
      if (!response.ok) throw new Error();
      setProfile(await response.json() as ProfileDetails);
      setMessage(ar ? "تم حفظ بياناتك." : "Your profile was saved.");
      window.dispatchEvent(new Event("xvond-account-changed"));
    } catch { setMessage(ar ? "تعذر حفظ البيانات." : "Could not save your profile."); }
    finally { setBusy(false); }
  }

  async function addEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${apiUrl}/account/profile/email/start`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), locale }),
      });
      if (!response.ok) throw new Error();
      setMessage(ar ? "أرسلنا رابط التحقق إلى البريد الجديد." : "We sent a verification link to the new email.");
      await load();
    } catch { setMessage(ar ? "تعذر إضافة البريد أو أنه مستخدم بحساب آخر." : "Could not add this email, or it belongs to another account."); }
    finally { setBusy(false); }
  }

  async function startPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${apiUrl}/account/profile/phone/start`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: data.get("phone"), locale }),
      });
      if (!response.ok) throw new Error();
      const body = await response.json() as { phone: string };
      setPendingPhone(body.phone); setPhoneStage("code");
      setMessage(ar ? "أرسلنا رمز التحقق إلى الرقم." : "We sent a verification code to the phone.");
    } catch { setMessage(ar ? "تعذر إرسال الرمز أو الرقم مرتبط بحساب آخر." : "Could not send the code, or the phone belongs to another account."); }
    finally { setBusy(false); }
  }

  async function confirmPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${apiUrl}/account/profile/phone/confirm`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: pendingPhone, code: data.get("code") }),
      });
      if (!response.ok) throw new Error();
      setProfile(await response.json() as ProfileDetails); setPhoneStage("idle");
      setMessage(ar ? "تم توثيق رقم الهاتف وربطه بالحساب." : "Your phone number is verified and linked.");
      window.dispatchEvent(new Event("xvond-account-changed"));
    } catch { setMessage(ar ? "رمز التحقق غير صحيح أو منتهي." : "The verification code is invalid or expired."); }
    finally { setBusy(false); }
  }

  if (!profile || !profile.email_verified || !profile.phone_verified) return null;

  return <section className="content-page shell account-page">
    <h2>{ar ? "بيانات الحساب" : "Account details"}</h2>
    <form className="account-address-form" onSubmit={(event) => void saveNames(event)}>
      <input name="first_name" placeholder={ar ? "الاسم الأول" : "First name"} defaultValue={profile.first_name || ""} required />
      <input name="last_name" placeholder={ar ? "اسم العائلة" : "Last name"} defaultValue={profile.last_name || ""} required />
      <button className="primary-button" disabled={busy}>{ar ? "حفظ الاسم" : "Save name"}</button>
    </form>

    <div className="account-cards">
      <article>
        <strong>{ar ? "البريد الإلكتروني" : "Email"}</strong>
        <p>{profile.email}</p>
        <small>{ar ? "موثّق" : "Verified"}</small>
        {profile.pending_email && <small>{ar ? `بانتظار تأكيد: ${profile.pending_email}` : `Waiting for verification: ${profile.pending_email}`}</small>}
        <form onSubmit={(event) => void addEmail(event)}>
          <input name="email" type="email" placeholder={ar ? "تغيير البريد" : "Change email"} required />
          <button className="secondary-button" disabled={busy}>{ar ? "إرسال رابط التحقق" : "Send verification link"}</button>
        </form>
      </article>

      <article>
        <strong>{ar ? "رقم الهاتف" : "Phone number"}</strong>
        <p>{profile.phone}</p>
        <small>{ar ? "موثّق" : "Verified"}</small>
        {phoneStage === "idle" ? <form onSubmit={(event) => void startPhone(event)}>
          <input name="phone" type="tel" placeholder="+968 9XXXXXXX" required />
          <button className="secondary-button" disabled={busy}>{ar ? "تغيير الرقم عبر OTP" : "Change phone with OTP"}</button>
        </form> : <form onSubmit={(event) => void confirmPhone(event)}>
          <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder={ar ? "رمز التحقق" : "Verification code"} required />
          <button className="secondary-button" disabled={busy}>{ar ? "تأكيد الرقم" : "Verify phone"}</button>
        </form>}
      </article>
    </div>
    {message && <p className="coupon-message">{message}</p>}
  </section>;
}
