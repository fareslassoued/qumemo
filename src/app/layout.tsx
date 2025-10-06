import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { qaloonFont } from "./fonts";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Quran Memorization App - Qalun Recitation",
  description: "Quran memorization app with Qalun recitation by Mahmoud Khalil Al-Husari",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${qaloonFont.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
