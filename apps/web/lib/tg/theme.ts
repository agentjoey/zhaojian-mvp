"use client";
type WA = { colorScheme?: "light"|"dark"; themeParams?: Record<string,string>; onEvent?: (e:string,cb:()=>void)=>void; offEvent?: (e:string,cb:()=>void)=>void };
function wa(): WA | undefined { return (typeof window!=="undefined" ? (window as any).Telegram?.WebApp : undefined); }
export function applyTgTheme(): void {
  const w = wa(); if (!w) return;
  const scheme = w.colorScheme === "dark" ? "dark" : "light";
  const root = document.documentElement;
  root.setAttribute("data-tg-theme", scheme);
  const p = w.themeParams || {};
  // 把 TG 原生色暴露为 --tg-*（供 header/链接等对齐），令牌主色仍由 globals.css 的 data-tg-theme 块决定
  for (const [k,v] of Object.entries(p)) root.style.setProperty(`--tg-${k.replace(/_/g,"-")}`, String(v));
}
export function watchTgTheme(): () => void {
  const w = wa(); if (!w) return () => {};
  applyTgTheme();
  const cb = () => applyTgTheme();
  w.onEvent?.("themeChanged", cb);
  return () => w.offEvent?.("themeChanged", cb);
}
