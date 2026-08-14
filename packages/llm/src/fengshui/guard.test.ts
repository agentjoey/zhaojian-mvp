import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, computeFengshui } from "@eamvp/core";
import { extractFengshuiFacts } from "./facts";
import { sanitizeFengshui, verifyDirectionConsistency, sortLabelsLongestFirst } from "./guard";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const facts = extractFengshuiFacts(computeFengshui({ birth, chart: computeUnifiedChart(birth) }));
// 1990 男 = 坎1；坎命：生气巽(东南) 天医震(东) 延年离(南) 伏位坎(北)
//                    绝命坤(西南) 五鬼艮(东北) 六煞乾(西北) 祸害兑(西)
const east = facts.directions.find((d) => d.direction === "E")!; // 天医

describe("EP-fs-06 sanitizeFengshui", () => {
  it("删掉传统象征条目上的科学措辞", () => {
    const md = "## 可做的事\n- 把储物柜挪到凶方（传统象征）。研究表明这样能显著降低压力。\n";
    const out = sanitizeFengshui(md, facts);
    expect(out).not.toContain("研究表明");
    expect(out).toContain("把储物柜挪到凶方");
  });

  it("多种伪科学措辞一并清除", () => {
    const md = "- 金属摆件（传统象征）。科学证明有效，临床显示如此，实验显示亦然。";
    const out = sanitizeFengshui(md, facts);
    for (const w of ["科学证明", "临床", "实验显示"]) expect(out).not.toContain(w);
  });

  it("不误伤：双重支撑段落的现代机制表述保留", () => {
    const md = "- 床头贴实墙，可降低睡眠中对背后空间的低度警觉。";
    expect(sanitizeFengshui(md, facts)).toBe(md);
  });

  // Minor B：上面那条"不误伤"用例的输入不含任何伪科学词，isSymbolic 判定结果
  // 对输出没有任何影响（哪怕硬编码成 true 也照样通过）——没有判别力。
  // 这条换成"双重支撑语境 + 真的含伪科学词"，isSymbolic 判对判错会产生不同输出，
  // 才能真正验证语境判定没有被错误地放宽。
  it("Minor B：双重支撑内容里含「研究表明」但不在传统象征语境，必须原样保留（判别力用例）", () => {
    const md = "- 床头贴实墙，研究表明这样能降低睡眠中的警觉水平。";
    // 前置条件：确认这行确实不会被现有的两条 isSymbolic 触发路径命中——
    // 否则这条用例就和上面那条一样没有判别力了。
    expect(md).not.toContain("传统象征");
    expect(md).not.toContain("象征意义");
    expect(md).not.toContain("仪式");
    expect(sanitizeFengshui(md, facts)).toBe(md);
  });

  // Minor A：词表多趟 replace 会在两个词条共享字符时留下残片（如"科学研究表明"里
  // 先删"研究表明"剩下孤立的"科学"）。改成组合正则单趟吃掉整条措辞后，
  // 这两个输入必须被完整清除，不留残片。
  it("Minor A：链式伪科学措辞（科学+研究+表明）一次性吃掉，不留「科学」残片", () => {
    const md = "- 摆件（传统象征）。科学研究表明这样能降低压力。";
    expect(sanitizeFengshui(md, facts)).toBe("- 摆件（传统象征）。这样能降低压力。");
  });

  it("Minor A：链式伪科学措辞（实验+数据+显示）一次性吃掉，不留「实验」残片", () => {
    const md = "- 摆件（传统象征）。实验数据显示有效。";
    expect(sanitizeFengshui(md, facts)).toBe("- 摆件（传统象征）。有效。");
  });
});

describe("EP-fs-06 verifyDirectionConsistency", () => {
  it("方位与星名不符时纠正回查表值", () => {
    const md = `东为绝命方，不宜久坐。`;
    const { text, corrections } = verifyDirectionConsistency(md, facts);
    expect(corrections).toHaveLength(1);
    expect(corrections[0]!.direction).toBe("E");
    expect(corrections[0]!.wrote).toBe("绝命");
    expect(corrections[0]!.correct).toBe(east.star);
    expect(text).toContain(`东为${east.star}方`);
  });

  it("一致时不改动、不报错", () => {
    const md = `东为${east.star}方，宜久坐。`;
    const { text, corrections } = verifyDirectionConsistency(md, facts);
    expect(corrections).toEqual([]);
    expect(text).toBe(md);
  });

  it("支持「东南是生气位」这类句式", () => {
    const se = facts.directions.find((d) => d.direction === "SE")!;
    const wrong = se.star === "五鬼" ? "天医" : "五鬼";
    const { text, corrections } = verifyDirectionConsistency(`东南是${wrong}位`, facts);
    expect(corrections).toHaveLength(1);
    expect(text).toContain(`东南是${se.star}位`);
  });

  it("方位名不带星名时不误改", () => {
    const md = "东南方向采光好。";
    expect(verifyDirectionConsistency(md, facts).corrections).toEqual([]);
  });

  it("同一行多个方位仍各自独立纠正（单趟组合正则的核心不变量）", () => {
    const south = facts.directions.find((d) => d.direction === "S")!;
    const wrongEast = east.star === "绝命" ? "五鬼" : "绝命";
    const wrongSouth = south.star === "五鬼" ? "绝命" : "五鬼";
    const md = `东为${wrongEast}方，南是${wrongSouth}位。`;
    const { text, corrections } = verifyDirectionConsistency(md, facts);
    expect(corrections).toHaveLength(2);
    expect(corrections.map((c) => c.direction).sort()).toEqual(["E", "S"]);
    expect(text).toContain(`东为${east.star}方`);
    expect(text).toContain(`南是${south.star}位`);
  });
});

// 发现1：prompt.ts 实际诱导的输出格式（列表标注、括号、markdown 表格、加粗……）
// 与旧正则的匹配面严重错位，评审实测 11 条真实句式只命中 2 条。下面逐条锁定
// 扩展后的覆盖范围，覆盖除「星名在前」外评审列出的全部形态。
describe("发现1：扩展方位名与星名之间允许的胶水", () => {
  const se = facts.directions.find((d) => d.direction === "SE")!;
  // 不硬编码具体星名——只要求与 se.star 不同即可，避免测试假设本命卦查表的具体数值。
  const wrong = se.star === "五鬼" ? "天医" : "五鬼";

  const cases: { desc: string; input: string; expectedFragment: string }[] = [
    { desc: "列表标注「东南：绝命」", input: `- 东南：${wrong}，不宜久坐`, expectedFragment: `东南：${se.star}` },
    { desc: "括号标注「东南（绝命）」", input: `东南（${wrong}）`, expectedFragment: `东南（${se.star}）` },
    { desc: "markdown 加粗「**东南**是绝命位」", input: `**东南**是${wrong}位`, expectedFragment: `**东南**是${se.star}位` },
    { desc: "表格行「| 东南 | 绝命 | 凶 |」", input: `| 东南 | ${wrong} | 凶 |`, expectedFragment: `| 东南 | ${se.star} | 凶 |` },
    { desc: "「东南的绝命位」", input: `东南的${wrong}位不宜久坐`, expectedFragment: `东南的${se.star}位` },
    { desc: "「东南属于绝命方」", input: `东南属于${wrong}方`, expectedFragment: `东南属于${se.star}方` },
    { desc: "「东南角是绝命位」", input: `东南角是${wrong}位`, expectedFragment: `东南角是${se.star}位` },
  ];

  for (const c of cases) {
    it(`覆盖句式：${c.desc}`, () => {
      const { text, corrections } = verifyDirectionConsistency(c.input, facts);
      expect(corrections).toHaveLength(1);
      expect(corrections[0]!.direction).toBe("SE");
      expect(corrections[0]!.wrote).toBe(wrong);
      expect(corrections[0]!.correct).toBe(se.star);
      expect(text).toContain(c.expectedFragment);
    });
  }

  it("已知未覆盖：星名在前的倒装句式（如「绝命位落在东南」），本次不要求纠正", () => {
    // 这不是遗漏，是 guard.ts docstring 里显式记录的设计取舍（反向匹配误伤风险高）。
    // 这条测试的作用是把"不覆盖"钉成一个可见的、有意的行为，而不是让它悄悄消失。
    const md = `${wrong}位落在东南`;
    expect(verifyDirectionConsistency(md, facts).corrections).toEqual([]);
  });

  it("新增的「角」后缀 + 新增胶水不会在没有合法星名时误触发", () => {
    const md = "东南角是块风水宝地。"; // 含新后缀「角」与新胶水「是」，但后面不是八个星名之一
    expect(verifyDirectionConsistency(md, facts).corrections).toEqual([]);
  });
});

describe("发现1附带：方位名 alternation 排序（白盒）", () => {
  // 为什么是白盒测试而非黑盒行为测试：guard.ts 的 verifyDirectionConsistency
  // docstring 里记录了变异验证的结论——在当前 8 个方位名 + 8 个星名 + 现有胶水/
  // 后缀词表下，把这个排序方向反过来，跑遍所有黑盒用例都不会失败（回溯会自动
  // 纠正），所以黑盒测试无法证明"长名优先"这条不变量是必要的。但这条不变量本身
  // 是真实存在的设计约束（一旦胶水或星名词表未来扩充到覆盖"北"/"南"，排序方向就
  // 会变得 load-bearing），所以直接测排序函数本身，钉住方向，而不是绕着测行为。
  it("长名必须排在其前缀短名之前", () => {
    const items = [
      { label: "北" }, { label: "东北" }, { label: "东" }, { label: "东南" },
      { label: "南" }, { label: "西南" }, { label: "西" }, { label: "西北" },
    ];
    const sorted = sortLabelsLongestFirst(items).map((i) => i.label);
    expect(sorted.indexOf("东北")).toBeLessThan(sorted.indexOf("东"));
    expect(sorted.indexOf("东南")).toBeLessThan(sorted.indexOf("东"));
    expect(sorted.indexOf("西南")).toBeLessThan(sorted.indexOf("西"));
    expect(sorted.indexOf("西北")).toBeLessThan(sorted.indexOf("西"));
  });

  it("不改动传入的数组（沿用 facts.directions 时不能有原地排序副作用）", () => {
    const items = [{ label: "北" }, { label: "东北" }, { label: "东" }];
    const before = items.map((i) => i.label);
    sortLabelsLongestFirst(items);
    expect(items.map((i) => i.label)).toEqual(before);
  });
});
