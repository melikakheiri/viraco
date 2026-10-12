import "./globals.css";
import localFont from "next/font/local";
import type { Metadata } from "next";
const vazirmatn = localFont({
  src: "./fonts/Vazirmatn-Variable.woff2",
  weight: "400 700",
  style: "normal",
  display: "swap",
  variable: "--font-vazirmatn",
});
export const metadata: Metadata = {
  title: "ویراکو | برد وظایف",
  description: "مدیریت وظایف و همکاری تیمی",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body>{children}</body>
    </html>
  );
}
