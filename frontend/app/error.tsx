"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="center">
      <section className="panel" role="alert">
        <h1>نمایش صفحه با مشکل روبه‌رو شد</h1>
        <p>دوباره تلاش کنید.</p>
        <button onClick={reset}>تلاش دوباره</button>
      </section>
    </main>
  );
}
