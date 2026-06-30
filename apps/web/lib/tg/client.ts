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

export async function tgGetProfile(): Promise<any | null> {
  await ensureTgSession();
  const r = await fetch("/api/tg/profile", { credentials: "include" });
  if (!r.ok) return null;
  return (await r.json()).profile ?? null;
}

export async function tgListMessages(): Promise<
  { id: string; role: "user" | "spirit"; content: string; createdAt: string }[]
> {
  await ensureTgSession();
  const r = await fetch("/api/tg/spirit", { credentials: "include" });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).messages ?? [];
}

export async function tgSpiritStream(
  messages: { role: "user" | "spirit"; content: string }[],
  onChunk: (s: string) => void
): Promise<string> {
  await ensureTgSession();
  const r = await fetch("/api/tg/spirit", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (r.status === 402) throw new Error("quota");
  if (!r.ok || !r.body) throw new Error((await r.text()) || "对话失败");
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const c = dec.decode(value, { stream: true });
    full += c;
    onChunk(c);
  }
  return full;
}

export async function tgDaily(
  dateStr: string
): Promise<{ daily: any; greeting: string | null }> {
  await ensureTgSession();
  const r = await fetch("/api/tg/daily", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dateStr }),
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function tgGetQuestionnaire(): Promise<Record<string, string> | null> {
  await ensureTgSession();
  const r = await fetch("/api/tg/questionnaire", { credentials: "include" });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).answers ?? null;
}

export async function tgSaveQuestionnaire(answers: Record<string, string>): Promise<void> {
  await ensureTgSession();
  const r = await fetch("/api/tg/questionnaire", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function tgListProfiles(): Promise<any[]> {
  await ensureTgSession();
  const r = await fetch("/api/tg/profile", { credentials: "include" });
  if (!r.ok) return [];
  return (await r.json()).profiles ?? [];
}

export async function tgDeleteProfile(id: string): Promise<void> {
  await ensureTgSession();
  await fetch(`/api/tg/profile?id=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
}

export async function tgLoginWithWidget(data: any): Promise<{ ok: true }> {
  const r = await fetch("/api/auth/telegram", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  return r.ok ? r.json() : Promise.reject(await r.text());
}

export async function tgLogout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}
