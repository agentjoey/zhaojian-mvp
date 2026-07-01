import { type Locale, LOCALE_COOKIE } from "./locale";

export function localeFromRequest(req: Request): Locale {
  // 1. 客户端显式指定（TG / Web 调用统一优先）
  const header = req.headers.get("x-zj-locale");
  if (header === "zh" || header === "en") return header;

  // 2. cookie 持久化值
  const cookieHeader = req.headers.get("cookie") || "";
  const m = cookieHeader.match(
    new RegExp(`(?:^|\\s*;\\s*)${LOCALE_COOKIE}=(zh|en)`),
  );
  if (m) return m[1] as Locale;

  // 3. 默认中文，保证现有用户无感
  return "zh";
}
