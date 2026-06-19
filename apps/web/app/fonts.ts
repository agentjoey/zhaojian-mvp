// 照见 Zhaojian · 字体加载（全衬线：中文思源宋体 + 拉丁 Cormorant Garamond）
import { Noto_Serif_SC, Cormorant_Garamond } from "next/font/google";

export const notoSerifSC = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "900"],
  variable: "--font-serif",
  display: "swap",
});

export const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-latin",
  display: "swap",
});
