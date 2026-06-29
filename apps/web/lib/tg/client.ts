"use client";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}

export function isTelegram(): boolean {
  if (typeof window === "undefined") return false;
  return !!((window as any).Telegram?.WebApp?.initData);
}

export function tgReadyExpand(): void {
  const w = (window as any).Telegram?.WebApp;
  w?.ready?.();
  w?.expand?.();
}

export async function ensureTgSession(): Promise<boolean> {
  const initData = (window as any).Telegram?.WebApp?.initData;
  const r = await fetch("/api/tg/session", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  return !!j.hasProfile;
}
