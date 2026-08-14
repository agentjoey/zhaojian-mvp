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
