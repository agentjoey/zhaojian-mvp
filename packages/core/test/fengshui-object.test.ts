import { describe, it, expect } from "vitest";
import { directionsFor } from "../src/fengshui/eight-mansions";
import { elementDirections } from "../src/fengshui/directions";
import { adviseObject } from "../src/fengshui/object-advisor";

const base = {
  verdicts: directionsFor("坎"),
  affinity: elementDirections({ favorable: ["木", "水"], unfavorable: ["金", "火", "土"], method: "扶抑", note: "" }),
};

describe("EP-fs-04 物件顾问（弱版）", () => {
  // 坎命四吉方 = {SE 生气, E 天医, S 延年, N 伏位}
  it("原木书桌 → 五行木；推荐方位收窄到「木方位 ∩ 四吉方」= 东、东南", () => {
    const a = adviseObject(base, { category: "desk", material: "原木" });
    expect(a.elementOfObject).toBe("木");
    // 断言恰好是交集本身，而非仅「落在四吉方内」——后者在退回分支下同样成立，
    // 删掉交集逻辑也测不出来
    expect(a.recommendedDirections.map((r) => r.direction).sort()).toEqual(["E", "SE"]);
    for (const r of a.recommendedDirections) expect(r.reason).toContain("同气");
  });

  it("交集为空时退回四吉方：金属物件（金主西/西北）对坎命无交集，仍给出吉方建议", () => {
    const a = adviseObject(base, { category: "lamp", material: "金属" });
    expect(a.elementOfObject).toBe("金");
    const dirs = a.recommendedDirections.map((r) => r.direction);
    // 金的方位 W/NW 全是坎命凶方 → 必须退回四吉方，且不得谎称「同气」
    expect(dirs).not.toContain("W");
    expect(dirs).not.toContain("NW");
    expect(dirs.length).toBe(3);
    for (const d of dirs) expect(["N", "S", "E", "SE"]).toContain(d);
    for (const r of a.recommendedDirections) expect(r.reason).not.toContain("同气");
  });

  it("镜子命中「不对床」硬规则", () => {
    const a = adviseObject(base, { category: "mirror" });
    expect(a.categoryRules.join("")).toContain("床");
  });

  it("鱼缸命中「忌卧室」硬规则", () => {
    const a = adviseObject(base, { category: "aquarium" });
    expect(a.categoryRules.join("")).toContain("卧室");
  });

  it("形状可定五行：尖锐→火，圆→金，波浪→水", () => {
    expect(adviseObject(base, { category: "art", shape: "尖锐" }).elementOfObject).toBe("火");
    expect(adviseObject(base, { category: "art", shape: "圆" }).elementOfObject).toBe("金");
    expect(adviseObject(base, { category: "art", shape: "波浪" }).elementOfObject).toBe("水");
  });

  it("材质优先于形状", () => {
    expect(adviseObject(base, { category: "art", material: "金属", shape: "波浪" }).elementOfObject).toBe("金");
  });

  it("五行是否为忌神只影响 personalFit，不改变 avoid 列表", () => {
    const unfav = adviseObject(base, { category: "lamp", material: "金属" }); // 金 = 忌神
    const fav = adviseObject(base, { category: "lamp", material: "原木" }); // 木 = 喜用
    expect(unfav.personalFit).toMatch(/忌|节制|少/);
    expect(fav.personalFit).toMatch(/喜用|放心/);
    // avoid 只由命卦四凶方决定，与物件五行无关；断言两者相同，
    // 比断言「avoid 非空」有意义——后者对任何输入都恒真
    expect(unfav.avoid).toEqual(fav.avoid);
  });

  it("指定 intendedDirection 时给出该方位的判语", () => {
    const a = adviseObject(base, { category: "desk", material: "原木", intendedDirection: "SW" });
    expect(a.intendedVerdict).toBeTruthy();
    expect(a.intendedVerdict!.star).toBe("绝命");
  });

  it("未知材质与形状 → 五行为 null，但仍给出方位建议", () => {
    const a = adviseObject(base, { category: "other" });
    expect(a.elementOfObject).toBeNull();
    expect(a.recommendedDirections.length).toBeGreaterThan(0);
  });
});

describe("EP-fs-18 物件顾问强版（有居所）", () => {
  const dwellingSectors = directionsFor("乾"); // 西四宅：吉方 NW/W/NE/SW

  it("不传 dwellingSectors 时行为与波1 完全一致", () => {
    const weak = adviseObject(base, { category: "desk", material: "原木" });
    const same = adviseObject({ ...base, dwellingSectors: undefined }, { category: "desk", material: "原木" });
    expect(same).toEqual(weak);
    expect(same.dwellingNote).toBeNull();
  });

  /**
   * ⚠️ 这条曾经是恒真断言。原写法用 `directionsFor("坎")` 作宅卦——与坎命同组，
   * 交集是全部 4 个吉方，于是「推荐方位同时是命卦吉方与宅卦吉方」对**弱版**同样成立
   * （弱版返回的 4 个命卦吉方本来就全是宅卦吉方），抓不到「没传 dwellingSectors」这类回归。
   * 末尾还跟着一个 `toBeGreaterThan(0)`，正是本仓库当初放过 `DIRECTIONS.slice(0,4)` 的形状。
   *
   * 真正的结构事实（枚举 8×8 全部命卦×宅卦组合验证过）：命卦吉方 ∩ 宅卦吉方 **只可能是 4 或 0**。
   * 东四命的四吉方恰好就是四个东四方，所以同组则四个全留、异组则一个不留，没有中间情况。
   * 推论：`usable` 恒等于 `good`，**强版与弱版的 recommendedDirections 逐字节相同**，
   * 强版唯一多出来的可观察内容是 `dwellingNote`。下面按这个真实结构分两支断言。
   *
   * 📌 **诚实交代：这两条与本文件既有的邻居完全冗余，重写的价值在注释、不在覆盖。**
   * 实跑变异确认（不是推断）：
   *   - 「`dwellingNote` 无条件返回」→ **3 red**：下面的「同组宅卦」+ 既有的
   *     「dwellingNote 在交集非空时为 null」+ 既有的「不传 dwellingSectors 时行为与波1
   *     完全一致」；
   *   - 「`usable = houseGood`」→ **2 red**：下面的「异组宅卦」+ 既有的
   *     「命宅异组导致交集为空时…」。
   * 那条恒真断言确实存在过，但它留下的洞早已被邻居覆盖。保留这两条，是为了把上面那段
   * 结构事实**写在断言旁边**——「推荐位需同时是命卦吉方与宅卦吉方」这个误解已经被
   * 重新实现过不止一次，注释放在这里比放在报告里更可能被下一个人读到。
   */
  it("同组宅卦：强版与弱版逐字节相同（usable ≡ good），且不出提示", () => {
    const sameGroup = directionsFor("坎"); // 东四宅，与坎命同组
    const q = { category: "desk", material: "原木" } as const;
    const strong = adviseObject({ ...base, dwellingSectors: sameGroup }, q);
    // 精确到「是哪两个方位」，不用 `length > 0`——后者没有失败模式，正是上面注释批评的
    // 那个形状。期望值手推自数据表：木方位 [E, SE] ∩ 坎命四吉方，按吉度排序 → 生气巽(SE)、
    // 天医震(E)。
    expect(strong.recommendedDirections.map((r) => r.direction)).toEqual(["SE", "E"]);
    // 同组下强版 = 弱版，逐字节。它取代了原先「每个推荐位也是宅卦吉方」那句循环断言：
    // 后者在同组夹具下被上一行蕴含（四吉方本来就全是宅卦吉方），删掉照绿。
    expect(strong).toEqual(adviseObject(base, q));
    expect(strong.dwellingNote).toBeNull();
  });

  // 与下面「命宅异组导致交集为空时…」那条冗余（见上面 📌）；两条一起红或一起绿。
  it("异组宅卦：交集为空 → 退回命卦吉方并出提示，而不是给空推荐", () => {
    const crossGroup = directionsFor("乾"); // 西四宅，与坎命（东四）异组
    // 前提校验：这个组合确实交集为空。否则下面「退回」的断言测的就不是退回逻辑。
    const inter = Object.values(base.verdicts).filter(
      (v) => v.auspicious && crossGroup[v.direction].auspicious,
    );
    expect(inter).toHaveLength(0);

    const a = adviseObject({ ...base, dwellingSectors: crossGroup }, { category: "desk", material: "原木" });
    expect(a.recommendedDirections.length).toBeGreaterThan(0); // 不给空数组
    expect(a.dwellingNote).not.toBeNull();
    // 退回的是命卦吉方——它们此时必然**不是**宅卦吉方（交集为空），这一条才是
    // 真正把「退回」与「过滤」区分开的断言：若实现误把 usable 算成 houseGood，推荐会是空的。
    for (const r of a.recommendedDirections) {
      expect(base.verdicts[r.direction].auspicious).toBe(true);
      expect(crossGroup[r.direction].auspicious).toBe(false);
    }
  });

  it("命宅异组导致交集为空时，退回命卦吉方并在 dwellingNote 说明", () => {
    // 坎命(东四) × 乾宅(西四)：四吉方分属两组，交集必空
    const a = adviseObject({ ...base, dwellingSectors: dwellingSectors }, { category: "desk", material: "原木" });
    expect(a.recommendedDirections.length).toBeGreaterThan(0);
    for (const r of a.recommendedDirections) {
      expect(base.verdicts[r.direction].auspicious).toBe(true); // 仍是命卦吉方
    }
    expect(a.dwellingNote).toBeTruthy();
    expect(a.dwellingNote).toMatch(/房子|宅/);
  });

  it("dwellingNote 在交集非空时为 null（没话说就不说）", () => {
    const withHouse = directionsFor("坎");
    expect(adviseObject({ ...base, dwellingSectors: withHouse }, { category: "desk" }).dwellingNote).toBeNull();
  });
});
