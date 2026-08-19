import { describe, it, expect } from "vitest";
import { checkVoice, anchorKeyTerms, VOICE_LIMITS } from "./voice";

/**
 * 风格检查器的单元测试：每条检查项至少一正（抓到）一反（放过）。
 * 构造文本刻意隔离变量（如测句数时保证字数不超标），
 * 这样「抓到/抓不到」才能归因到被测的那条规则。
 */

const zhShort = "嗯，这确实难。"; // 1 句、8 字、无禁用词、非问句——基准干净文本

describe("checkVoice · 句数", () => {
  it("4 句（未要求展开）被抓", () => {
    const v = checkVoice("一句。两句。三句。四句。", { language: "zh" });
    expect(v.some((x) => x.rule === "sentence-count")).toBe(true);
  });
  it("3 句放行", () => {
    const v = checkVoice("一句。两句。三句。", { language: "zh" });
    expect(v.some((x) => x.rule === "sentence-count")).toBe(false);
  });
  it("要求展开（allowLong）时 5 句放行、7 句被抓", () => {
    expect(checkVoice("一。二。三。四。五。", { language: "zh", allowLong: true })).toHaveLength(0);
    const v = checkVoice("一。二。三。四。五。六。七。", { language: "zh", allowLong: true });
    expect(v.some((x) => x.rule === "sentence-count")).toBe(true);
  });
  it("英文按 .!? 断句，4 句被抓", () => {
    const v = checkVoice("One. Two. Three. Four.", { language: "en" });
    expect(v.some((x) => x.rule === "sentence-count")).toBe(true);
  });
});

describe("checkVoice · 长度", () => {
  it(`中文超过 ${VOICE_LIMITS.zhChars} 字被抓`, () => {
    const v = checkVoice("长".repeat(VOICE_LIMITS.zhChars + 1) + "。", { language: "zh" });
    expect(v.some((x) => x.rule === "length")).toBe(true);
  });
  it("中文 120 字以内放行", () => {
    const v = checkVoice("长".repeat(VOICE_LIMITS.zhChars - 1) + "。", { language: "zh" });
    expect(v).toHaveLength(0);
  });
  it(`英文超过 ${VOICE_LIMITS.enWords} 词被抓`, () => {
    const v = checkVoice(Array(VOICE_LIMITS.enWords + 1).fill("word").join(" ") + ".", { language: "en" });
    expect(v.some((x) => x.rule === "length")).toBe(true);
  });
  it("英文短答放行", () => {
    expect(checkVoice("Yes. That is hard.", { language: "en" })).toHaveLength(0);
  });
});

describe("checkVoice · 禁用词与语气词", () => {
  it.each(["首先", "总而言之", "我理解你的感受", "作为你的本命之灵", "值得注意的是", "让我们一起"])(
    "中文禁用词「%s」被抓",
    (phrase) => {
      const v = checkVoice(`${phrase}，这件事不急。`, { language: "zh" });
      expect(v.some((x) => x.rule === "banned-phrase" && x.detail.includes(phrase))).toBe(true);
    },
  );
  it("干净中文文本无禁用词违规", () => {
    expect(checkVoice(zhShort, { language: "zh" })).toHaveLength(0);
  });
  it("同句 呢/哦/呀 连用被抓，单个语气词放行", () => {
    const v = checkVoice("这个呢，你呀，得想开哦。", { language: "zh" });
    expect(v.some((x) => x.rule === "banned-phrase" && x.detail.includes("语气词"))).toBe(true);
    expect(checkVoice("嗯，这确实难呢。", { language: "zh" })).toHaveLength(0);
  });
  it.each(["Moreover", "In conclusion", "I understand how you feel", "As your natal spirit", "It's worth noting that"])(
    "英文禁用词 \"%s\" 被抓（大小写不敏感）",
    (phrase) => {
      const v = checkVoice(`${phrase} this matters.`, { language: "en" });
      expect(v.some((x) => x.rule === "banned-phrase")).toBe(true);
    },
  );
  it("干净英文文本放行", () => {
    expect(checkVoice("Roots first. Branches follow.", { language: "en" })).toHaveLength(0);
  });
});

describe("checkVoice · 问句结尾", () => {
  it("中文以 ？结尾被抓", () => {
    const v = checkVoice("你最怕的是什么？", { language: "zh" });
    expect(v.some((x) => x.rule === "question-ending")).toBe(true);
  });
  it("英文以 ? 结尾被抓", () => {
    const v = checkVoice("What do you fear?", { language: "en" });
    expect(v.some((x) => x.rule === "question-ending")).toBe(true);
  });
  it("陈述句结尾放行；问句在中间不算", () => {
    expect(checkVoice(zhShort, { language: "zh" })).toHaveLength(0);
    expect(checkVoice("你怕什么？别怕。", { language: "zh" })).toHaveLength(0);
  });
});

describe("checkVoice · 锚点事实复引", () => {
  const anchorFacts = ["chart ruler Moon (Pisces in 12th house)", "fortune-palace stars 天同、太阴"];
  it("本轮再次引用上一轮已提过的锚点关键词被抓", () => {
    const v = checkVoice("我看见你的 Moon 落在安静处。", {
      language: "zh",
      anchorFacts,
      previousSpiritReplies: ["Moon 是你这轮盘子的主人。"],
    });
    expect(v.some((x) => x.rule === "anchor-repeat" && x.detail.includes("Moon"))).toBe(true);
  });
  it("首次引用锚点放行；不给既往回应时不查", () => {
    expect(
      checkVoice("我看见你的 Moon 落在安静处。", { language: "zh", anchorFacts, previousSpiritReplies: [] }),
    ).toHaveLength(0);
    expect(
      checkVoice("天同让你心软。", { language: "zh", anchorFacts, previousSpiritReplies: ["Moon 是主人。"] }),
    ).toHaveLength(0);
  });
});

describe("anchorKeyTerms", () => {
  it("抽取拉丁词与中文段，滤掉通用词", () => {
    const terms = anchorKeyTerms(["chart ruler Moon (Pisces in 12th house)", "the pull of 化忌 (巨门) in your 夫妻宫"]);
    expect(terms).toContain("Moon");
    expect(terms).toContain("巨门");
    expect(terms).toContain("夫妻宫");
    expect(terms).not.toContain("chart");
    expect(terms).not.toContain("the");
  });

  it("单字中文段不算锚点（宫/星/忌是通用构词，留下会把正常回应误报成复引）", () => {
    const terms = anchorKeyTerms(["fortune-palace stars 紫微、天府", "the pull of 化忌 (巨门) in your 夫妻宫"]);
    // 反：单字被滤掉
    expect(terms).not.toContain("宫");
    expect(terms).not.toContain("忌");
    // 正：多字词保留（若过滤过狠整条会失效）
    expect(terms).toContain("夫妻宫");
    expect(terms).toContain("化忌");
    expect(terms).toContain("巨门");
  });
});

describe("长答字数档（EP-dream-01 前置）", () => {
  const longText = "字".repeat(200); // 200 字：超短答档 120，未超长答档 300

  it("allowLong 同时放宽句数与字数（280 字梦解读不应误判违规）", () => {
    const v = checkVoice("字".repeat(280), { language: "zh", allowLong: true });
    expect(v.filter((x) => x.rule === "length")).toEqual([]);
  });

  it("allowLong 的 301 字仍抓（放宽不是无上限）", () => {
    const v = checkVoice("字".repeat(301), { language: "zh", allowLong: true });
    expect(v.some((x) => x.rule === "length")).toBe(true);
  });

  it("默认档下 200 字被抓、dreamMode 下 200 字放行", () => {
    expect(checkVoice(longText, { language: "zh" }).some((x) => x.rule === "length")).toBe(true);
    expect(checkVoice(longText, { language: "zh", dreamMode: true }).filter((x) => x.rule === "length")).toEqual([]);
  });

  it(`英文长答档：${VOICE_LIMITS.enWordsLong} 词放行、超一词被抓（allowLong / dreamMode 同档）`, () => {
    const atCap = Array(VOICE_LIMITS.enWordsLong).fill("word").join(" ") + ".";
    const overCap = Array(VOICE_LIMITS.enWordsLong + 1).fill("word").join(" ") + ".";
    expect(checkVoice(atCap, { language: "en", allowLong: true }).filter((x) => x.rule === "length")).toEqual([]);
    expect(checkVoice(atCap, { language: "en", dreamMode: true }).filter((x) => x.rule === "length")).toEqual([]);
    expect(checkVoice(overCap, { language: "en", dreamMode: true }).some((x) => x.rule === "length")).toBe(true);
  });

  it("dreamMode：8 句 300 字内放行，9 句抓", () => {
    const eight = Array.from({ length: 8 }, (_, i) => `第${i + 1}句。`).join("");
    expect(checkVoice(eight, { language: "zh", dreamMode: true }).filter((x) => x.rule === "sentence-count")).toEqual([]);
    const nine = eight + "第九句。";
    expect(checkVoice(nine, { language: "zh", dreamMode: true }).some((x) => x.rule === "sentence-count")).toBe(true);
  });

  it("dreamMode 下 280 字放行、301 字抓", () => {
    expect(checkVoice("字".repeat(280), { language: "zh", dreamMode: true }).filter((x) => x.rule === "length")).toEqual([]);
    expect(checkVoice("字".repeat(301), { language: "zh", dreamMode: true }).some((x) => x.rule === "length")).toBe(true);
  });

  it("默认短答档不变（回归）：121 字仍抓", () => {
    expect(checkVoice("字".repeat(121), { language: "zh" }).some((x) => x.rule === "length")).toBe(true);
  });
});
