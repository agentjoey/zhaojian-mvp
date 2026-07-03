"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { detectLocale, LOCALE_COOKIE, type Locale } from "./locale";
import { zh } from "./messages/zh";
import { en } from "./messages/en";
import type { Messages } from "./messages/zh";

type I18nContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: <T = string>(key: string, vars?: Record<string, string | number>) => T;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const messagesByLocale: Record<Locale, Messages> = { zh, en };

function getValueByPath(obj: Messages, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function interpolate(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{([^}]+)\}/g, (_, name) => {
    const value = vars[name];
    return value !== undefined ? String(value) : `{${name}}`;
  });
}

export function I18nProvider({
  children,
  locale: localeProp,
}: {
  children: React.ReactNode;
  locale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (localeProp) return localeProp;
    if (typeof document === "undefined") return "zh";
    return detectLocale();
  });

  useEffect(() => {
    if (localeProp) return;
    setLocaleState(detectLocale());
  }, [localeProp]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; SameSite=Lax`;
      localStorage.setItem(LOCALE_COOKIE, l);
    } catch {
      // ignore storage errors in restricted environments
    }
  }, []);

  const t = useCallback(
    <T = string,>(key: string, vars?: Record<string, string | number>): T => {
      const currentMessages = messagesByLocale[locale] ?? zh;
      const fallbackMessages = zh;
      const value =
        getValueByPath(currentMessages, key) ??
        getValueByPath(fallbackMessages, key) ??
        key;
      if (typeof value === "string") return interpolate(value, vars) as T;
      return value as T;
    },
    [locale]
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale === "zh" ? "zh-Hans" : "en";
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): {
  locale: Locale;
  setLocale: (l: Locale) => void;
} {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useLocale must be used within <I18nProvider>");
  return { locale: ctx.locale, setLocale: ctx.setLocale };
}

export function useT(): <T = string>(
  key: string,
  vars?: Record<string, string | number>
) => T {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within <I18nProvider>");
  return ctx.t;
}
