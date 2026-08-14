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
 */

export function fengshuiCacheKey(profileId: string, engineVersion: string, locale: string): string {
  return `zhaojian.fengshui.${profileId}.${engineVersion}.${locale}`;
}

export function readFengshuiCache(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeFengshuiCache(key: string, markdown: string): void {
  try {
    localStorage.setItem(key, markdown);
  } catch {
    // 隐私模式/配额满：静默降级为不缓存
  }
}
