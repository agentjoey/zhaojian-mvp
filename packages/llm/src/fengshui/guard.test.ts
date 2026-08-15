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
// 「方位名在前」这一向的覆盖范围（「星名在前」那一向见后面的双向匹配用例组）。
describe("发现1：扩展方位名与星名之间允许的胶水（方位名在前）", () => {
  const se = facts.directions.find((d) => d.direction === "SE")!;
  // 不硬编码具体星名——只要求与 se.star 不同即可，避免测试假设本命卦查表的具体数值。
  const wrong = se.star === "五鬼" ? "天医" : "五鬼";

  const cases: { desc: string; input: string; expectedFragment: string }[] = [
    { desc: "「东南是绝命位」", input: `东南是${wrong}位`, expectedFragment: `东南是${se.star}位` },
    { desc: "「东南方为绝命」", input: `东南方为${wrong}`, expectedFragment: `东南方为${se.star}` },
    { desc: "列表标注「东南：绝命」", input: `- 东南：${wrong}，不宜久坐`, expectedFragment: `东南：${se.star}` },
    { desc: "括号标注「东南（绝命）」", input: `东南（${wrong}）`, expectedFragment: `东南（${se.star}）` },
    { desc: "markdown 加粗「**东南**是绝命位」", input: `**东南**是${wrong}位`, expectedFragment: `**东南**是${se.star}位` },
    { desc: "表格行「| 东南 | 绝命 | 凶 |」", input: `| 东南 | ${wrong} | 凶 |`, expectedFragment: `| 东南 | ${se.star} | 凶 |` },
    { desc: "「东南的绝命位」", input: `东南的${wrong}位不宜久坐`, expectedFragment: `东南的${se.star}位` },
    { desc: "「东南属于绝命方」", input: `东南属于${wrong}方`, expectedFragment: `东南属于${se.star}方` },
    { desc: "「东南角是绝命位」", input: `东南角是${wrong}位`, expectedFragment: `东南角是${se.star}位` },
    // Minor：星名被加粗时旧版漏检（`*` 只允许在方位名两侧），而
    // 「- **东南**：**生气**（吉）」是很自然的 markdown 排版。
    { desc: "星名加粗「- **东南**：**绝命**（凶）」", input: `- **东南**：**${wrong}**（凶）`, expectedFragment: `**东南**：**${se.star}**` },
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

  it("新增的「角」后缀 + 新增胶水不会在没有合法星名时误触发", () => {
    const md = "东南角是块风水宝地。"; // 含新后缀「角」与新胶水「是」，但后面不是八个星名之一
    expect(verifyDirectionConsistency(md, facts).corrections).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EP-fs-06b 回归：方向性误配（闸门把正确输出改成了错误输出）
//
// 上一轮为扩大匹配面，把分句标点「、，,」与 `\s`（含换行）放进 GLUE 且允许重复 6 次，
// 正则开始跨分句、跨行地把「前一句的方位名」与「后一句的星名」配成一对——而
// 「星名在前」（生气方在东南）恰恰是八宅最常见的中文语序，此前被当成「刻意不覆盖的
// 良性缺口」，实际上不是不覆盖，是被系统性误配。一份逐条符合查表的正确输出会被
// 改坏、并记下 8 条伪 correction。
//
// 为什么旧的负向用例没拦住：「东南方向采光好。」「东南角是块风水宝地。」都不含任何
// 星名，胶水放宽到多离谱都必然通过——零判别力。下面这组一律「含星名 + 相邻另一个
// 方位或分句」，胶水一旦重新放宽就会立刻变红。
// ─────────────────────────────────────────────────────────────────────────────
describe("EP-fs-06b 回归：含星名的负向语料（判别力用例）", () => {
  it("前置：本组字面量假定 1990 男 = 坎1 的查表值", () => {
    const table = Object.fromEntries(facts.directions.map((d) => [d.label, d.star]));
    expect(table).toEqual({
      东南: "生气", 东: "天医", 南: "延年", 北: "伏位",
      西南: "绝命", 东北: "五鬼", 西北: "六煞", 西: "祸害",
    });
  });

  const clean: { desc: string; md: string }[] = [
    {
      desc: "四吉方三分节（星名在前 ×4，逗号分句，前置枚举以冒号收尾）",
      md: "四吉方为东南、东、南、北：生气位在东南，天医位在东，延年位在南，伏位在北。",
    },
    {
      desc: "四凶方三分节（枚举末项「西：」紧邻下一句的星名——最刁钻的跨分句诱饵）",
      md: "四凶方为西南、东北、西北、西：绝命方在西南，五鬼方在东北，六煞方在西北，祸害方在西。",
    },
    {
      desc: "方位在前的分句 + 不带方位的星名短语（逗号跨句）",
      md: "客厅在东南，绝命方的储物柜可以挪走（传统象征）。",
    },
    { desc: "两个正确的星名在前语序相邻", md: "伏位在北，生气在东南。" },
    { desc: "两个凶星的星名在前语序相邻", md: "绝命方在西南，五鬼方在东北。" },
    { desc: "跨行：上一行结尾方位名 + 下一行开头星名", md: "你的吉方是东南\n绝命方在西南，可作储物。" },
    { desc: "跨空行：markdown 小节标题 + 空行 + 星名", md: "## 东南\n\n绝命位，久待紧绷。" },
    { desc: "方位名不带星名（旧用例，保留）", md: "东南方向采光好。" },
    { desc: "「角」后缀不带星名（旧用例，保留）", md: "东南角是块风水宝地。" },
    { desc: "句号分隔的方位名与星名", md: "东南。生气是一种状态。" },
    { desc: "加粗排版且完全符合查表", md: "- **东南**：**生气**（吉）\n- **西南**：**绝命**（凶）" },
    { desc: "表格且完全符合查表", md: "| 东南 | 生气 | 吉 |\n| 西南 | 绝命 | 凶 |" },
    { desc: "命卦术语「东四命」不得被当成方位名「东」配对", md: "生气方是东四命的最吉方位。" },
  ];

  for (const c of clean) {
    it(`必须零改动：${c.desc}`, () => {
      const { text, corrections } = verifyDirectionConsistency(c.md, facts);
      expect(corrections).toEqual([]);
      expect(text).toBe(c.md);
    });
  }
});

// 双向匹配：把「星名在前」这个中文最常见语序纳入覆盖。锚点始终是**方位名**
// （查表的 key），被改写的始终是星名。
describe("EP-fs-06b 双向匹配：星名在前的语序", () => {
  const cases: { desc: string; input: string; expected: string; dir: string; wrote: string; correct: string }[] = [
    { desc: "「五鬼位落在东南」", input: "五鬼位落在东南", expected: "生气位落在东南", dir: "SE", wrote: "五鬼", correct: "生气" },
    { desc: "「绝命方在东」", input: "绝命方在东，不宜久坐", expected: "天医方在东，不宜久坐", dir: "E", wrote: "绝命", correct: "天医" },
    { desc: "「六煞位于南」", input: "六煞位于南", expected: "延年位于南", dir: "S", wrote: "六煞", correct: "延年" },
    { desc: "「生气方为西南」", input: "生气方为西南", expected: "绝命方为西南", dir: "SW", wrote: "生气", correct: "绝命" },
    { desc: "加粗「**五鬼**在东南」", input: "**五鬼**在东南", expected: "**生气**在东南", dir: "SE", wrote: "五鬼", correct: "生气" },
  ];

  for (const c of cases) {
    it(`覆盖并纠正：${c.desc}`, () => {
      const { text, corrections } = verifyDirectionConsistency(c.input, facts);
      expect(corrections).toHaveLength(1);
      expect(corrections[0]!.direction).toBe(c.dir);
      expect(corrections[0]!.wrote).toBe(c.wrote);
      expect(corrections[0]!.correct).toBe(c.correct);
      expect(text).toBe(c.expected);
    });
  }

  it("纠正成「伏位」时不拼出「伏位位」（后缀去重）", () => {
    expect(verifyDirectionConsistency("五鬼位在北", facts).text).toBe("伏位在北");
    expect(verifyDirectionConsistency("北是绝命位", facts).text).toBe("北是伏位");
  });

  it("跨分句/跨行不配对（星名在前的方向同样不许越界）", () => {
    for (const md of ["绝命方，在西南", "五鬼位\n在东南"]) {
      expect(verifyDirectionConsistency(md, facts).corrections).toEqual([]);
    }
  });
});

// 整篇对拍：单句用例只能证明「这一句不误伤」，证明不了「一整篇正确输出零改动」——
// 而回归正是在整篇语料上暴露的（8 条伪 correction、3 行正确文字被改坏）。
// 这条按 prompt.ts 的三分节格式造一份逐条符合查表的正确输出，要求 byte 级零改动；
// 再逐处注入错误星名，要求全部被抓回并**还原成同一份正确文档**。
describe("EP-fs-06b 整篇三分节输出对拍", () => {
  const CORRECT_DOC = `## 形势

你的本命卦是坎1，属东四命。八方判语按查表如下：四吉方为东南、东、南、北——生气位在东南，天医位在东，延年位在南，伏位在北。四凶方为西南、东北、西北、西：绝命方在西南，五鬼方在东北，六煞方在西北，祸害方在西。

| 方位 | 星 | 吉凶 |
| --- | --- | --- |
| 东南 | 生气 | 吉 |
| 东 | 天医 | 吉 |
| 西南 | 绝命 | 凶 |
| 西 | 祸害 | 凶 |

## 境与你

- **东南**：**生气**（吉）。久待更容易松弛。
- **西南**：**绝命**（凶）。久待更容易紧绷。
东南是生气位，白天光线足；东南角适合放书桌。北是伏位，安静。
西属于祸害方，西北角的六煞位不宜久坐。
天医方在东，早晨可在这里喝杯茶。

## 可做的事

1. 客厅在东南，绝命方的储物柜可以挪走（传统象征）。
2. 把书桌挪到东南（生气方），面朝东南。
3. 五鬼位落在东北，那里少堆杂物。
4. 六煞方在西北，可作储物。
5. 你是东四命，东四命的四吉方为东南、东、南、北。

以上是关于自我觉察与居住体验的建议，不构成专业意见。
`;

  it("逐条符合查表的正确输出：零 correction、零改动", () => {
    const { text, corrections } = verifyDirectionConsistency(CORRECT_DOC, facts);
    expect(corrections).toEqual([]);
    expect(text).toBe(CORRECT_DOC);
  });

  it("逐处注入错误星名：全部抓回并还原成同一份正确文档", () => {
    const injected: [string, string][] = [
      ["生气位在东南", "五鬼位在东南"],           // ② 星名在前
      ["天医位在东", "绝命位在东"],               // ② 星名在前，短方位名
      ["绝命方在西南", "生气方在西南"],           // ② 前面紧邻「西：」的诱饵位置
      ["东南是生气位", "东南是绝命位"],           // ① 方位名在前
      ["西属于祸害方", "西属于生气方"],           // ① 属于
      ["天医方在东，早晨", "六煞方在东，早晨"],   // ② 行首
      ["| 东南 | 生气 | 吉 |", "| 东南 | 六煞 | 吉 |"], // ① 表格
    ];
    let wrong = CORRECT_DOC;
    for (const [ok, bad] of injected) wrong = wrong.replace(ok, bad);
    expect(wrong).not.toBe(CORRECT_DOC);

    const { text, corrections } = verifyDirectionConsistency(wrong, facts);
    expect(corrections).toHaveLength(injected.length);
    expect(text).toBe(CORRECT_DOC);
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

// ─────────────────────────────────────────────────────────────────────────────
// Task 10 复审必修1：分支②（星名在前）没有左边界条件，会把「星名枚举」的尾巴
// 与紧随其后的「方位枚举」的头配成一对——三句原文都逐条符合查表、完全正确，
// 但当前实现会把枚举末尾那个星名（它其实仍属于前一个枚举，只是恰好挨着后面的
// 「位于/在」+ 方位枚举）错配给方位枚举的第一项，改出一条伪 correction。
// 例：「生气、天医、延年、伏位位于东南、东、南、北。」——「伏位」是星名枚举的
// 第 4 项（本就正确），但它紧邻「位于东南」，分支②会把「伏位」当成「东南」的
// 星，而 SE 桌值是「生气」≠「伏位」，于是被错误纠正成「生气」，把枚举第 4 项的
// 「伏位」吃掉、篡改成「生气」。
// 修法：分支②的星名前加否定回顾 `(?<!、)`——枚举项之间必然由顿号分隔，星名前一
// 个字符是顿号，说明它是「枚举的下一项」而非「独立语句的主语」，不应被②认领。
// ─────────────────────────────────────────────────────────────────────────────
describe("Task10 复审必修1：分支②缺左边界，误吃星名枚举尾巴（回归）", () => {
  it("前置：本组字面量假定 1990 男 = 坎1 的查表值（与前面 EP-fs-06b 用例组一致）", () => {
    const table = Object.fromEntries(facts.directions.map((d) => [d.label, d.star]));
    expect(table).toEqual({
      东南: "生气", 东: "天医", 南: "延年", 北: "伏位",
      西南: "绝命", 东北: "五鬼", 西北: "六煞", 西: "祸害",
    });
  });

  const cases: { desc: string; md: string }[] = [
    {
      desc: "凶星四星枚举 + 方位四枚举（尾星「祸害」不得被误配给头方位「西南」）",
      md: "凶星绝命、五鬼、六煞、祸害位于西南、东北、西北、西。",
    },
    {
      desc: "吉星四星枚举 + 方位四枚举（尾星「伏位」不得被误配给头方位「东南」）",
      md: "生气、天医、延年、伏位位于东南、东、南、北。",
    },
    {
      desc: "「四吉星…在…四个方位」句式（尾星「伏位」不得被误配给头方位「东南」）",
      md: "四吉星生气、天医、延年、伏位在东南、东、南、北四个方位。",
    },
  ];

  for (const c of cases) {
    it(`必须零改动：${c.desc}`, () => {
      const { text, corrections } = verifyDirectionConsistency(c.md, facts);
      expect(corrections).toEqual([]);
      expect(text).toBe(c.md);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 10 复审必修2：LOCATIVE 收窄（只认「落在/位于/在/为/是」，不认空白）是
// 承重不变式，但此前只靠注释守着、没有测试。这条钉住上一轮报告里作为收窄理由的
// 反例：「东南：绝命 北：伏位」——「绝命」与「北」只隔一个空格、没有方位动词，
// 若 LOCATIVE 放宽到接受空白，分支②会把「绝命 北」错配成一对（当「绝命」是
// 「北」的星），而 N 桌值是「伏位」≠「绝命」，于是把「北：伏位」也篡改掉。
// 正确行为：只改「东南：绝命」→「东南：生气」（① 命中），「北：伏位」原样保留。
// ─────────────────────────────────────────────────────────────────────────────
describe("Task10 复审必修2：LOCATIVE 收窄的回归守护（无方位动词的相邻方位不得配对）", () => {
  it("「东南：绝命 北：伏位」只改绝命→生气，不把「绝命」错配给相邻的「北」", () => {
    const { text, corrections } = verifyDirectionConsistency("东南：绝命 北：伏位", facts);
    expect(corrections).toHaveLength(1);
    expect(corrections[0]!.direction).toBe("SE");
    expect(corrections[0]!.wrote).toBe("绝命");
    expect(corrections[0]!.correct).toBe("生气");
    expect(text).toBe("东南：生气 北：伏位");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 10 复审必修3：单字方位名（东/南/西/北）没有左边界条件，「东西」「广东」
// 「坐东」这类词里的裸字会被分支①当成方位名前半截，再和后面偶然出现的星名硬凑。
// 实测：给分支①的单字方位名加否定回顾 `(?<![一-龥])`（前面不得紧邻汉字）后，
// 对全部既有用例（含「回归项」要求的全部必须命中句式）做穷举验证零回归——原因是
// 这三类误伤命中的锚字都紧邻真实汉字（「这东西」的「西」前是「东」、「广东」的
// 「东」前是「广」、「坐东」的「东」前是「坐」），而所有「必须命中」的分支①用例
// 锚点全部是双字方位名（东南/西南/东北/西北，不受此回顾影响）；分支①仅有的几个
// 单字方位名黑盒用例（「东为绝命方」「东为…方，南是…位」）里，单字方位名要么在
// 字符串开头（前面没有字符，回顾天然通过）要么紧邻的是顿号/逗号等标点（不在
// `[一-龥]` 范围内，回顾同样通过），因此已采用该回顾（详见 guard.ts `aDirAlt`）。
// 分支②不受影响：②的方位名紧跟在「在/落在/位于/为/是」等汉字动词后面是常态
// （如「延年位在南」），回顾只加在①，未触碰②。
// ─────────────────────────────────────────────────────────────────────────────
describe("Task10 复审必修3：单字方位名缺左边界导致的误伤（东西/广东/坐东，已采用回顾修复）", () => {
  const cases: { desc: string; md: string }[] = [
    { desc: "「这东西的生气很足」不得把「西」判成方位名（前一字「东」是汉字）", md: "这东西的生气很足。" },
    { desc: "「广东生气勃勃」不得把「东」判成方位名（前一字「广」是汉字）", md: "广东生气勃勃" },
    { desc: "「坐东延年益寿」不得把「东」判成方位名（前一字「坐」是汉字）", md: "坐东延年益寿" },
  ];

  for (const c of cases) {
    it(`必须零改动：${c.desc}`, () => {
      const { text, corrections } = verifyDirectionConsistency(c.md, facts);
      expect(corrections).toEqual([]);
      expect(text).toBe(c.md);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 10 顺带修：GLUE_MAX 从 6 收到 3 曾经没有实测依据。对齐填充的 markdown
// 表格（列宽用多个空格补齐，而非固定单空格）比「| 东南 | 绝命 |」多出的空格会
// 把方位名与星名之间的胶水单元数推到 4（空格+空格+竖线+空格），GLUE_MAX=3 接不住。
// ─────────────────────────────────────────────────────────────────────────────
describe("Task10 顺带修：GLUE_MAX 覆盖对齐填充的 markdown 表格", () => {
  it("覆盖对齐填充表格「| 东南  | 绝命 | 凶 |」（两个空格，胶水单元数=4）", () => {
    const { text, corrections } = verifyDirectionConsistency("| 东南  | 绝命 | 凶 |", facts);
    expect(corrections).toHaveLength(1);
    expect(corrections[0]!.direction).toBe("SE");
    expect(corrections[0]!.wrote).toBe("绝命");
    expect(corrections[0]!.correct).toBe("生气");
    expect(text).toBe("| 东南  | 生气 | 凶 |");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 最终评审 C1：这道校验器此前只认识命卦表（`facts.directions`），
// `facts.dwelling.sectors` 一次都没被查过——于是 Layer 1 下模型**正确**复述房屋
// 八方，会被按命卦表「纠正」成一句对两套都假的话，degraded 翻真、叙述被扣下、
// 且不写缓存（每次加载都是一次必然再次 degraded 的全新 LLM 调用）。
//
// 下面这组的判别力来自 fixture 本身：坎命 × 离宅，八个方位**逐格不同**（见前置
// 用例）。因此每一条「按哪张表判」的断言，换成另一张表都会立刻变红。
// ─────────────────────────────────────────────────────────────────────────────
const DWELLING_N = { id: "d1", name: "家", kind: "home" as const, tenancy: "rent" as const, facing: "N" as const };
/** 向北 → 坐南 → 离宅；命主仍是 1990 男 = 坎1。异组（东四命 × 东四宅里的离宅同为东四，但八方判语逐格不同）。 */
const l1 = extractFengshuiFacts(
  computeFengshui({ birth, chart: computeUnifiedChart(birth), dwelling: DWELLING_N }),
);

describe("最终评审 C1：房屋八方（宅卦表）纳入方位一致性校验", () => {
  const selfTable = Object.fromEntries(l1.directions.map((d) => [d.label, d.star]));
  const houseTable = Object.fromEntries(l1.dwelling!.sectors.map((d) => [d.label, d.star]));

  it("前置：坎命表与离宅表逐格不同——本组用例的判别力全部依赖这一点", () => {
    expect(l1.layer).toBe(1);
    expect(l1.mingGua).toContain("坎");
    expect(l1.dwelling!.guaName).toBe("离");
    expect(selfTable).toEqual({
      东南: "生气", 东: "天医", 南: "延年", 北: "伏位",
      西南: "绝命", 东北: "五鬼", 西北: "六煞", 西: "祸害",
    });
    expect(houseTable).toEqual({
      东: "生气", 东南: "天医", 北: "延年", 南: "伏位",
      西北: "绝命", 西: "五鬼", 西南: "六煞", 东北: "祸害",
    });
    for (const label of Object.keys(selfTable)) {
      expect(houseTable[label]).not.toBe(selfTable[label]);
    }
  });

  // ★ 本缺陷的原始场景（评审实跑得到的那两行）
  it("原始缺陷：模型正确地说「房屋八方来看，东是生气位」→ 零 correction、文本零改动", () => {
    const md = "房屋八方来看，东是生气位。";
    const { text, corrections } = verifyDirectionConsistency(md, l1);
    expect(corrections).toEqual([]);
    expect(text).toBe(md);
  });

  it("原始缺陷（含化解原文那半句：两个正则分支各命中一次，仍零改动）", () => {
    const md = "房屋八方来看，东是生气位。把久待的活动放到那一块（传统依据：离宅的生气位在东）。";
    const { text, corrections } = verifyDirectionConsistency(md, l1);
    expect(corrections).toEqual([]);
    expect(text).toBe(md);
  });

  it("房屋八方说错时纠回**宅卦表**的值，而不是命卦表的值", () => {
    const { text, corrections } = verifyDirectionConsistency("房屋八方来看，东是五鬼位。", l1);
    expect(corrections).toHaveLength(1);
    expect(corrections[0]!.direction).toBe("E");
    expect(corrections[0]!.wrote).toBe("五鬼");
    expect(corrections[0]!.correct).toBe("生气"); // 离宅
    expect(corrections[0]!.correct).not.toBe("天医"); // 坎命——绝不能拿它来判房屋
    expect(text).toBe("房屋八方来看，东是生气位。");
  });

  it("本命八方在 Layer 1 下仍按命卦表校验（居所层没有削弱它）", () => {
    const { text, corrections } = verifyDirectionConsistency("本命八方来看，东是生气位。", l1);
    expect(corrections).toHaveLength(1);
    expect(corrections[0]!.correct).toBe("天医"); // 坎命
    expect(text).toBe("本命八方来看，东是天医位。");
  });

  it("同一句里两套对照、各自都对 → 零改动（分句级归属）", () => {
    const md = "本命八方：东是天医位，房屋八方：东是生气位。";
    const { text, corrections } = verifyDirectionConsistency(md, l1);
    expect(corrections).toEqual([]);
    expect(text).toBe(md);
  });

  it("同一句里两套各自说错 → 同一个「东」被朝相反方向纠回各自表的值", () => {
    const { text, corrections } = verifyDirectionConsistency(
      "本命八方：东是生气位，房屋八方：东是天医位。", l1);
    expect(corrections.map((c) => c.correct)).toEqual(["天医", "生气"]);
    expect(text).toBe("本命八方：东是天医位，房屋八方：东是生气位。");
  });

  it("归属不明且两表判语不同 → 弃权：哪张表都不拿来判，不改写也不记 correction", () => {
    const md = "东是六煞位。"; // 命卦表=天医、宅卦表=生气，六煞两边都不是
    const { text, corrections } = verifyDirectionConsistency(md, l1);
    expect(corrections).toEqual([]);
    expect(text).toBe(md);
  });

  it("窗口里两套标记同时出现 → 说不清归属，同样弃权", () => {
    const md = "本命八方与房屋八方在这里的判语不同，东是六煞位。";
    const { text, corrections } = verifyDirectionConsistency(md, l1);
    expect(corrections).toEqual([]);
    expect(text).toBe(md);
  });

  it("列表行继承所在块的唯一归属：整块正确时零改动", () => {
    const md = "房屋八方判语如下：\n- 东：生气（吉）\n- 东南：天医（吉）\n- 北：延年（吉）\n- 西：五鬼（凶）";
    const { text, corrections } = verifyDirectionConsistency(md, l1);
    expect(corrections).toEqual([]);
    expect(text).toBe(md);
  });

  it("列表行继承所在块的唯一归属：行里说错时按宅卦表纠回（证明继承真的发生了，而非一律弃权）", () => {
    // 注入的错值「天医」恰是**命卦表**里东的值：只有真的查了宅卦表才抓得到。
    const { text, corrections } = verifyDirectionConsistency(
      "房屋八方判语如下：\n- 东：天医（吉）", l1);
    expect(corrections).toHaveLength(1);
    expect(corrections[0]!.direction).toBe("E");
    expect(corrections[0]!.correct).toBe("生气");
    expect(text).toBe("房屋八方判语如下：\n- 东：生气（吉）");
  });

  it("散文不跨行继承归属：上一行讲房屋，下一行没标记的散文句仍弃权", () => {
    // 「东南是生气位」对本命为真、对房屋为假；跨行继承会把这句真话改成假话。
    const md = "房屋八方来看，东是生气位。\n东南是生气位。";
    const { text, corrections } = verifyDirectionConsistency(md, l1);
    expect(corrections).toEqual([]);
    expect(text).toBe(md);
  });

  it("方位名嵌套在宅卦表这条新路径上同样成立（东北 / 北 各查各的格）", () => {
    for (const md of ["房屋八方来看，东北是祸害位。", "房屋八方来看，北是延年位。"]) {
      expect(verifyDirectionConsistency(md, l1).corrections).toEqual([]);
    }
    const { text, corrections } = verifyDirectionConsistency("房屋八方来看，东北是五鬼位。", l1);
    expect(corrections).toHaveLength(1);
    expect(corrections[0]!.direction).toBe("NE"); // 不是 E、不是 N
    expect(corrections[0]!.correct).toBe("祸害"); // 离宅东北；坎命东北才是五鬼
    expect(text).toBe("房屋八方来看，东北是祸害位。");
  });
});

describe("最终评审 C1：命卦 == 宅卦时两表逐格相同，归属不明也照判", () => {
  // 向南 → 坐北 → 坎宅，与坎1 命主同卦：八格全同，判语与归属无关。
  const same = extractFengshuiFacts(computeFengshui({
    birth, chart: computeUnifiedChart(birth),
    dwelling: { ...DWELLING_N, facing: "S" as const },
  }));

  it("前置：两表逐格相同", () => {
    expect(same.dwelling!.guaName).toBe("坎");
    for (const d of same.directions) {
      expect(same.dwelling!.sectors.find((s) => s.direction === d.direction)!.star).toBe(d.star);
    }
  });

  it("没有归属标记也照常纠正——结论对两套都成立，不构成互推", () => {
    const { text, corrections } = verifyDirectionConsistency("东是绝命位。", same);
    expect(corrections).toHaveLength(1);
    expect(corrections[0]!.correct).toBe("天医");
    expect(text).toBe("东是天医位。");
  });

  it("没有归属标记且说对时零改动", () => {
    const md = "东是天医位。";
    expect(verifyDirectionConsistency(md, same)).toEqual({ text: md, corrections: [] });
  });
});

// 整篇对拍（Layer 1 版）：单句用例只能证明「这一句不误伤」。这份文档按 prompt.ts
// 的三分节格式同时铺开两套判语，逐条符合各自的查表，要求 byte 级零改动；再逐处注入
// **另一套表里的那个星名**（最刁钻的注入：只有查对了表才抓得到），要求全部被抓回
// 并还原成同一份正确文档。
describe("最终评审 C1：Layer 1 整篇三分节输出对拍（两套判语同篇）", () => {
  const CORRECT_DOC = `## 形势

本命八方来看：生气位在东南，天医位在东，延年位在南，伏位在北，绝命方在西南，五鬼方在东北，六煞方在西北，祸害方在西。

这套房子坐南向北，是离宅。房屋八方判语如下：
- 东：生气（吉）
- 东南：天医（吉）
- 北：延年（吉）
- 南：伏位（吉）
- 西北：绝命（凶）
- 西：五鬼（凶）
- 西南：六煞（凶）
- 东北：祸害（凶）

## 境与你

本命八方里东南是生气位，久待更容易松弛；房屋八方里东南是天医位，同样是吉方。
离宅的生气位在东，早晨可以在这里喝杯茶。

## 可做的事

1. 把每天久待的活动放到那一块——房屋八方来看，东是生气位。
2. 本命八方来看，西北是六煞方，可作储物。
3. 你是东四命，这套房子是东四宅，两套判语仍要分开看。

以上是关于自我觉察与居住体验的建议，不构成专业意见。
`;

  it("两套判语逐条符合各自查表的正确输出：零 correction、零改动", () => {
    const { text, corrections } = verifyDirectionConsistency(CORRECT_DOC, l1);
    expect(corrections).toEqual([]);
    expect(text).toBe(CORRECT_DOC);
  });

  // 八个朝向扫一遍（= 八种宅卦），把「过度纠正」这个历史失败模式钉在整个居所维度上，
  // 而不只是 fixture 那一种宅卦。文档由查表现算，不含手写字面量。
  describe("八种宅卦全扫：两套都写对时零 correction；注入另一套的值时按宅卦表抓回", () => {
    const docFor = (f: typeof l1) => {
      const at = (rows: typeof f.directions, star: string) => rows.find((r) => r.star === star)!.label;
      const p = f.directions, h = f.dwelling!.sectors;
      return `## 形势

本命八方来看：生气位在${at(p, "生气")}，天医位在${at(p, "天医")}，延年位在${at(p, "延年")}，伏位在${at(p, "伏位")}，绝命方在${at(p, "绝命")}，五鬼方在${at(p, "五鬼")}，六煞方在${at(p, "六煞")}，祸害方在${at(p, "祸害")}。

这套房子是${f.dwelling!.guaName}宅。房屋八方判语如下：
${h.map((d) => `- ${d.label}：${d.star}（${d.auspicious ? "吉" : "凶"}）`).join("\n")}

## 境与你

本命八方：东是${p.find((d) => d.direction === "E")!.star}位，房屋八方：东是${h.find((d) => d.direction === "E")!.star}位。
${f.dwelling!.guaName}宅的生气位在${at(h, "生气")}，早晨可以在这里喝杯茶。

## 可做的事

1. 房屋八方来看，${at(h, "生气")}是生气位，把久待的活动放到那一块。
2. 本命八方来看，${at(p, "六煞")}是六煞方，可作储物。
`;
    };

    for (const facing of ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const) {
      const f = extractFengshuiFacts(computeFengshui({
        birth, chart: computeUnifiedChart(birth), dwelling: { ...DWELLING_N, facing },
      }));
      const gua = f.dwelling!.guaName;
      const pE = f.directions.find((d) => d.direction === "E")!.star;
      const hE = f.dwelling!.sectors.find((d) => d.direction === "E")!.star;

      it(`向${f.dwelling!.facingLabel} → ${gua}宅：两套都写对 → 零 correction、零改动`, () => {
        const md = docFor(f);
        const { text, corrections } = verifyDirectionConsistency(md, f);
        expect(corrections).toEqual([]);
        expect(text).toBe(md);
      });

      // 对角线（宅卦 == 命卦）两表逐格相同，注入无从构造，跳过。
      if (pE === hE) continue;
      it(`向${f.dwelling!.facingLabel} → ${gua}宅：宅列表行注入命卦表的「${pE}」→ 按宅卦表抓回「${hE}」`, () => {
        const md = docFor(f);
        const bad = md.replace(`- 东：${hE}（`, `- 东：${pE}（`);
        expect(bad).not.toBe(md);
        const { text, corrections } = verifyDirectionConsistency(bad, f);
        expect(corrections).toHaveLength(1);
        expect(corrections[0]!.correct).toBe(hE);
        expect(text).toBe(md);
      });
    }
  });

  it("逐处注入「另一套表里的星名」：全部抓回并还原成同一份正确文档", () => {
    const injected: [string, string][] = [
      ["天医位在东", "生气位在东"],                 // 本命句注入宅卦表的值
      ["- 东：生气（吉）", "- 东：天医（吉）"],       // 宅列表行注入命卦表的值
      ["离宅的生气位在东", "离宅的天医位在东"],       // 宅散文句注入命卦表的值
      ["本命八方里东南是生气位", "本命八方里东南是天医位"], // 本命句注入宅卦表的值
      ["房屋八方里东南是天医位", "房屋八方里东南是生气位"], // 宅句注入命卦表的值
      ["西北是六煞方", "西北是绝命方"],             // 本命句注入宅卦表的值
    ];
    let wrong = CORRECT_DOC;
    for (const [ok, bad] of injected) {
      expect(wrong).toContain(ok);
      wrong = wrong.replace(ok, bad);
    }
    expect(wrong).not.toBe(CORRECT_DOC);

    const { text, corrections } = verifyDirectionConsistency(wrong, l1);
    expect(corrections).toHaveLength(injected.length);
    expect(text).toBe(CORRECT_DOC);
  });
});
