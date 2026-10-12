"use client";
import { useState } from "react";
import { validationProps } from "../../lib/forms";
import { useRouter } from "next/navigation";
import { api, message } from "../../lib/api";
export default function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <main className="center">
      <section className="panel login">
        <p className="eyebrow">ویراکو · فضای همکاری تیم</p>
        <h1>خوش آمدید</h1>
        <p className="muted">برای مدیریت وظایف وارد حساب خود شوید.</p>
        <form
          {...validationProps}
          aria-busy={busy}
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const data = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await api("/auth/login", "POST", {
                email: String(data.get("email")).trim(),
                password: data.get("password"),
              });
              router.replace("/");
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            ایمیل
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="username"
              dir="ltr"
            />
          </label>
          <label>
            رمز عبور
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy} className="primary">
            {busy ? "در حال ورود…" : "ورود به حساب"}
          </button>
        </form>
        <p className="muted">حساب‌های کاربری توسط مالک سازمان ایجاد می‌شوند.</p>
      </section>
    </main>
  );
}
