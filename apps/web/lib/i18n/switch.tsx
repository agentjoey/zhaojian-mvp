"use client";

import { useLocale } from "./I18nProvider";
import type { Locale } from "./locale";

const options: { value: Locale; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

export function LocaleSwitch() {
  const { locale, setLocale } = useLocale();

  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex items-center rounded-full bg-[var(--color-tint)] p-1"
    >
      {options.map((opt) => {
        const active = locale === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setLocale(opt.value)}
            className={[
              "rounded-full px-3 py-1 text-sm font-medium transition-colors",
              active
                ? "bg-[var(--color-cinnabar)] text-[var(--color-on-strong)]"
                : "text-[var(--color-ink-2)] hover:text-[var(--color-ink)]",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
