import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "ویراکو | برد وظایف",
  description: "مدیریت وظایف و همکاری تیمی",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
