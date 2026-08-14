import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, computeFengshui } from "@eamvp/core";
import { extractFengshuiFacts } from "./facts";
import { sanitizeFengshui, verifyDirectionConsistency } from "./guard";

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
});
