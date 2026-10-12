"use client";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, User, roles, message } from "../lib/api";
const Context = createContext<{
  user: User;
  reload: () => Promise<void>;
} | null>(null);
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("نشست در دسترس نیست");
  return value;
}
export function AuthLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const reload = async () => {
    const data = await api<{ user: User }>("/auth/me");
    setUser(data.user);
  };
  useEffect(() => {
    const expired = () => {
      setUser(null);
      router.replace("/login");
    };
    window.addEventListener("session-expired", expired);
    api<{ user: User }>("/auth/me")
      .then((data) => setUser(data.user))
      .catch((e) => setError(message(e)));
    return () => window.removeEventListener("session-expired", expired);
  }, [router]);
  if (!user)
    return (
      <main className="center">
        <div className="panel" role="status">
          {error || "در حال بررسی نشست…"}
          {error && (
            <button onClick={() => window.location.reload()}>
              تلاش دوباره
            </button>
          )}
        </div>
      </main>
    );
  return (
    <Context.Provider value={{ user, reload }}>
      <a className="skip" href="#content">
        رفتن به محتوای اصلی
      </a>
      <header>
        <div className="shell header">
          <Link href="/" className="brand">
            ◈ ویراکو <span>مدیریت وظایف</span>
          </Link>
          <nav aria-label="منوی اصلی">
            <Link
              href="/"
              aria-current={
                pathname === "/" || pathname.startsWith("/tasks/")
                  ? "page"
                  : undefined
              }
            >
              وظایف
            </Link>
            {user.role === "OWNER" && (
              <Link
                href="/users"
                aria-current={pathname === "/users" ? "page" : undefined}
              >
                کاربران
              </Link>
            )}
          </nav>
          <div className="account">
            <span>
              <bdi>{user.email}</bdi>
              <small>{roles[user.role]}</small>
            </span>
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/auth/logout", "POST", {});
                  router.replace("/login");
                } catch (e) {
                  setError(message(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              خروج
            </button>
          </div>
        </div>
      </header>
      <main id="content" className="shell main">
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {children}
      </main>
    </Context.Provider>
  );
}
