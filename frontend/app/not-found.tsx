import Link from "next/link";
export default function NotFound() {
  return (
    <main className="center">
      <section className="panel">
        <h1>صفحه پیدا نشد</h1>
        <Link href="/">بازگشت به برد وظایف</Link>
      </section>
    </main>
  );
}
