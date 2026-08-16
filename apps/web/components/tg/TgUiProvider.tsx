"use client";

import { useEffect } from "react";
import { isTelegram } from "@/lib/tg/client";
import { watchTgTheme } from "@/lib/tg/theme";
import { useTgBackButton } from "@/lib/tg/ui";

export function TgUiProvider({ children }: { children: React.ReactNode }) {
  useTgBackButton();

  useEffect(() => {
    if (!isTelegram()) return;
    const w = window.Telegram?.WebApp;
    if (!w) return;
    try {
      w.ready?.();
      w.expand?.();
    } catch {}
    const off = watchTgTheme();
    try {
      w.setHeaderColor?.("secondary_bg_color");
      w.enableClosingConfirmation?.();
    } catch {}
    return off;
  }, []);

  return <>{children}</>;
}
