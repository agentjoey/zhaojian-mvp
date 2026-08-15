import type { FengshuiSectionKey } from "@eamvp/llm";

/**
 * 风水报告 localStorage 缓存（EP-fs-07）。
 * 波 1 无服务端持久化（fengshui_reports 属波 2 的 EP-fs-11），
 * 与既有 polishDailyFortune 的按键缓存做法一致。
 * 缓存键含引擎版本 —— 引擎表一改即自动失效。
 *
 * ⚠️ 只用来缓存「可信」的叙述：调用方在收到 degraded 报告
 * （generateFengshuiReading 的方位纠正信号，见 @eamvp/llm）时不应调用
 * writeFengshuiCache——一份带瑕疵的叙述被写入后会一直被 readFengshuiCache
 * 命中并跳过重新生成，相当于把「模型说错过话」永久钉死在用户的浏览器里。
 * 这条约束由调用方（apps/web/app/fengshui/page.tsx）负责遵守，本模块本身
 * 只做无条件的读写，不感知 degraded。
 *
 * Task 14 复审必修1：route 的响应契约从「纯 markdown 文本」改成 JSON（body 直接给
 * 已按三个 H2 切好的 `sections`），本模块缓存的载荷随之从 markdown 字符串改成
 * `FengshuiSections` 对象——用 JSON.stringify/parse 序列化，localStorage 本身仍只
 * 能存字符串。缓存键的公式（profileId + engineVersion + locale）不变。
 * 若某个 key 下存的是旧版本（改造前）写入的原始 markdown 字符串，JSON.parse 会
 * 抛错，被下面的 try/catch 吞掉、当作 cache miss 处理——不需要显式迁移。
 */

export type FengshuiSections = Record<FengshuiSectionKey, string>;

export function fengshuiCacheKey(profileId: string, engineVersion: string, locale: string): string {
  return `zhaojian.fengshui.${profileId}.${engineVersion}.${locale}`;
}

export function readFengshuiCache(key: string): FengshuiSections | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as FengshuiSections;
  } catch {
    return null;
  }
}

export function writeFengshuiCache(key: string, sections: FengshuiSections): void {
  try {
    localStorage.setItem(key, JSON.stringify(sections));
  } catch {
    // 隐私模式/配额满/JSON.stringify 失败：静默降级为不缓存
  }
}
