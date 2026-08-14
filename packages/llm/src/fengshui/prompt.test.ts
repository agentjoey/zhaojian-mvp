import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, computeFengshui, FENGSHUI_GUARDRAILS } from "@eamvp/core";
import { extractFengshuiFacts } from "./facts";
import { buildFengshuiSystemPrompt, buildFengshuiUserPrompt, parseFengshuiSections, FENGSHUI_SECTION_KEYS } from "./prompt";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const facts = extractFengshuiFacts(computeFengshui({ birth, chart: computeUnifiedChart(birth) }));

describe("EP-fs-05 风水 prompt", () => {
  it("三个分节键", () => {
    expect(FENGSHUI_SECTION_KEYS).toEqual(["situation", "youAndSpace", "actions"]);
  });

  // ⚠️ 下面两条只验 core 守护栏被带进来了。它们**不能**用来验本模块新增的硬规则——
  // FENGSHUI_GUARDRAILS 的原文就含「传统象征」「研究表明/科学证明」「不构成」「禁止自行推算」，
  // 把本模块新增的两行全删掉，这些断言照样通过。本模块自己的约束由后两条测试守。
  it("system prompt 带入 core 守护栏全文", () => {
    const s = buildFengshuiSystemPrompt("zh");
    for (const g of FENGSHUI_GUARDRAILS) expect(s).toContain(g);
  });

  it("system prompt 列出八个合法星名的白名单（本模块新增，core 守护栏没有）", () => {
    const s = buildFengshuiSystemPrompt("zh");
    for (const star of ["生气", "天医", "延年", "伏位", "绝命", "五鬼", "六煞", "祸害"]) {
      expect(s).toContain(star);
    }
    // 该措辞只存在于本模块，core 守护栏无此句
    expect(s).toContain("不得改写某方位对应的星");
    expect(FENGSHUI_GUARDRAILS.join("")).not.toContain("不得改写某方位对应的星");
  });

  it("system prompt 对传统象征给出仪式框架（本模块新增措辞）", () => {
    const s = buildFengshuiSystemPrompt("zh");
    expect(s).toContain("安顿自己的仪式");
    expect(FENGSHUI_GUARDRAILS.join("")).not.toContain("安顿自己的仪式");
  });

  it("user prompt 带入命卦与八方判语", () => {
    const u = buildFengshuiUserPrompt(facts);
    expect(u).toContain("坎");
    expect(u).toContain("东南"); // 坎命生气方
    expect(u).toContain("生气");
  });

  it("user prompt 对传统象征条目显式标注，且 modern 为空时写明不得编造", () => {
    const u = buildFengshuiUserPrompt(facts);
    expect(u).toContain("传统象征");
    // 留白会让模型自行填补现代机制，正是要防的反模式
    expect(u).toContain("无（不得编造）");
  });

  it("user prompt 不改动传入的 facts（sort 必须先复制）", () => {
    // ⚠️ 必须新造一份：模块级的 facts 已被前面的用例排过序，
    // 拿它当基准会让「原地排序」变成幂等操作而测不出来
    const fresh = extractFengshuiFacts(computeFengshui({ birth, chart: computeUnifiedChart(birth) }));
    const before = fresh.directions.map((d) => d.direction);
    // extractFengshuiFacts 按 DIRECTIONS 规范顺序产出，不是按吉凶排序
    expect(before).toEqual(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
    buildFengshuiUserPrompt(fresh);
    expect(fresh.directions.map((d) => d.direction)).toEqual(before);
  });

  it("parseFengshuiSections 按 H2 切三节，缺节置空", () => {
    const md = "## 形势\n甲\n\n## 境与你\n乙\n";
    const s = parseFengshuiSections(md, "zh");
    expect(s.situation.trim()).toBe("甲");
    expect(s.youAndSpace.trim()).toBe("乙");
    expect(s.actions).toBe("");
  });
});
