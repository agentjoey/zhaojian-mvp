import type { Metadata } from "next";
import Script from "next/script";
import { notoSerifSC, notoSansSC, cormorant } from "./fonts";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "照见 · 东方占星自我观照",
  description:
    "紫微斗数 + 八字（命理）叠合利兹·格林深层心理（西方本命盘）。自我观照的镜子，而非预言吉凶。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-Hans"
      data-theme="xuan"
      className={`${notoSerifSC.variable} ${notoSansSC.variable} ${cormorant.variable} h-full`}
    >
      <body className="min-h-full">
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
