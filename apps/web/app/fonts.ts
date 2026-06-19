// 照见 Zhaojian · 字体（素白 v2）：大标题宋体，正文无衬线，拉丁 Cormorant。
import { Noto_Serif_SC, Noto_Sans_SC, Cormorant_Garamond } from "next/font/google";

// 大标题 / 焦点字 / 命理字
export const notoSerifSC = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  variable: "--font-serif",
  display: "swap",
});

// 正文 / UI（现代无衬线）
export const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
});

// 拉丁 kicker / 数字 / 度数 / 序号
export const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-latin",
  display: "swap",
});
