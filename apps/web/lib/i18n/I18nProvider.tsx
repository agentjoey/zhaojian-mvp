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
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const messagesByLocale: Record<Locale, Messages> = { zh, en };

function getValueByPath(obj: Messages, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
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

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof document === "undefined") return "zh";
    return detectLocale();
  });

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

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
    (key: string, vars?: Record<string, string | number>): string => {
      const currentMessages = messagesByLocale[locale] ?? zh;
      const fallbackMessages = zh;
      const value =
        getValueByPath(currentMessages, key) ??
        getValueByPath(fallbackMessages, key) ??
        key;
      return interpolate(value, vars);
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

export function useT(): (
  key: string,
  vars?: Record<string, string | number>
) => string {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within <I18nProvider>");
  return ctx.t;
}
