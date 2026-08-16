"use client";

import { ensureTgSession, getLocaleHeader } from "./client";
import type { Dwelling } from "@/lib/dwellings";
import type { FengshuiSections } from "@/lib/fengshui-report";

/**
 * TG 风水端点（/api/tg/fengshui）的客户端封装（EP-fs-tg）。写法与
 * `tgGetProfile`/`tgListProfiles` 一致：先 `ensureTgSession()`，再带 cookie 打中介
 * 端点。只被 `lib/dwellings.ts` / `lib/fengshui-report.ts` 的 TG 分支调用——分流
 * 判断（`hasTgSession()`）在数据层，页面不感知宿主。
 *
 * ⚠️ 本模块对 `@/lib/dwellings` / `@/lib/fengshui-report` 只做 **type-only** import：
 * 那两个模块在运行时会 import 回本模块（分流），值级 import 会构成运行时循环依赖。
 */

export async function tgListDwellings(): Promise<Dwelling[]> {
  await ensureTgSession();
  const r = await fetch("/api/tg/fengshui", { credentials: "include" });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).dwellings ?? [];
}

export async function tgCreateDwelling(d: Omit<Dwelling, "id">): Promise<Dwelling> {
  await ensureTgSession();
  const r = await fetch("/api/tg/fengshui", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "dwellings.create", dwelling: d }),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).dwelling;
}

export async function tgUpdateDwelling(
  id: string,
  patch: Partial<Omit<Dwelling, "id">>,
): Promise<void> {
  await ensureTgSession();
  const r = await fetch("/api/tg/fengshui", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "dwellings.update", id, patch }),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function tgDeleteDwelling(id: string): Promise<void> {
  await ensureTgSession();
  const r = await fetch("/api/tg/fengshui", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "dwellings.delete", id }),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function tgReadFengshuiReport(fingerprint: string): Promise<FengshuiSections | null> {
  await ensureTgSession();
  const r = await fetch(`/api/tg/fengshui?fingerprint=${encodeURIComponent(fingerprint)}`, {
    credentials: "include",
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).sections ?? null;
}

export async function tgSaveFengshuiReport(args: {
  fingerprint: string; profileId: string; dwellingId: string | null;
  layer: 0 | 1; locale: string; sections: FengshuiSections;
}): Promise<void> {
  await ensureTgSession();
  const r = await fetch("/api/tg/fengshui", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "report.save", ...args }),
  });
  if (!r.ok) throw new Error(await r.text());
}

/**
 * 报告生成（对应 /api/fengshui/reading 的 TG 侧等价物）。body 与 web 路由同一契约
 * （BirthInput + 可选 dwelling/cohabitants）。402 时抛 `Error("paywall")`，与
 * `tgSpiritStream` 对额度闸门的处理同一惯例。
 */
export async function tgFengshuiReading(body: Record<string, unknown>): Promise<{
  sections: FengshuiSections;
  degraded: boolean;
}> {
  await ensureTgSession();
  const r = await fetch("/api/tg/fengshui", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", ...getLocaleHeader() },
    body: JSON.stringify({ action: "reading", ...body }),
  });
  if (r.status === 402) throw new Error("paywall");
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}
