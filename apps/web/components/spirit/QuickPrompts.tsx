"use client";

import { useT } from "@/lib/i18n/I18nProvider";

export function QuickPrompts({ onSelect }: { onSelect: (prompt: string) => void }) {
  const t = useT();
  const prompts = t("spirit.quickPrompts") as unknown as string[];

  return (
    <div className="w-full">
      <p className="mb-2 text-[12px] text-muted">想继续问：</p>
      <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelect(prompt)}
            className="shrink-0 rounded-[var(--radius-chip)] border border-[var(--color-line)] bg-surface px-3 py-2 text-[12px] text-ink-2 transition-colors active:bg-paper"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
