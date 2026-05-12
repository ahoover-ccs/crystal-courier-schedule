import type { Metadata } from "next";
import { EB_Garamond } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-eb-garamond",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Crystal Courier — Scheduling",
  description: "Driver route scheduling, time off, and open shifts for Crystal Courier Service.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${ebGaramond.variable} h-full`}>
      <body className="min-h-full flex flex-col font-serif antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
