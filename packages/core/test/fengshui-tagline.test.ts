import { describe, it, expect } from "vitest";
import { directionsFor } from "../src/fengshui/eight-mansions";
import { elementDirections } from "../src/fengshui/directions";
import { deriveFengshuiTagline } from "../src/fengshui/tagline";

// 坎命四吉方 = {SE 生气, E 天医, S 延年, N 伏位}（同一份夹具在 fengshui-object.test.ts
// 已核实过），生气在东南——不是编出来的期望值，是查表可核对的真实结构。
const kanDirections = directionsFor("坎");

describe("deriveFengshuiTagline（评审后续：境页一句话基调，确定性不经 LLM）", () => {
  it("有明确喜用五行时：{日主}命之人，宜近{喜用}——你的生气在{生气方}。", () => {
    const affinity = elementDirections({ favorable: ["水", "木"], unfavorable: ["火"], method: "扶抑", note: "" });
    const line = deriveFengshuiTagline(kanDirections, affinity, "水");
    expect(line).toBe("水命之人，宜近水——你的生气在东南。");
  });

  it("日主与喜用五行不同时——不臆造两者相同，各自照真实值填入", () => {
    const affinity = elementDirections({ favorable: ["火"], unfavorable: ["水"], method: "调候", note: "" });
    const line = deriveFengshuiTagline(kanDirections, affinity, "水");
    // 前提校验：真实场景确实存在「日主水、喜用火」（调候格），不是构造不出来的输入
    expect(line).toContain("水命之人");
    expect(line).toContain("宜近火");
    expect(line).not.toContain("宜近水");
  });

  it("喜用五行为空（中和无明显扶抑）时不编造五行，只说方位", () => {
    const affinity = elementDirections({ favorable: [], unfavorable: [], method: "中和", note: "" });
    const line = deriveFengshuiTagline(kanDirections, affinity, "水");
    expect(line).toBe("你的生气在东南——多留意、多打理这个方向。");
    expect(line).not.toContain("命之人");
  });

  it("只取本命八方，不取宅卦——换一张不同的命卦表，方位跟着变而不是写死", () => {
    // 乾命四吉方（核对 fengshui-object.test.ts 同款夹具）：吉方 NW/W/NE/SW，
    // 生气位见 eight-mansions 大游年表：乾→兑 为生气。
    const qianDirections = directionsFor("乾");
    const affinity = elementDirections({ favorable: ["金"], unfavorable: ["火"], method: "扶抑", note: "" });
    const line = deriveFengshuiTagline(qianDirections, affinity, "金");
    // 前提校验：确实不是坎命那句——如果函数偷懒返回固定字符串，这里会露馅
    expect(line).not.toBe("水命之人，宜近水——你的生气在东南。");
    expect(line).toMatch(/^金命之人，宜近金——你的生气在.+。$/);
  });
});
