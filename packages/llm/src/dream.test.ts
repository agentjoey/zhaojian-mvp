import { describe, it, expect } from "vitest";
import { sanitizeDream } from "./dream";

describe("sanitizeDream：预言措辞机械扫描", () => {
  it("zh：预言句无标注 → 剥离该句，其余保留", () => {
    const out = sanitizeDream("这个梦在替你处理对失控的恐惧。\n梦见水预示着财运要来了。\n试着今晚早点睡。", "zh");
    expect(out.text).toContain("失控的恐惧");
    expect(out.text).toContain("早点睡");
    expect(out.text).not.toContain("预示着财运");
    expect(out.stripped).toHaveLength(1);
  });

  it("zh：同段有诚实标注 → 保留", () => {
    const t = "民间说法里，梦见水预示着财。这只是文化参照。";
    const out = sanitizeDream(t, "zh");
    expect(out.text).toBe(t);
    expect(out.stripped).toHaveLength(0);
  });

  it("zh：纯心理映照文本 → 原样不动", () => {
    const t = "被追的梦，常常和最近躲着的那件事有关。";
    expect(sanitizeDream(t, "zh").text).toBe(t);
  });

  it("en：prediction without marker → stripped；with marker → kept", () => {
    const bad = sanitizeDream("This dream foretells a promotion. You have been carrying a lot.", "en");
    expect(bad.text).not.toContain("foretells");
    expect(bad.text).toContain("carrying a lot");
    const good = "In folk tradition, water is an omen of wealth — take it as cultural reference only.";
    expect(sanitizeDream(good, "en").text).toBe(good);
  });

  it("整篇都是无标注预言 → 剥空（由 interpretDream 的 fallback 接管）", () => {
    const out = sanitizeDream("梦见蛇预示着灾祸。这将会发生。", "zh");
    expect(out.text.length).toBeLessThan(6);
  });

  it("zh：标注只豁免同段——跨段预言句仍剥离", () => {
    const out = sanitizeDream("民间说法仅供参考。\n梦见水预示着财运。", "zh");
    expect(out.text).not.toContain("预示着财运");
    expect(out.text).toContain("民间说法仅供参考");
    expect(out.stripped).toHaveLength(1);
  });

  it("en：句首大写也命中（toLowerCase 是 load-bearing）", () => {
    const out = sanitizeDream("Foretells doom ahead.", "en");
    expect(out.text).not.toContain("Foretells");
    expect(out.stripped).toHaveLength(1);
  });
});
