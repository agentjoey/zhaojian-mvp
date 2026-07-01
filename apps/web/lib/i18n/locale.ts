export type Locale = "zh" | "en";

export const LOCALE_COOKIE = "zj_locale";

export function detectLocale(): Locale {
  if (typeof document === "undefined") return "zh";
  const m = document.cookie.match(/(?:^|; )zj_locale=(zh|en)/);
  if (m) return m[1] as Locale;
  return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function localeToReadingLanguage(l: Locale): "zh" | "en" {
  return l;
}
