# 风水「境」波 1 · Layer 0 本命方位 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在零新用户输入的前提下，从已有出生数据派生「本命方位」风水报告与物件顾问，作为命·运·境第三条线的探针版本。

**Architecture:** 风水是**派生层**而非第四个排盘引擎——全部输入来自已有 `UnifiedChart` + `BirthInput`，用纯函数在 `packages/core/src/fengshui/` 计算命卦、八宅八方吉凶、用神方位与化解建议；`packages/llm/src/fengshui/` 只负责把确定性结果说成人话，并受守护栏与两道后置校验约束；`apps/web/app/fengshui/` 呈现八方位盘图与物件顾问。**确定性骨架独立于 LLM**，LLM 失败时页面仍完整可用。

**Tech Stack:** TypeScript · Zod · vitest（core/llm/web 均已就绪）· Next.js 16 App Router · React 19 · Tailwind 4

**Spec:** `docs/superpowers/specs/2026-08-14-fengshui-environment-design.md`（本计划覆盖 §14 波 1，即 EP-fs-01 ~ EP-fs-08；波 2 另出计划）

## Global Constraints

- **Flag 门控**：全部 web 入口受 `NEXT_PUBLIC_FENGSHUI_ENABLED === "1"` 控制，默认关闭；关闭时导航无「境」且 `/fengshui` 不可达。照搬 `NEXT_PUBLIC_SPIRIT_ENABLED` 的既有做法。
- **不改冻结命盘**：不修改 `UnifiedChart`、`packages/core/src/types/chart.ts`、任何数据库表。波 1 **无数据库迁移**。
- **派生层纯函数**：`packages/core/src/fengshui/**` 全部为纯函数，无 I/O、无随机、无当前时间依赖，可按输入缓存。
- **排盘不许 LLM 算**：方位吉凶一律来自 `EIGHT_MANSIONS` 查表，LLM 只解释；见后置校验 Task 10。
- **诚实标注**：`Remedy.evidence` 取值 `'双重支撑' | '传统象征'`；`'传统象征'` 条目的 `modern` 必须为 `null`，且 **prompt 硬规则 + `sanitizeFengshui` 双重禁止**为其配上科学措辞。
- **非决定论**：禁断祸福（「必漏财」「会生病」）、禁医疗/财务/法律建议、强制免责。措辞反思性、成长导向。
- **i18n**：新增文案同时写入 `apps/web/lib/i18n/messages/zh.ts` 与 `en.ts`，顶层命名空间 `fengshui`，两文件键结构必须一致；命理专名（生气/天医/绝命等）保留中文。
- **报告缓存**：波 1 **无服务端持久化**（`fengshui_reports` 表属波 2 的 EP-fs-11）。报告按 `(profileId, FENGSHUI_ENGINE_VERSION, locale)` 存 localStorage，与既有 `polishDailyFortune` 的缓存做法一致。
- **测试命令**：core `pnpm --filter @eamvp/core test`；llm `pnpm --filter @eamvp/llm test`；web `pnpm --filter @eamvp/web test`；全量类型 `pnpm typecheck`。

## File Structure

**新建 — `packages/core/src/fengshui/`**

| 文件 | 职责 |
|---|---|
| `directions.ts` | `Direction` 类型、八方位常量与中文名、对宫、卦↔方位、五行↔方位/色/材、`elementDirections()` |
| `ming-gua.ts` | 立春年反推 + `deriveMingGua()` |
| `eight-mansions.ts` | 8×8 游年常量表 + `directionsFor()` |
| `env-psych.ts` | `ENV_PSYCH_ANCHORS` + `FENGSHUI_GUARDRAILS`（镜像 `synthesis/east-west-map.ts` 的双导出体例） |
| `remedy.ts` | `Remedy` 类型 + `buildPersonalRemedies()` + `sortRemedies()` |
| `object-advisor.ts` | `adviseObject()` 弱版 + 品类硬规则 + 材质/形状→五行 |
| `index.ts` | `computeFengshui()` Layer 0 + 模块 barrel |

**新建 — `packages/core/test/`**：`fengshui-directions.test.ts`、`fengshui-ming-gua.test.ts`、`fengshui-eight-mansions.test.ts`、`fengshui-remedy.test.ts`、`fengshui-object.test.ts`、`fengshui-compute.test.ts`

**新建 — `packages/llm/src/fengshui/`**（与既有 `src/eval/` 同为子目录体例）

| 文件 | 职责 |
|---|---|
| `facts.ts` | `extractFengshuiFacts()` — 压成带标签承重事实 |
| `prompt.ts` | 三分节 header、`buildFengshuiSystemPrompt()`、`buildFengshuiUserPrompt()`、`parseFengshuiSections()` |
| `guard.ts` | `sanitizeFengshui()` + `verifyDirectionConsistency()` |
| `index.ts` | `generateFengshuiReading()`、`adviseObjectText()` |

**新建 — llm 测试**：`packages/llm/src/fengshui/prompt.test.ts`、`guard.test.ts`、`facts.test.ts`

**新建 — web**

| 文件 | 职责 |
|---|---|
| `apps/web/components/charts/BaguaWheel.tsx` | 八方位盘图（SVG 八扇区按吉凶着色） |
| `apps/web/app/fengshui/page.tsx` | 「境」页 Layer 0 报告 |
| `apps/web/app/fengshui/object/page.tsx` | 物件顾问页 |
| `apps/web/app/fengshui/ObjectAdvisorForm.tsx` | 物件顾问表单 + 结果卡 |
| `apps/web/app/api/fengshui/reading/route.ts` | 报告生成（流式非必需，一次性返回） |
| `apps/web/app/api/fengshui/object/route.ts` | 物件建议文字 |
| `apps/web/lib/fengshui-cache.ts` | localStorage 报告缓存 |

**修改 — web**：`apps/web/components/AppShell.tsx`（加「境」）、`apps/web/lib/i18n/messages/{zh,en}.ts`（加 `fengshui` 命名空间）
**修改 — barrel**：`packages/core/src/index.ts`、`packages/llm/src/index.ts`

**新建 — web 测试**：`apps/web/components/charts/__tests__/BaguaWheel.test.tsx`、`apps/web/app/fengshui/__tests__/page.test.tsx`

---

## Task 1: 方位基础与五行映射

**Files:**
- Create: `packages/core/src/fengshui/directions.ts`
- Test: `packages/core/test/fengshui-directions.test.ts`

**Interfaces:**
- Consumes: 无（本模块为最底层）
- Produces: `DIRECTIONS`、`Direction`、`DIRECTION_LABEL`、`OPPOSITE`、`GUA_DIRECTION`、`DIRECTION_GUA`、`Gua`、`ElementAffinity`、`elementDirections(useful: UsefulElements): ElementAffinity`

- [ ] **Step 1: 写失败测试**

创建 `packages/core/test/fengshui-directions.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import {
  DIRECTIONS, OPPOSITE, GUA_DIRECTION, DIRECTION_GUA, elementDirections,
} from "../src/fengshui/directions";

describe("EP-fs-01 方位基础", () => {
  it("八方位齐全且互为对宫", () => {
    expect(DIRECTIONS).toHaveLength(8);
    for (const d of DIRECTIONS) {
      expect(OPPOSITE[OPPOSITE[d]]).toBe(d);
      expect(OPPOSITE[d]).not.toBe(d);
    }
  });

  it("卦与方位一一对应（坎北 离南 震东 兑西）", () => {
    expect(GUA_DIRECTION["坎"]).toBe("N");
    expect(GUA_DIRECTION["离"]).toBe("S");
    expect(GUA_DIRECTION["震"]).toBe("E");
    expect(GUA_DIRECTION["兑"]).toBe("W");
    for (const d of DIRECTIONS) expect(GUA_DIRECTION[DIRECTION_GUA[d]]).toBe(d);
  });

  it("用神喜木水 → 有利方位含东/东南/北，不利含西/西北", () => {
    const a = elementDirections({ favorable: ["木", "水"], unfavorable: ["金", "火", "土"], method: "扶抑", note: "" });
    expect(a.favorableDirections.sort()).toEqual(["E", "N", "SE"]);
    expect(a.unfavorableDirections).toContain("W");
    expect(a.unfavorableDirections).toContain("NW");
    expect(a.favorableColors.length).toBeGreaterThan(0);
    expect(a.favorableMaterials.length).toBeGreaterThan(0);
  });

  it("中和（喜忌皆空）时不产出方位偏好", () => {
    const a = elementDirections({ favorable: [], unfavorable: [], method: "扶抑", note: "" });
    expect(a.favorableDirections).toEqual([]);
    expect(a.unfavorableDirections).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-directions.test.ts`
Expected: FAIL — `Failed to resolve import "../src/fengshui/directions"`

- [ ] **Step 3: 实现**

创建 `packages/core/src/fengshui/directions.ts`：

```ts
import type { UsefulElements } from "../bazi/useful-elements";

/**
 * 风水方位基础层（EP-fs-01）。纯常量 + 纯映射，无 I/O。
 * 八方位用英文枚举作 key（便于 UI 与序列化），中文名单独查表。
 */

export const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const DIRECTION_LABEL: Record<Direction, string> = {
  N: "北", NE: "东北", E: "东", SE: "东南", S: "南", SW: "西南", W: "西", NW: "西北",
};

/** 对宫：坐 = 向的对宫 */
export const OPPOSITE: Record<Direction, Direction> = {
  N: "S", S: "N", E: "W", W: "E", NE: "SW", SW: "NE", SE: "NW", NW: "SE",
};

export const GUAS = ["坎", "坤", "震", "巽", "乾", "兑", "艮", "离"] as const;
export type Gua = (typeof GUAS)[number];

/** 后天八卦定位 */
export const GUA_DIRECTION: Record<Gua, Direction> = {
  坎: "N", 艮: "NE", 震: "E", 巽: "SE", 离: "S", 坤: "SW", 兑: "W", 乾: "NW",
};

export const DIRECTION_GUA: Record<Direction, Gua> = {
  N: "坎", NE: "艮", E: "震", SE: "巽", S: "离", SW: "坤", W: "兑", NW: "乾",
};

/**
 * 五行 → 方位。土在传统上兼主中宫，但中宫不属八方，故只取西南/东北。
 */
export const ELEMENT_DIRECTIONS: Record<string, Direction[]> = {
  木: ["E", "SE"], 火: ["S"], 土: ["SW", "NE"], 金: ["W", "NW"], 水: ["N"],
};

export const ELEMENT_COLORS: Record<string, string[]> = {
  木: ["青", "绿"], 火: ["红", "橙", "紫"], 土: ["黄", "褐", "米"],
  金: ["白", "金", "银灰"], 水: ["黑", "藏蓝"],
};

export const ELEMENT_MATERIALS: Record<string, string[]> = {
  木: ["原木", "棉麻", "绿植"], 火: ["皮革", "暖光", "烛火"], 土: ["陶瓷", "石材", "夯土质感"],
  金: ["金属", "玻璃", "镜面"], 水: ["水景", "流线造型", "深色织物"],
};

export type ElementAffinity = {
  favorableElements: string[];
  unfavorableElements: string[];
  favorableDirections: Direction[];
  unfavorableDirections: Direction[];
  favorableColors: string[];
  favorableMaterials: string[];
  unfavorableColors: string[];
};

const flat = <T,>(els: string[], table: Record<string, T[]>): T[] =>
  Array.from(new Set(els.flatMap((e) => table[e] ?? [])));

/** 用神喜忌五行 → 方位/颜色/材质偏好（EP-fs-02 的数据来源）。 */
export function elementDirections(useful: UsefulElements): ElementAffinity {
  return {
    favorableElements: useful.favorable,
    unfavorableElements: useful.unfavorable,
    favorableDirections: flat(useful.favorable, ELEMENT_DIRECTIONS).sort(),
    unfavorableDirections: flat(useful.unfavorable, ELEMENT_DIRECTIONS).sort(),
    favorableColors: flat(useful.favorable, ELEMENT_COLORS),
    favorableMaterials: flat(useful.favorable, ELEMENT_MATERIALS),
    unfavorableColors: flat(useful.unfavorable, ELEMENT_COLORS),
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-directions.test.ts`
Expected: PASS — 4 passed

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/fengshui/directions.ts packages/core/test/fengshui-directions.test.ts
git commit -m "feat(fengshui): 方位基础与五行→方位/色/材映射 [EP-fs-01]"
```

---

## Task 2: 本命卦 `deriveMingGua`

**Files:**
- Create: `packages/core/src/fengshui/ming-gua.ts`
- Test: `packages/core/test/fengshui-ming-gua.test.ts`

**Interfaces:**
- Consumes: `Direction`、`Gua`、`GUA_DIRECTION`（Task 1）
- Produces: `MingGua = { gua: number; guaName: Gua; group: "东四命" | "西四命"; direction: Direction; lichunYear: number }`、`deriveMingGua(birth: BirthInput, chart: UnifiedChart): MingGua`、`ganzhiOfYear(year: number): string`

**关键点：** 命卦要「立春年」。不重算节气——`chart.bazi.pillars.year` 天生就是立春为界的干支年，用它在公历年 ±1 窗口内反查即可唯一确定（干支 60 年周期，窗口内无歧义）。

- [ ] **Step 1: 写失败测试**

创建 `packages/core/test/fengshui-ming-gua.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, type BirthInput } from "../src/index";
import { deriveMingGua, ganzhiOfYear } from "../src/fengshui/ming-gua";

const mk = (over: Partial<BirthInput>): BirthInput =>
  BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", trueSolarTime: false, ...over });

const gua = (date: string, gender: "male" | "female") => {
  const b = mk({ date, gender });
  return deriveMingGua(b, computeUnifiedChart(b));
};

describe("EP-fs-01 本命卦 deriveMingGua", () => {
  it("ganzhiOfYear 基准：1984=甲子", () => {
    expect(ganzhiOfYear(1984)).toBe("甲子");
    expect(ganzhiOfYear(1990)).toBe("庚午");
  });

  // 以下六个值对拍自公开命卦速查表（华易网 k366.com/minggua/、知乎命卦对照表）
  it("1984 男 → 兑7 西四命", () => {
    const g = gua("1984-06-15", "male");
    expect(g.gua).toBe(7);
    expect(g.guaName).toBe("兑");
    expect(g.group).toBe("西四命");
    expect(g.direction).toBe("W");
  });

  it("1990 男 → 坎1 东四命", () => {
    const g = gua("1990-06-15", "male");
    expect(g.gua).toBe(1);
    expect(g.guaName).toBe("坎");
    expect(g.group).toBe("东四命");
  });

  it("1991 男 → 离9；1991 女 → 乾6", () => {
    expect(gua("1991-06-15", "male").gua).toBe(9);
    expect(gua("1991-06-15", "female").gua).toBe(6);
    expect(gua("1991-06-15", "female").guaName).toBe("乾");
  });

  it("1984 女 → 艮8", () => {
    expect(gua("1984-06-15", "female").gua).toBe(8);
    expect(gua("1984-06-15", "female").guaName).toBe("艮");
  });

  it("5 数寄卦：1986 男寄坤2、1990 女寄艮8", () => {
    expect(gua("1986-06-15", "male").gua).toBe(2);
    expect(gua("1986-06-15", "male").guaName).toBe("坤");
    // 1990 女在速查表中即为艮，正好验证「女寄艮」这一支
    expect(gua("1990-06-15", "female").gua).toBe(8);
    expect(gua("1990-06-15", "female").guaName).toBe("艮");
  });

  it("2000 年后无需换式：2000 男→离9、2000 女→乾6", () => {
    expect(gua("2000-06-15", "male").gua).toBe(9);
    expect(gua("2000-06-15", "female").gua).toBe(6);
  });

  it("跨立春取上一年：1981-01-20 按 1980 算 → 坤2 西四命，而非 1981 的坎1 东四命", () => {
    const g = gua("1981-01-20", "male");
    expect(g.lichunYear).toBe(1980);
    expect(g.gua).toBe(2);
    expect(g.group).toBe("西四命");
  });

  it("立春后不回退：1991-03-15 按 1991 算", () => {
    expect(gua("1991-03-15", "male").lichunYear).toBe(1991);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-ming-gua.test.ts`
Expected: FAIL — `Failed to resolve import "../src/fengshui/ming-gua"`

- [ ] **Step 3: 实现**

创建 `packages/core/src/fengshui/ming-gua.ts`：

```ts
import type { BirthInput } from "../types/birth-input";
import type { UnifiedChart } from "../types/chart";
import { GUA_DIRECTION, type Direction, type Gua } from "./directions";

/**
 * 本命卦（EP-fs-01）。采用三元通行式，与 iztro 显式选派（zhongzhou）同为「选定流派」。
 * ⚠️ 数值由测试锁定；改动公式必须同步重跑 fengshui-ming-gua.test.ts。
 */

const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

/** 公历年 → 干支（1984 = 甲子）。 */
export function ganzhiOfYear(year: number): string {
  const i = ((year - 4) % 60 + 60) % 60;
  return STEMS[i % 10]! + BRANCHES[i % 12]!;
}

/** 卦序 1–9（5 为中宫，需寄卦）→ 卦名。 */
const GUA_BY_NUMBER: Record<number, Gua> = {
  1: "坎", 2: "坤", 3: "震", 4: "巽", 6: "乾", 7: "兑", 8: "艮", 9: "离",
};

const EAST_GROUP = new Set<Gua>(["坎", "离", "震", "巽"]);

export type MingGua = {
  gua: number;
  guaName: Gua;
  group: "东四命" | "西四命";
  direction: Direction;
  /** 实际采用的立春年（可审计，跨立春时为出生公历年 -1）*/
  lichunYear: number;
};

/**
 * 立春年：用已算好的年柱干支在公历年 ±1 窗口内反查。
 * 不重算节气 —— 年柱本就是立春为界，这样与八字引擎天然一致。
 */
function lichunYearOf(birth: BirthInput, chart: UnifiedChart): number {
  const y = Number(birth.date.slice(0, 4));
  const gz = chart.bazi.pillars.year.stem + chart.bazi.pillars.year.branch;
  for (const candidate of [y, y - 1, y + 1]) {
    if (ganzhiOfYear(candidate) === gz) return candidate;
  }
  return y; // 理论不可达；兜底避免抛错
}

/**
 * 三元命卦。直接对立春年 Y 取模，**不需要分 1900s / 2000s 两套式子**：
 *   男 = (2 − Y) mod 9，女 = (Y − 5) mod 9，余 0 归 9。
 * 5 为中宫无卦：男寄坤(2)、女寄艮(8)。
 *
 * 等价于坊间通行的分段写法（男「(100−后两位)÷9 取余」、女「(后两位−4)÷9 取余」），
 * 但把世纪分支消掉了 —— 因 1900 mod 9 = 1、2000 mod 9 = 2，两段折算后同式。
 * 已对拍公开命卦速查表：1984 男兑7/女艮8、1990 男坎1/女艮8、1991 男离9/女乾6。
 */
function guaNumber(year: number, gender: "male" | "female"): number {
  const raw = gender === "male" ? 2 - year : year - 5;
  let g = ((raw % 9) + 9) % 9;
  if (g === 0) g = 9;
  if (g === 5) g = gender === "male" ? 2 : 8; // 男寄坤、女寄艮
  return g;
}

export function deriveMingGua(birth: BirthInput, chart: UnifiedChart): MingGua {
  const lichunYear = lichunYearOf(birth, chart);
  const gua = guaNumber(lichunYear, birth.gender);
  const guaName = GUA_BY_NUMBER[gua]!;
  return {
    gua,
    guaName,
    group: EAST_GROUP.has(guaName) ? "东四命" : "西四命",
    direction: GUA_DIRECTION[guaName],
    lichunYear,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-ming-gua.test.ts`
Expected: PASS — 8 passed

> **对拍状态：已完成（2026-08-14，由 controller 在开工前查证）。** 公式与全部测试期望值均对拍自公开命卦速查表（华易网 `k366.com/minggua/`、知乎命卦对照表），六个基准值一致：1984 男兑7 / 女艮8、1990 男坎1 / 女艮8、1991 男离9 / 女乾6。同来源亦确认立春分界规则（「二月四日或五日之前出生按旧的一年计算」），与本实现一致。**照抄本 Task 的公式与期望值，不要自行改写。**

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/fengshui/ming-gua.ts packages/core/test/fengshui-ming-gua.test.ts
git commit -m "feat(fengshui): 本命卦（立春年反推 + 三元式 + 寄卦）[EP-fs-01]"
```

---

## Task 3: 八宅游年表 `EIGHT_MANSIONS`

**Files:**
- Create: `packages/core/src/fengshui/eight-mansions.ts`
- Test: `packages/core/test/fengshui-eight-mansions.test.ts`

**Interfaces:**
- Consumes: `Direction`、`Gua`、`GUA_DIRECTION`、`DIRECTIONS`（Task 1）
- Produces: `Star`（八星名联合类型）、`AUSPICIOUS_STARS`、`EIGHT_MANSIONS: Record<Gua, Record<Direction, Star>>`、`DirectionVerdict`、`directionsFor(gua: Gua): Record<Direction, DirectionVerdict>`

- [ ] **Step 1: 写失败测试**

创建 `packages/core/test/fengshui-eight-mansions.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { DIRECTIONS, GUAS, GUA_DIRECTION } from "../src/fengshui/directions";
import { EIGHT_MANSIONS, directionsFor, AUSPICIOUS_STARS } from "../src/fengshui/eight-mansions";

describe("EP-fs-01 八宅游年表", () => {
  it("8 卦 × 8 方，每卦八星不重复", () => {
    for (const g of GUAS) {
      const row = EIGHT_MANSIONS[g];
      expect(Object.keys(row)).toHaveLength(8);
      expect(new Set(Object.values(row)).size).toBe(8);
    }
  });

  it("伏位恒在本卦方位", () => {
    for (const g of GUAS) {
      expect(EIGHT_MANSIONS[g][GUA_DIRECTION[g]]).toBe("伏位");
    }
  });

  it("每卦四吉四凶各半", () => {
    for (const g of GUAS) {
      const v = directionsFor(g);
      const good = DIRECTIONS.filter((d) => v[d].auspicious);
      expect(good).toHaveLength(4);
    }
  });

  it("坎宅逐格：生气巽 天医震 延年离 伏位坎 / 绝命坤 五鬼艮 六煞乾 祸害兑", () => {
    const k = EIGHT_MANSIONS["坎"];
    expect(k.SE).toBe("生气");
    expect(k.E).toBe("天医");
    expect(k.S).toBe("延年");
    expect(k.N).toBe("伏位");
    expect(k.SW).toBe("绝命");
    expect(k.NE).toBe("五鬼");
    expect(k.NW).toBe("六煞");
    expect(k.W).toBe("祸害");
  });

  // 艮/震/离/坤 四行的六煞与祸害极易互换（同为四凶、同落一组方位，
  // 结构性测试抓不到），故对其中两行逐格断言守护
  it("艮宅逐格：生气坤 天医乾 延年兑 伏位艮 / 绝命巽 五鬼坎 六煞震 祸害离", () => {
    const g = EIGHT_MANSIONS["艮"];
    expect(g.SW).toBe("生气");
    expect(g.NW).toBe("天医");
    expect(g.W).toBe("延年");
    expect(g.NE).toBe("伏位");
    expect(g.SE).toBe("绝命");
    expect(g.N).toBe("五鬼");
    expect(g.E).toBe("六煞");
    expect(g.S).toBe("祸害");
  });

  it("震宅逐格：六煞在艮(东北)、祸害在坤(西南)，二者不可互换", () => {
    const z = EIGHT_MANSIONS["震"];
    expect(z.NE).toBe("六煞");
    expect(z.SW).toBe("祸害");
    expect(z.S).toBe("生气");
    expect(z.N).toBe("天医");
  });

  it("东四命四吉方全落东四方位（坎离震巽）", () => {
    const east = new Set(["N", "S", "E", "SE"]);
    for (const g of ["坎", "离", "震", "巽"] as const) {
      const v = directionsFor(g);
      for (const d of DIRECTIONS) if (v[d].auspicious) expect(east.has(d)).toBe(true);
    }
  });

  it("西四命四吉方全落西四方位（乾兑艮坤）", () => {
    const west = new Set(["NW", "W", "NE", "SW"]);
    for (const g of ["乾", "兑", "艮", "坤"] as const) {
      const v = directionsFor(g);
      for (const d of DIRECTIONS) if (v[d].auspicious) expect(west.has(d)).toBe(true);
    }
  });

  it("生气 rank 最高，伏位最低（吉方内）", () => {
    const v = directionsFor("坎");
    expect(v.SE.rank).toBe(1);
    expect(v.N.rank).toBe(4);
    expect(AUSPICIOUS_STARS).toContain("生气");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-eight-mansions.test.ts`
Expected: FAIL — `Failed to resolve import "../src/fengshui/eight-mansions"`

- [ ] **Step 3: 实现**

创建 `packages/core/src/fengshui/eight-mansions.ts`：

```ts
import { DIRECTIONS, GUA_DIRECTION, type Direction, type Gua } from "./directions";

/**
 * 八宅游年表（EP-fs-01）。四吉：生气/天医/延年/伏位；四凶：绝命/五鬼/六煞/祸害。
 * 游年翻卦的结果直接硬编码为查表 —— 零推算歧义、逐格可测，
 * 落实「排盘不许 LLM 算」（见 CLAUDE.md）。
 */

export const AUSPICIOUS_STARS = ["生气", "天医", "延年", "伏位"] as const;
export const INAUSPICIOUS_STARS = ["绝命", "五鬼", "六煞", "祸害"] as const;
export type Star = (typeof AUSPICIOUS_STARS)[number] | (typeof INAUSPICIOUS_STARS)[number];

/**
 * 吉方排序（越小越吉）；凶方排序（越小越凶）。
 * 用 Record<Star, number> 而非 Record<string, number>：让编译器强制八星齐全，
 * 键名写错会编译失败，而不是运行期悄悄拿到 undefined。
 */
const STAR_RANK: Record<Star, number> = {
  生气: 1, 天医: 2, 延年: 3, 伏位: 4,
  绝命: 1, 五鬼: 2, 六煞: 3, 祸害: 4,
};

/**
 * 以「卦 → 各星所在卦」表达，再展开为方位表。
 *
 * 依据大游年歌（以坐山为伏位，其余七字**按方位顺时针**依次排）：
 *   乾六天五祸绝延生 · 坎五天生延绝祸六 · 艮六绝祸生延天五 · 震延生祸绝五天六
 *   巽天五六祸生绝延 · 离六五绝延祸生天 · 坤天延绝生祸五六 · 兑生祸延绝六五天
 * 简写：生=生气 天=天医 延=延年 五=五鬼 六=六煞 祸=祸害 绝=绝命。
 * 顺时针方位序：北 → 东北 → 东 → 东南 → 南 → 西南 → 西 → 西北。
 *
 * ⚠️ 已逐格对拍（2026-08-14）。六煞与祸害同为四凶且同落一组方位，
 *    「四吉方全落本组」的结构性测试**抓不到二者互换**，故本表只能靠逐格断言守护。
 */
const BY_STAR: Record<Gua, Record<Star, Gua>> = {
  坎: { 生气: "巽", 天医: "震", 延年: "离", 伏位: "坎", 绝命: "坤", 五鬼: "艮", 六煞: "乾", 祸害: "兑" },
  离: { 生气: "震", 天医: "巽", 延年: "坎", 伏位: "离", 绝命: "乾", 五鬼: "兑", 六煞: "坤", 祸害: "艮" },
  震: { 生气: "离", 天医: "坎", 延年: "巽", 伏位: "震", 绝命: "兑", 五鬼: "乾", 六煞: "艮", 祸害: "坤" },
  巽: { 生气: "坎", 天医: "离", 延年: "震", 伏位: "巽", 绝命: "艮", 五鬼: "坤", 六煞: "兑", 祸害: "乾" },
  乾: { 生气: "兑", 天医: "艮", 延年: "坤", 伏位: "乾", 绝命: "离", 五鬼: "震", 六煞: "坎", 祸害: "巽" },
  兑: { 生气: "乾", 天医: "坤", 延年: "艮", 伏位: "兑", 绝命: "震", 五鬼: "离", 六煞: "巽", 祸害: "坎" },
  艮: { 生气: "坤", 天医: "乾", 延年: "兑", 伏位: "艮", 绝命: "巽", 五鬼: "坎", 六煞: "震", 祸害: "离" },
  坤: { 生气: "艮", 天医: "兑", 延年: "乾", 伏位: "坤", 绝命: "坎", 五鬼: "巽", 六煞: "离", 祸害: "震" },
};

function expand(row: Record<Star, Gua>): Record<Direction, Star> {
  const out = {} as Record<Direction, Star>;
  for (const [star, gua] of Object.entries(row) as [Star, Gua][]) {
    out[GUA_DIRECTION[gua]] = star;
  }
  return out;
}

export const EIGHT_MANSIONS: Record<Gua, Record<Direction, Star>> = {
  坎: expand(BY_STAR.坎), 离: expand(BY_STAR.离), 震: expand(BY_STAR.震), 巽: expand(BY_STAR.巽),
  乾: expand(BY_STAR.乾), 兑: expand(BY_STAR.兑), 艮: expand(BY_STAR.艮), 坤: expand(BY_STAR.坤),
};

export type DirectionVerdict = {
  direction: Direction;
  star: Star;
  auspicious: boolean;
  /** 吉方 1–4（1 最吉）；凶方 1–4（1 最凶）*/
  rank: number;
};

export function directionsFor(gua: Gua): Record<Direction, DirectionVerdict> {
  const row = EIGHT_MANSIONS[gua];
  const out = {} as Record<Direction, DirectionVerdict>;
  for (const d of DIRECTIONS) {
    const star = row[d];
    const auspicious = (AUSPICIOUS_STARS as readonly string[]).includes(star);
    out[d] = { direction: d, star, auspicious, rank: STAR_RANK[star] };
  }
  return out;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-eight-mansions.test.ts`
Expected: PASS — 7 passed

> **对拍状态：已完成（2026-08-14，由 controller 在开工前查证）。** `BY_STAR` 已按大游年歌逐格核对；原稿中艮、震、离、坤四行的六煞与祸害互换，已修正。**照抄本 Task 的表，不要自行改写或"顺手纠正"。**
>
> 测试期望值也已同步：`fengshui-eight-mansions.test.ts` 中坎宅、艮宅、震宅三组逐格断言即为守护该表的主要防线。

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/fengshui/eight-mansions.ts packages/core/test/fengshui-eight-mansions.test.ts
git commit -m "feat(fengshui): 八宅游年 8×8 查表 + directionsFor [EP-fs-01]"
```

---

## Task 4: 环境心理学对照表与守护栏常量

**Files:**
- Create: `packages/core/src/fengshui/env-psych.ts`
- Test: `packages/core/test/fengshui-env-psych.test.ts`

**Interfaces:**
- Consumes: `Direction`（Task 1）
- Produces: `EnvPsychAnchor`、`ENV_PSYCH_ANCHORS: EnvPsychAnchor[]`、`FENGSHUI_GUARDRAILS: readonly string[]`

体例镜像既有 `packages/core/src/synthesis/east-west-map.ts`（同文件双导出：知识锚点 + 守护栏）。

- [ ] **Step 1: 写失败测试**

创建 `packages/core/test/fengshui-env-psych.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { ENV_PSYCH_ANCHORS, FENGSHUI_GUARDRAILS } from "../src/fengshui/env-psych";

describe("EP-fs-02 环境心理学对照表", () => {
  it("锚点非空且字段齐全", () => {
    expect(ENV_PSYCH_ANCHORS.length).toBeGreaterThanOrEqual(6);
    for (const a of ENV_PSYCH_ANCHORS) {
      expect(a.traditional).toBeTruthy();
      expect(a.action).toBeTruthy();
      expect(["双重支撑", "传统象征"]).toContain(a.evidence);
    }
  });

  it("双重支撑必有现代机制，传统象征必须 modern 为 null", () => {
    for (const a of ENV_PSYCH_ANCHORS) {
      if (a.evidence === "双重支撑") expect(a.modern).toBeTruthy();
      else expect(a.modern).toBeNull();
    }
  });

  it("含靠山↔prospect-refuge 这一核心桥点", () => {
    const hit = ENV_PSYCH_ANCHORS.find((a) => a.traditional.includes("靠"));
    expect(hit).toBeDefined();
    expect(hit!.modern).toMatch(/prospect|refuge|退路|视野/i);
  });

  it("守护栏含非决定论与禁编科学依据两条", () => {
    const joined = FENGSHUI_GUARDRAILS.join("");
    expect(joined).toMatch(/非决定论|不预言|禁断/);
    expect(joined).toMatch(/传统象征/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-env-psych.test.ts`
Expected: FAIL — `Failed to resolve import "../src/fengshui/env-psych"`

- [ ] **Step 3: 实现**

创建 `packages/core/src/fengshui/env-psych.ts`：

```ts
/**
 * 风水 ↔ 环境心理学 对照表（EP-fs-02）—— 双层口吻的西方半边。
 *
 * ⚠️ 立场：做成 core 常量而非交由 LLM 现编，与 RESONANCE_ANCHORS 同思路。
 * 传统化解分两类，混讲会毁掉可信度：
 *   - 双重支撑：传统有说法，现代机制也真实存在 → 两边都给。
 *   - 传统象征：传统有说法，现代机制没有对应解释 → modern 恒为 null，
 *     用「仪式与掌控感」框架呈现，绝不假装有科学依据。
 * 该标注由 prompt 硬规则 + sanitizeFengshui 双重执行。
 */

type EnvPsychBase = {
  /** 传统风水概念 */
  traditional: string;
  /** 可做的事 */
  action: string;
};

/**
 * 判别联合而非平铺字段：让「传统象征 ⇒ modern 恒为 null」这条产品硬约束
 * 由编译器强制，而不是只靠运行期测试守护当下这几条数据。
 * 配错（如给传统象征条目补上现代机制）会直接编译失败。
 */
export type EnvPsychAnchor =
  | (EnvPsychBase & { evidence: "双重支撑"; modern: string })
  | (EnvPsychBase & { evidence: "传统象征"; modern: null });

export const ENV_PSYCH_ANCHORS: EnvPsychAnchor[] = [
  {
    traditional: "背后有靠 / 靠山",
    modern: "prospect-refuge：背实墙且前方视野开阔时，环境警觉负荷下降，专注更易维持",
    action: "书桌与床头贴实墙，避免背对门与开阔通道",
    evidence: "双重支撑",
  },
  {
    traditional: "藏风聚气",
    modern: "恢复性环境（Kaplan ART）：适度围合感有助注意力恢复",
    action: "为久坐处做出局部围合，避免置身穿堂动线中央",
    evidence: "双重支撑",
  },
  {
    traditional: "门冲床 / 床对镜",
    modern: "半醒状态下的突发视觉刺激与夜间惊跳反应，影响睡眠连续性",
    action: "床不正对门；镜面避开床的正面视线",
    evidence: "双重支撑",
  },
  {
    traditional: "形煞 / 屋内杂乱",
    modern: "视觉杂乱提升认知负荷，削弱工作记忆可用容量",
    action: "清掉台面与地面动线上的堆积物",
    evidence: "双重支撑",
  },
  {
    traditional: "西晒",
    modern: "午后强光照延后褪黑素分泌，影响入睡",
    action: "西向卧室加遮光帘；床头避开西墙",
    evidence: "双重支撑",
  },
  {
    traditional: "明堂开阔",
    modern: "视觉纵深与开阔视野关联更平稳的情绪基调",
    action: "保持入口与主要窗前的通透，勿堆放高物",
    evidence: "双重支撑",
  },
  {
    traditional: "木气生发 / 绿植",
    modern: "biophilia：室内绿植与自然元素关联压力恢复",
    action: "在久处的房间放一两盆好养的绿植",
    evidence: "双重支撑",
  },
  {
    traditional: "金泄土煞（凶方置金属器物）",
    modern: null,
    action: "在该方位放一件你自己喜欢的金属器物，作为「这一块我已安顿好」的标记",
    evidence: "传统象征",
  },
  {
    traditional: "凶方宜静宜压",
    modern: null,
    action: "把储物、少用的柜子放在凶方，把久待的活动放到吉方",
    evidence: "传统象征",
  },
];

export const FENGSHUI_GUARDRAILS = [
  "所有方位吉凶必须来自计算层给出的事实，禁止自行推算或臆造星名。",
  "禁断祸福：不得出现「必漏财」「会生病」「注定」「一定」等决定论断言。",
  "标注为「传统象征」的做法，禁止为其编造科学依据（不得使用「研究表明」「科学证明」「临床」等措辞）；用仪式感与掌控感的框架呈现。",
  "不做医疗、财务、法律建议；不预测具体事件与时点。",
  "语气反思性、非决定论、成长导向；优先给零成本、今天就能做的事。",
  "必须包含免责说明：本内容用于自我觉察与居住体验改善，不构成专业建议。",
] as const;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-env-psych.test.ts`
Expected: PASS — 4 passed

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/fengshui/env-psych.ts packages/core/test/fengshui-env-psych.test.ts
git commit -m "feat(fengshui): 环境心理学对照表 + 守护栏常量 [EP-fs-02]"
```

---

> **交付后修正（2026-08-14，评审 Important）：** `EnvPsychAnchor` 增加显式 `effort: Effort` 字段，9 条锚点各自标明成本；`Effort` 类型定义下沉到本模块（`remedy.ts` 依赖 `env-psych.ts`，反向会成环），由 `remedy.ts` 重新导出。原因见 Task 5 的同名修正说明。

## Task 5: 化解方案 `Remedy`

**Files:**
- Create: `packages/core/src/fengshui/remedy.ts`
- Test: `packages/core/test/fengshui-remedy.test.ts`

**Interfaces:**
- Consumes: `Direction`、`DIRECTION_LABEL`、`ElementAffinity`（Task 1）；`MingGua`（Task 2）；`DirectionVerdict`（Task 3）；`ENV_PSYCH_ANCHORS`（Task 4）
- Produces: `Remedy`、`Effort`、`buildPersonalRemedies(mingGua, verdicts, affinity): Remedy[]`、`sortRemedies(list: Remedy[]): Remedy[]`

**注意：** 波 1 无居所对象，因此**无租房过滤**（`tenancy` 字段仍产出，过滤逻辑属波 2 的 EP-fs-12）。

- [ ] **Step 1: 写失败测试**

创建 `packages/core/test/fengshui-remedy.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { directionsFor } from "../src/fengshui/eight-mansions";
import { elementDirections } from "../src/fengshui/directions";
import { buildPersonalRemedies, sortRemedies, type Remedy } from "../src/fengshui/remedy";

const mingGua = { gua: 1, guaName: "坎" as const, group: "东四命" as const, direction: "N" as const, lichunYear: 1990 };
const affinity = elementDirections({ favorable: ["木", "水"], unfavorable: ["金", "火", "土"], method: "扶抑", note: "" });
const list = () => buildPersonalRemedies(mingGua, directionsFor("坎"), affinity);

describe("EP-fs-03 化解方案", () => {
  it("产出非空，且每条字段完整", () => {
    const rs = list();
    expect(rs.length).toBeGreaterThanOrEqual(4);
    for (const r of rs) {
      expect(r.id).toBeTruthy();
      expect(r.action).toBeTruthy();
      expect(["零成本", "挪动", "添置", "装修"]).toContain(r.effort);
      expect(["租房可做", "需自有"]).toContain(r.tenancy);
      expect(["双重支撑", "传统象征"]).toContain(r.evidence);
    }
  });

  it("传统象征条目的 modern 恒为 null", () => {
    for (const r of list()) {
      if (r.evidence === "传统象征") expect(r.modern).toBeNull();
    }
  });

  it("含「床头/书桌朝生气方」建议，且指向坎命的生气方东南", () => {
    const hit = list().find((r) => r.action.includes("生气"));
    expect(hit).toBeDefined();
    expect(hit!.action).toContain("东南");
  });

  it("排序：零成本优先；同级内双重支撑先于传统象征", () => {
    const sorted = sortRemedies([
      { id: "a", target: "t", action: "x", effort: "添置", tenancy: "租房可做", traditional: "t", modern: null, evidence: "传统象征" },
      { id: "b", target: "t", action: "y", effort: "零成本", tenancy: "租房可做", traditional: "t", modern: null, evidence: "传统象征" },
      { id: "c", target: "t", action: "z", effort: "零成本", tenancy: "租房可做", traditional: "t", modern: "m", evidence: "双重支撑" },
    ] as Remedy[]);
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("id 唯一", () => {
    const ids = list().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-remedy.test.ts`
Expected: FAIL — `Failed to resolve import "../src/fengshui/remedy"`

- [ ] **Step 3: 实现**

创建 `packages/core/src/fengshui/remedy.ts`：

```ts
import { DIRECTION_LABEL, type Direction, type ElementAffinity } from "./directions";
import type { DirectionVerdict } from "./eight-mansions";
import type { MingGua } from "./ming-gua";
import { ENV_PSYCH_ANCHORS } from "./env-psych";

/**
 * 化解方案（EP-fs-03）。两条硬约束：
 *  1) 成本分级 —— 首发市场租房比例高，「零成本」条目必须排在前面；
 *  2) 诚实标注 —— evidence='传统象征' 的条目 modern 恒为 null。
 */

export type Effort = "零成本" | "挪动" | "添置" | "装修";

type RemedyBase = {
  id: string;
  target: string;
  action: string;
  effort: Effort;
  tenancy: "租房可做" | "需自有";
  traditional: string;
};

/**
 * 与 EnvPsychAnchor 同构的判别联合：「传统象征 ⇒ modern 恒为 null」由编译器强制。
 * 这是产品的诚实标注约束，不能只靠运行期测试守。
 */
export type Remedy =
  | (RemedyBase & { evidence: "双重支撑"; modern: string })
  | (RemedyBase & { evidence: "传统象征"; modern: null });

const EFFORT_ORDER: Record<Effort, number> = { 零成本: 0, 挪动: 1, 添置: 2, 装修: 3 };

/** 零成本优先；同级内双重支撑先于传统象征；再按 id 稳定排序。 */
export function sortRemedies(list: Remedy[]): Remedy[] {
  return [...list].sort((a, b) =>
    EFFORT_ORDER[a.effort] - EFFORT_ORDER[b.effort] ||
    (a.evidence === b.evidence ? 0 : a.evidence === "双重支撑" ? -1 : 1) ||
    a.id.localeCompare(b.id),
  );
}

const label = (d: Direction) => DIRECTION_LABEL[d];

/**
 * Layer 0 个人层面化解：只依赖命卦四吉四凶 + 用神喜忌，不需要居所。
 * 宅层面化解属波 2（EP-fs-12）。
 */
export function buildPersonalRemedies(
  mingGua: MingGua,
  verdicts: Record<Direction, DirectionVerdict>,
  affinity: ElementAffinity,
): Remedy[] {
  const all = Object.values(verdicts);
  const good = all.filter((v) => v.auspicious).sort((a, b) => a.rank - b.rank);
  const bad = all.filter((v) => !v.auspicious).sort((a, b) => a.rank - b.rank);
  const sheng = good.find((v) => v.star === "生气") ?? good[0]!;
  const tianyi = good.find((v) => v.star === "天医") ?? good[1] ?? sheng;
  const worst = bad[0]!;

  const out: Remedy[] = [
    {
      id: "fs-desk-sheng",
      target: `${label(sheng.direction)}（生气方）`,
      action: `久坐处朝向调到${label(sheng.direction)}——书桌坐位面朝生气方，笔电与常用物也顺这个朝向摆`,
      effort: "零成本",
      tenancy: "租房可做",
      traditional: `${mingGua.guaName}命生气方在${label(sheng.direction)}，主振作与进取`,
      modern: "固定一个稳定的工作朝向能减少每次落座时的环境重新定位成本",
      evidence: "双重支撑",
    },
    {
      id: "fs-bed-tianyi",
      target: `${label(tianyi.direction)}（天医方）`,
      action: `床头靠${label(tianyi.direction)}一侧的实墙，头顶避开横梁与吊柜`,
      effort: "挪动",
      tenancy: "租房可做",
      traditional: `${mingGua.guaName}命天医方在${label(tianyi.direction)}，主安稳休养`,
      modern: "床头贴实墙可降低睡眠中对背后空间的低度警觉",
      evidence: "双重支撑",
    },
    {
      id: "fs-worst-static",
      target: `${label(worst.direction)}（${worst.star}方）`,
      action: `把储物柜、少用的杂物挪到${label(worst.direction)}，别把每天久待的位置放在这里`,
      effort: "挪动",
      tenancy: "租房可做",
      traditional: `${label(worst.direction)}为${mingGua.guaName}命的${worst.star}方，宜静宜压`,
      modern: null,
      evidence: "传统象征",
    },
  ];

  if (affinity.favorableDirections.length) {
    out.push({
      id: "fs-color-favorable",
      target: "常用物件配色",
      action: `寝具、窗帘、桌面小物往${affinity.favorableColors.slice(0, 3).join("、")}靠，材质可选${affinity.favorableMaterials.slice(0, 3).join("、")}`,
      effort: "添置",
      tenancy: "租房可做",
      traditional: `命局喜用${affinity.favorableElements.join("、")}，色与材同气相求`,
      modern: null,
      evidence: "传统象征",
    });
  }

  if (affinity.unfavorableColors.length) {
    out.push({
      id: "fs-color-avoid",
      target: "配色减法",
      action: `大面积的${affinity.unfavorableColors.slice(0, 2).join("、")}少用，尤其是卧室主色`,
      effort: "零成本",
      tenancy: "租房可做",
      traditional: `命局忌${affinity.unfavorableElements.join("、")}`,
      modern: null,
      evidence: "传统象征",
    });
  }

  // 注意：用 continue 收窄而非 .filter —— TS 不会通过 .filter 收窄判别联合，
  // 那样 a.modern 仍是 string|null，无法匹配 Remedy 的「双重支撑 ⇒ modern: string」分支。
  let picked = 0;
  for (const [i, a] of ENV_PSYCH_ANCHORS.entries()) {
    if (a.evidence !== "双重支撑") continue;
    if (picked >= 4) break;
    picked += 1;
    out.push({
      id: `fs-anchor-${i}`,
      target: a.traditional,
      action: a.action,
      effort: a.effort, // 显式取自锚点，不从文案猜（见下方修正说明）
      tenancy: "租房可做",
      traditional: a.traditional,
      modern: a.modern,
      evidence: a.evidence,
    });
  }

  return sortRemedies(out);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-remedy.test.ts`
Expected: PASS — 5 passed

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/fengshui/remedy.ts packages/core/test/fengshui-remedy.test.ts
git commit -m "feat(fengshui): 化解方案生成与分级排序 [EP-fs-03]"
```

> **交付后修正（2026-08-14，评审两条 Important，用户裁定采纳）：**
> 1. **成本分级不再从文案推断。** 原写法 `a.traditional.includes("绿植") ? "添置" : "零成本"` 嗅探的是 `traditional` 字段，而真正暗示花钱的是 `action`——「西晒」这条的 action 是「加遮光帘」却会被标成零成本；且唯一能命中「绿植」的锚点因循环取满 4 条即 break 而永不可达，`"添置"` 分支实为死代码。改为 `EnvPsychAnchor` 上的显式 `effort` 字段。
> 2. **补排序第三级测试。** 三级规则里 id 升序那级原先无任何测试覆盖，而真实输出存在 effort 与 evidence 全同的并列条目，顺序正靠它决定。新增打平数据的测试。
> 另补一条测试断言锚点化解的 effort 必须等于锚点声明值，防止再退回推断式。

---

## Task 6: 物件顾问 `adviseObject`（弱版）

**Files:**
- Create: `packages/core/src/fengshui/object-advisor.ts`
- Test: `packages/core/test/fengshui-object.test.ts`

**Interfaces:**
- Consumes: `Direction`、`DIRECTION_LABEL`、`ElementAffinity`（Task 1）；`DirectionVerdict`（Task 3）
- Produces: `ObjectCategory`、`ObjectQuery`、`ObjectAdvice`、`adviseObject(input, query): ObjectAdvice`

**弱版含义：** 波 1 无居所，推荐方位只叠加「命卦四吉方 + 用神喜忌」。有居所后同一函数升级为落到具体房间方位（波 2 的 EP-fs-18），**签名不变**。

- [ ] **Step 1: 写失败测试**

创建 `packages/core/test/fengshui-object.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { directionsFor } from "../src/fengshui/eight-mansions";
import { elementDirections } from "../src/fengshui/directions";
import { adviseObject } from "../src/fengshui/object-advisor";

const base = {
  verdicts: directionsFor("坎"),
  affinity: elementDirections({ favorable: ["木", "水"], unfavorable: ["金", "火", "土"], method: "扶抑", note: "" }),
};

describe("EP-fs-04 物件顾问（弱版）", () => {
  it("原木书桌 → 五行木；推荐方位落在四吉方内", () => {
    const a = adviseObject(base, { category: "desk", material: "原木" });
    expect(a.elementOfObject).toBe("木");
    const good = new Set(["N", "S", "E", "SE"]);
    for (const r of a.recommendedDirections) expect(good.has(r.direction)).toBe(true);
    expect(a.recommendedDirections.length).toBeGreaterThan(0);
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

  it("忌神五行物件 → personalFit 提示节制，且 avoid 非空", () => {
    const a = adviseObject(base, { category: "lamp", material: "金属" });
    expect(a.personalFit).toMatch(/忌|节制|少/);
    expect(a.avoid.length).toBeGreaterThan(0);
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-object.test.ts`
Expected: FAIL — `Failed to resolve import "../src/fengshui/object-advisor"`

- [ ] **Step 3: 实现**

创建 `packages/core/src/fengshui/object-advisor.ts`：

```ts
import { DIRECTION_LABEL, ELEMENT_DIRECTIONS, type Direction, type ElementAffinity } from "./directions";
import type { DirectionVerdict } from "./eight-mansions";

/**
 * 物件顾问（EP-fs-04）。三层叠加：物件五行 × 品类硬规则 × 与命主的关系。
 * 全部确定性计算 —— LLM 只负责把结果说成人话。
 */

export const OBJECT_CATEGORIES = [
  "bed", "desk", "sofa", "mirror", "plant", "aquarium", "storage", "lamp", "art", "other",
] as const;
export type ObjectCategory = (typeof OBJECT_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ObjectCategory, string> = {
  bed: "床", desk: "书桌", sofa: "沙发", mirror: "镜子", plant: "绿植",
  aquarium: "鱼缸", storage: "储物柜", lamp: "灯具", art: "装饰画/摆件", other: "其他",
};

/** 品类硬规则（查表，非模型生成）。 */
const CATEGORY_RULES: Record<ObjectCategory, string[]> = {
  bed: ["床头贴实墙，头顶避开横梁与吊柜", "床不正对房门"],
  desk: ["坐位背靠实墙，不背对门与通道", "桌面留出可见的空白区"],
  sofa: ["沙发背后宜有实墙或高柜依托", "不正对入户门形成穿堂"],
  mirror: ["镜面不正对床，避免半醒时的突发反射", "不正对入户门"],
  plant: ["选好养的品种，枯萎及时更换", "不遮挡主要动线与光源"],
  aquarium: ["忌置于卧室，水声与光影影响睡眠", "需稳定维护，久置浑浊反成负担"],
  storage: ["宜置于凶方，宜静宜压", "高柜勿压床头与坐位"],
  lamp: ["卧室避免顶部强直射光", "夜间照明选低色温"],
  art: ["尖锐造型避开床与坐位正对方向", "内容宜静不宜躁"],
  other: ["避开主要动线，勿阻挡光源与通行"],
};

const MATERIAL_ELEMENT: Record<string, string> = {
  原木: "木", 实木: "木", 竹: "木", 藤: "木", 棉麻: "木", 纸: "木",
  皮革: "火", 塑料: "火",
  陶瓷: "土", 石材: "土", 大理石: "土", 水泥: "土",
  金属: "金", 不锈钢: "金", 铜: "金", 玻璃: "金", 镜面: "金",
  水: "水", 织物: "水",
};

const SHAPE_ELEMENT: Record<string, string> = {
  长条: "木", 竖高: "木", 尖锐: "火", 三角: "火",
  方: "土", 扁平: "土", 圆: "金", 弧形: "金", 波浪: "水", 不规则: "水",
};

export type ObjectQuery = {
  category: ObjectCategory;
  material?: string;
  color?: string;
  shape?: string;
  intendedDirection?: Direction;
};

export type ObjectAdvice = {
  category: ObjectCategory;
  categoryLabel: string;
  elementOfObject: string | null;
  recommendedDirections: { direction: Direction; label: string; reason: string }[];
  avoid: { direction: Direction; label: string; reason: string }[];
  categoryRules: string[];
  personalFit: string;
  /** 用户指定了摆放方位时，该方位的八宅判语 */
  intendedVerdict: DirectionVerdict | null;
};

export type ObjectAdviceInput = {
  verdicts: Record<Direction, DirectionVerdict>;
  affinity: ElementAffinity;
};

function elementOf(q: ObjectQuery): string | null {
  if (q.material && MATERIAL_ELEMENT[q.material]) return MATERIAL_ELEMENT[q.material]!;
  if (q.shape && SHAPE_ELEMENT[q.shape]) return SHAPE_ELEMENT[q.shape]!;
  return null;
}

export function adviseObject(input: ObjectAdviceInput, q: ObjectQuery): ObjectAdvice {
  const { verdicts, affinity } = input;
  const el = elementOf(q);
  const all = Object.values(verdicts);
  const good = all.filter((v) => v.auspicious).sort((a, b) => a.rank - b.rank);
  const bad = all.filter((v) => !v.auspicious).sort((a, b) => a.rank - b.rank);

  // 物件五行自身的方位（若可判），与四吉方取交集优先
  const elDirs = el ? (ELEMENT_DIRECTIONS[el] ?? []) : [];
  const preferred = good.filter((v) => elDirs.includes(v.direction));
  const picked = (preferred.length ? preferred : good).slice(0, 3);

  const isFavorable = el ? affinity.favorableElements.includes(el) : false;
  const isUnfavorable = el ? affinity.unfavorableElements.includes(el) : false;

  return {
    category: q.category,
    categoryLabel: CATEGORY_LABEL[q.category],
    elementOfObject: el,
    recommendedDirections: picked.map((v) => ({
      direction: v.direction,
      label: DIRECTION_LABEL[v.direction],
      reason: elDirs.includes(v.direction)
        ? `${v.star}方，且与物件五行${el}同气`
        : `${v.star}方`,
    })),
    avoid: bad.slice(0, 2).map((v) => ({
      direction: v.direction,
      label: DIRECTION_LABEL[v.direction],
      reason: `${v.star}方，久待或重器不宜`,
    })),
    categoryRules: CATEGORY_RULES[q.category],
    personalFit: el === null
      ? "材质与造型未定，先按四吉方摆放即可；定下来后可再看五行是否顺你的喜用。"
      : isFavorable
        ? `物件五行为${el}，正是你命局喜用，可放心多用。`
        : isUnfavorable
          ? `物件五行为${el}，属你命局所忌，宜节制体量与面积，少作主色。`
          : `物件五行为${el}，对你不偏不倚，按方位与用途安排即可。`,
    intendedVerdict: q.intendedDirection ? verdicts[q.intendedDirection] : null,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-object.test.ts`
Expected: PASS — 8 passed

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/fengshui/object-advisor.ts packages/core/test/fengshui-object.test.ts
git commit -m "feat(fengshui): 物件顾问弱版（五行×品类规则×命卦吉方）[EP-fs-04]"
```

> **交付后修正（2026-08-14，评审两条 Important）：生产逻辑无误，问题在测试断言太弱。**
> 1. 原「推荐方位落在四吉方内」在**交集分支与退回分支下都成立**（`preferred ⊆ good`，退回时直接返回 `good`），把交集逻辑整个删掉也测不出来。改为断言恰好等于交集 `{E, SE}`，并新增一条无交集场景（金属物件对坎命）断言正确退回且 `reason` 不谎称「同气」。
> 2. 原 `expect(a.avoid.length).toBeGreaterThan(0)` 恒真——`avoid` 只由命卦四凶方决定，与物件五行无关，八宅必出 4 个凶方。改为断言喜用/忌神两种物件的 `avoid` 相同、而 `personalFit` 不同，真正区分二者职责。
> 已用变异测试验证：删掉退回分支 → 2 条测试失败；改成永不取交集 → 1 条失败。旧断言两种变异都抓不到。

---

## Task 7: `computeFengshui` 汇总与 barrel 导出

**Files:**
- Create: `packages/core/src/fengshui/index.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/fengshui-compute.test.ts`

**Interfaces:**
- Consumes: Task 1–6 全部
- Produces: `FENGSHUI_ENGINE_VERSION`、`FengshuiInput`、`FengshuiChart`、`computeFengshui(input): FengshuiChart`；并从 `@eamvp/core` 顶层导出上述全部符号

**`FENGSHUI_ENGINE_VERSION` 用途：** 波 1 报告存 localStorage，缓存键含此版本号；引擎表一改就自动失效。

- [ ] **Step 1: 写失败测试**

创建 `packages/core/test/fengshui-compute.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, computeFengshui, FENGSHUI_ENGINE_VERSION, type BirthInput } from "../src/index";

const mk = (over: Partial<BirthInput> = {}): BirthInput =>
  BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false, ...over });

const run = (over: Partial<BirthInput> = {}) => {
  const b = mk(over);
  return computeFengshui({ birth: b, chart: computeUnifiedChart(b) });
};

describe("EP-fs-03 computeFengshui Layer 0", () => {
  it("layer 恒为 0，且不含 dwelling / cohabitants", () => {
    const f = run();
    expect(f.layer).toBe(0);
    expect(f.dwelling).toBeUndefined();
    expect(f.cohabitants).toBeUndefined();
  });

  it("命卦、八方判语、用神方位、化解齐备", () => {
    const f = run();
    expect(f.mingGua.guaName).toBe("坎");
    expect(Object.keys(f.personalDirections)).toHaveLength(8);
    expect(f.elementAffinity.favorableElements.length).toBeGreaterThan(0);
    expect(f.remedies.length).toBeGreaterThanOrEqual(4);
  });

  it("纯函数：同输入两次调用结果深度相等", () => {
    expect(run()).toEqual(run());
  });

  it("男女命卦不同 → 方位判语不同", () => {
    const m = run({ gender: "male" });
    const f = run({ gender: "female" });
    expect(m.mingGua.gua).not.toBe(f.mingGua.gua);
  });

  it("引擎版本号存在且为字符串", () => {
    expect(typeof FENGSHUI_ENGINE_VERSION).toBe("string");
    expect(FENGSHUI_ENGINE_VERSION.length).toBeGreaterThan(0);
  });

  it("不含时辰（time=null）时仍可算 —— 命卦只依赖年与性别", () => {
    const f = run({ time: null });
    expect(f.mingGua.gua).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-compute.test.ts`
Expected: FAIL — `computeFengshui is not exported by "../src/index"`

- [ ] **Step 3: 实现汇总模块**

创建 `packages/core/src/fengshui/index.ts`：

```ts
import type { BirthInput } from "../types/birth-input";
import type { UnifiedChart } from "../types/chart";
import { deriveUsefulElements } from "../bazi/useful-elements";
import { elementDirections, type Direction, type ElementAffinity } from "./directions";
import { deriveMingGua, type MingGua } from "./ming-gua";
import { directionsFor, type DirectionVerdict } from "./eight-mansions";
import { buildPersonalRemedies, type Remedy } from "./remedy";

export * from "./directions";
export * from "./ming-gua";
export * from "./eight-mansions";
export * from "./env-psych";
export * from "./remedy";
export * from "./object-advisor";

/**
 * 风水引擎版本。改动命卦公式 / 游年表 / 化解生成规则时**必须**递增，
 * 用于让 web 端 localStorage 报告缓存自动失效。
 */
export const FENGSHUI_ENGINE_VERSION = "fs-1";

export type FengshuiInput = {
  birth: BirthInput;
  chart: UnifiedChart;
};

export type FengshuiChart = {
  layer: 0;
  engineVersion: string;
  mingGua: MingGua;
  personalDirections: Record<Direction, DirectionVerdict>;
  elementAffinity: ElementAffinity;
  remedies: Remedy[];
  /** Layer 1 起才有；波 1 恒为 undefined */
  dwelling?: undefined;
  cohabitants?: undefined;
};

/**
 * 风水派生层顶层入口（Layer 0）。纯函数，可按 (birth, chart) 缓存。
 * 与 deriveSpirit 同层 —— 不进冻结命盘、不改 UnifiedChart。
 */
export function computeFengshui(input: FengshuiInput): FengshuiChart {
  const mingGua = deriveMingGua(input.birth, input.chart);
  const personalDirections = directionsFor(mingGua.guaName);
  const affinity = elementDirections(deriveUsefulElements(input.chart.bazi));
  return {
    layer: 0,
    engineVersion: FENGSHUI_ENGINE_VERSION,
    mingGua,
    personalDirections,
    elementAffinity: affinity,
    remedies: buildPersonalRemedies(mingGua, personalDirections, affinity),
  };
}
```

> **为什么用 `input.chart.bazi` 而非重新排盘：** `deriveUsefulElements` 收的正是 `BaziChart`（`packages/core/src/bazi/useful-elements.ts:25`），而 `UnifiedChart.bazi` 就是该类型。复用传入命盘既省一次排盘，也保证与命盘页展示的用神完全一致。

- [ ] **Step 4: 接到顶层 barrel**

修改 `packages/core/src/index.ts`，在 `deriveSelfPortrait` 那组导出之后（约 24 行）插入：

```ts
export {
  computeFengshui, FENGSHUI_ENGINE_VERSION,
  deriveMingGua, ganzhiOfYear, directionsFor, elementDirections, adviseObject,
  buildPersonalRemedies, sortRemedies,
  DIRECTIONS, DIRECTION_LABEL, OPPOSITE, GUAS, GUA_DIRECTION, DIRECTION_GUA,
  EIGHT_MANSIONS, AUSPICIOUS_STARS, INAUSPICIOUS_STARS,
  ENV_PSYCH_ANCHORS, FENGSHUI_GUARDRAILS,
  OBJECT_CATEGORIES, CATEGORY_LABEL,
} from "./fengshui/index";
export type {
  FengshuiInput, FengshuiChart, MingGua, Gua, Direction, DirectionVerdict, Star,
  ElementAffinity, Remedy, Effort, EnvPsychAnchor,
  ObjectCategory, ObjectQuery, ObjectAdvice, ObjectAdviceInput,
} from "./fengshui/index";
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-compute.test.ts`
Expected: PASS — 6 passed

- [ ] **Step 6: 跑全量 core 测试与类型检查**

Run: `pnpm --filter @eamvp/core test`
Expected: 既有全部测试仍通过（本波新增前基线 66 项），新增 fengshui 六个测试文件全绿

Run: `pnpm typecheck`
Expected: 无输出（通过）

- [ ] **Step 7: 提交**

```bash
git add packages/core/src/fengshui/index.ts packages/core/src/index.ts packages/core/test/fengshui-compute.test.ts
git commit -m "feat(fengshui): computeFengshui Layer0 汇总 + core barrel 导出 [EP-fs-03]"
```

---

## Task 8: `extractFengshuiFacts`

**Files:**
- Create: `packages/llm/src/fengshui/facts.ts`
- Test: `packages/llm/src/fengshui/facts.test.ts`

**Interfaces:**
- Consumes: `FengshuiChart`、`DIRECTION_LABEL`、`DIRECTIONS`（`@eamvp/core`，Task 7 已导出）
- Produces: `FengshuiFacts`、`extractFengshuiFacts(f: FengshuiChart): FengshuiFacts`

**反幻觉要求：** 只喂带标签的结论；不含出生日期/时间/地点/昵称等 PII，也不含用于中间推导的原始数值。

- [ ] **Step 1: 写失败测试**

创建 `packages/llm/src/fengshui/facts.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, computeFengshui } from "@eamvp/core";
import { extractFengshuiFacts } from "./facts";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const fs = computeFengshui({ birth, chart: computeUnifiedChart(birth) });

describe("EP-fs-05 extractFengshuiFacts", () => {
  it("含命卦、八方判语、喜忌与化解", () => {
    const f = extractFengshuiFacts(fs);
    expect(f.mingGua).toContain("坎");
    expect(f.directions).toHaveLength(8);
    expect(f.favorableElements.length).toBeGreaterThan(0);
    expect(f.remedies.length).toBeGreaterThan(0);
  });

  it("每条方位事实带中文方位名与星名", () => {
    const f = extractFengshuiFacts(fs);
    const se = f.directions.find((d) => d.direction === "SE")!;
    expect(se.label).toBe("东南");
    expect(se.star).toBeTruthy();
    expect(typeof se.auspicious).toBe("boolean");
  });

  it("不泄漏 PII：序列化后不含出生日期/时间", () => {
    const s = JSON.stringify(extractFengshuiFacts(fs));
    expect(s).not.toContain("1990-06-15");
    expect(s).not.toContain("14:30");
  });

  it("化解事实保留 evidence 标注，传统象征的 modern 为 null", () => {
    const f = extractFengshuiFacts(fs);
    for (const r of f.remedies) {
      expect(["双重支撑", "传统象征"]).toContain(r.evidence);
      if (r.evidence === "传统象征") expect(r.modern).toBeNull();
    }
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/llm exec vitest run src/fengshui/facts.test.ts`
Expected: FAIL — `Failed to resolve import "./facts"`

- [ ] **Step 3: 实现**

创建 `packages/llm/src/fengshui/facts.ts`：

```ts
import { DIRECTIONS, DIRECTION_LABEL, type Direction, type FengshuiChart } from "@eamvp/core";

/**
 * 把 FengshuiChart 压成「带标签的承重事实」（EP-fs-05）。
 * 与 extractFacts 同思路：模型只准引用这里出现的方位与星名，不得自行推算。
 * 刻意剔除 PII（出生日期/时间/地点）与中间推导数值。
 */

export type FengshuiFacts = {
  layer: 0;
  mingGua: string;          // 「坎1（东四命）」
  guaGroup: string;
  bestDirection: string;    // 生气方中文名
  directions: { direction: Direction; label: string; star: string; auspicious: boolean; rank: number }[];
  favorableElements: string[];
  unfavorableElements: string[];
  favorableDirections: string[];
  favorableColors: string[];
  favorableMaterials: string[];
  unfavorableColors: string[];
  remedies: {
    id: string; target: string; action: string; effort: string;
    traditional: string; modern: string | null; evidence: string;
  }[];
};

export function extractFengshuiFacts(f: FengshuiChart): FengshuiFacts {
  const dirs = DIRECTIONS.map((d) => {
    const v = f.personalDirections[d];
    return { direction: d, label: DIRECTION_LABEL[d], star: v.star, auspicious: v.auspicious, rank: v.rank };
  });
  const sheng = dirs.find((d) => d.star === "生气");
  return {
    layer: 0,
    mingGua: `${f.mingGua.guaName}${f.mingGua.gua}`,
    guaGroup: f.mingGua.group,
    bestDirection: sheng?.label ?? "",
    directions: dirs,
    favorableElements: f.elementAffinity.favorableElements,
    unfavorableElements: f.elementAffinity.unfavorableElements,
    favorableDirections: f.elementAffinity.favorableDirections.map((d) => DIRECTION_LABEL[d]),
    favorableColors: f.elementAffinity.favorableColors,
    favorableMaterials: f.elementAffinity.favorableMaterials,
    unfavorableColors: f.elementAffinity.unfavorableColors,
    remedies: f.remedies.map((r) => ({
      id: r.id, target: r.target, action: r.action, effort: r.effort,
      traditional: r.traditional, modern: r.modern, evidence: r.evidence,
    })),
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @eamvp/llm exec vitest run src/fengshui/facts.test.ts`
Expected: PASS — 4 passed

- [ ] **Step 5: 提交**

```bash
git add packages/llm/src/fengshui/facts.ts packages/llm/src/fengshui/facts.test.ts
git commit -m "feat(fengshui): extractFengshuiFacts 承重事实提取 [EP-fs-05]"
```

---

## Task 9: 风水三分节 prompt

**Files:**
- Create: `packages/llm/src/fengshui/prompt.ts`
- Test: `packages/llm/src/fengshui/prompt.test.ts`

**Interfaces:**
- Consumes: `FengshuiFacts`（Task 8）；`FENGSHUI_GUARDRAILS`（`@eamvp/core`）；`ReadingLanguage`（`../prompt`）
- Produces: `FENGSHUI_SECTION_KEYS`、`FengshuiSectionKey`、`buildFengshuiSystemPrompt(language)`、`buildFengshuiUserPrompt(facts, opts?)`、`parseFengshuiSections(markdown, language)`

分节：**形势 / 境与你 / 可做的事**（对应 `situation` / `youAndSpace` / `actions`），与既有四分节解读同构。

- [ ] **Step 1: 写失败测试**

创建 `packages/llm/src/fengshui/prompt.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, computeFengshui } from "@eamvp/core";
import { extractFengshuiFacts } from "./facts";
import { buildFengshuiSystemPrompt, buildFengshuiUserPrompt, parseFengshuiSections, FENGSHUI_SECTION_KEYS } from "./prompt";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const facts = extractFengshuiFacts(computeFengshui({ birth, chart: computeUnifiedChart(birth) }));

describe("EP-fs-05 风水 prompt", () => {
  it("三个分节键", () => {
    expect(FENGSHUI_SECTION_KEYS).toEqual(["situation", "youAndSpace", "actions"]);
  });

  it("system prompt 含守护栏关键约束", () => {
    const s = buildFengshuiSystemPrompt("zh");
    expect(s).toContain("传统象征");
    expect(s).toMatch(/研究表明|科学证明/);
    expect(s).toMatch(/免责|不构成/);
  });

  it("system prompt 明令只用给定方位事实", () => {
    expect(buildFengshuiSystemPrompt("zh")).toMatch(/不得自行推算|禁止自行/);
  });

  it("user prompt 带入命卦与八方判语", () => {
    const u = buildFengshuiUserPrompt(facts);
    expect(u).toContain("坎");
    expect(u).toContain("东南"); // 坎命生气方
    expect(u).toContain("生气");
  });

  it("user prompt 对传统象征条目显式标注", () => {
    const u = buildFengshuiUserPrompt(facts);
    expect(u).toContain("传统象征");
  });

  it("parseFengshuiSections 按 H2 切三节，缺节置空", () => {
    const md = "## 形势\n甲\n\n## 境与你\n乙\n";
    const s = parseFengshuiSections(md, "zh");
    expect(s.situation.trim()).toBe("甲");
    expect(s.youAndSpace.trim()).toBe("乙");
    expect(s.actions).toBe("");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/llm exec vitest run src/fengshui/prompt.test.ts`
Expected: FAIL — `Failed to resolve import "./prompt"`

- [ ] **Step 3: 实现**

创建 `packages/llm/src/fengshui/prompt.ts`：

```ts
import { FENGSHUI_GUARDRAILS } from "@eamvp/core";
import type { ReadingLanguage } from "../prompt";
import type { FengshuiFacts } from "./facts";

export const FENGSHUI_SECTION_KEYS = ["situation", "youAndSpace", "actions"] as const;
export type FengshuiSectionKey = (typeof FENGSHUI_SECTION_KEYS)[number];

const SECTION_HEADERS: Record<ReadingLanguage, Record<FengshuiSectionKey, string>> = {
  zh: { situation: "形势", youAndSpace: "境与你", actions: "可做的事" },
  en: { situation: "The Layout", youAndSpace: "You and Your Space", actions: "What You Can Do" },
};

export function buildFengshuiSystemPrompt(language: ReadingLanguage = "zh"): string {
  const H = SECTION_HEADERS[language];
  const langLine = language === "zh" ? "全文用简体中文。" : "Write the whole answer in English.";
  return [
    "你是 Mira 的「境」声部 —— 谈人与居住空间的关系。你的材料全部由确定性计算层给出。",
    "",
    "【硬规则】",
    ...FENGSHUI_GUARDRAILS.map((g, i) => `${i + 1}. ${g}`),
    `${FENGSHUI_GUARDRAILS.length + 1}. 方位吉凶只能照用给定事实中的星名（生气/天医/延年/伏位/绝命/五鬼/六煞/祸害），不得自行推算、不得改写某方位对应的星。`,
    `${FENGSHUI_GUARDRAILS.length + 2}. 化解条目标注为「传统象征」的，只讲传统怎么说 + 这件事作为一种安顿自己的仪式意味着什么；禁止使用「研究表明」「科学证明」「临床」「实验显示」等措辞。`,
    "",
    "【输出格式】严格三个 H2 分节，顺序固定，不加其他标题：",
    `## ${H.situation}`,
    "客观交代命卦、所属东西四命、八方各自的星与吉凶。像陈述地形，不下判词。",
    `## ${H.youAndSpace}`,
    "把上面的形势翻译成日常体验：哪些方位久待更容易松弛、哪些更容易紧绷，并给出对应的现代解释（仅限事实中标注了现代机制的条目）。",
    `## ${H.actions}`,
    "列 4–6 条可做的事，零成本的排前面。每条写成一句可执行的动作，必要时在括号里标「传统象征」。",
    "",
    langLine,
    "结尾用一句话说明：这些是关于自我觉察与居住体验的建议，不构成专业意见。",
  ].join("\n");
}

export function buildFengshuiUserPrompt(facts: FengshuiFacts, opts?: { nickname?: string }): string {
  const dirLines = facts.directions
    .sort((a, b) => Number(b.auspicious) - Number(a.auspicious) || a.rank - b.rank)
    .map((d) => `- ${d.label}：${d.star}（${d.auspicious ? "吉" : "凶"}，第${d.rank}）`)
    .join("\n");
  const remLines = facts.remedies
    .map((r) => `- [${r.effort}][${r.evidence}] ${r.action}｜传统依据：${r.traditional}｜现代机制：${r.modern ?? "无（不得编造）"}`)
    .join("\n");
  return [
    `称呼：${opts?.nickname ?? "你"}`,
    `本命卦：${facts.mingGua}（${facts.guaGroup}）`,
    `八方判语：`,
    dirLines,
    ``,
    `命局喜用五行：${facts.favorableElements.join("、") || "中和，无明显扶抑"}`,
    `命局所忌五行：${facts.unfavorableElements.join("、") || "无"}`,
    `有利方位：${facts.favorableDirections.join("、") || "无"}`,
    `宜用色：${facts.favorableColors.join("、") || "无"}｜宜用材：${facts.favorableMaterials.join("、") || "无"}｜宜少用色：${facts.unfavorableColors.join("、") || "无"}`,
    ``,
    `候选化解（只准从这些里挑，可合并同类，不得新增）：`,
    remLines,
  ].join("\n");
}

/** 按三个 H2 切分节，缺节置空（容错，与 parseSections 同策略）。 */
export function parseFengshuiSections(
  markdown: string,
  language: ReadingLanguage = "zh",
): Record<FengshuiSectionKey, string> {
  const H = SECTION_HEADERS[language];
  const out: Record<FengshuiSectionKey, string> = { situation: "", youAndSpace: "", actions: "" };
  let current: FengshuiSectionKey | null = null;
  for (const line of markdown.split("\n")) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) {
      const title = m[1]!.trim();
      current = FENGSHUI_SECTION_KEYS.find((k) => title.includes(H[k]) || H[k].includes(title)) ?? null;
      continue;
    }
    if (current) out[current] += line + "\n";
  }
  return out;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @eamvp/llm exec vitest run src/fengshui/prompt.test.ts`
Expected: PASS — 6 passed

- [ ] **Step 5: 提交**

```bash
git add packages/llm/src/fengshui/prompt.ts packages/llm/src/fengshui/prompt.test.ts
git commit -m "feat(fengshui): 风水三分节 prompt + 守护栏接线 [EP-fs-05]"
```

---

## Task 10: 两道后置校验 `sanitizeFengshui` + `verifyDirectionConsistency`

**Files:**
- Create: `packages/llm/src/fengshui/guard.ts`
- Test: `packages/llm/src/fengshui/guard.test.ts`

**Interfaces:**
- Consumes: `FengshuiFacts`（Task 8）
- Produces: `sanitizeFengshui(markdown, facts): string`、`verifyDirectionConsistency(markdown, facts): { text: string; corrections: DirectionCorrection[] }`、`DirectionCorrection`

**这是反幻觉链在风水侧的延伸，两条各解决一个问题：**
1. `sanitizeFengshui` —— 模型给「传统象征」条目配了科学措辞，删掉该措辞。
2. `verifyDirectionConsistency` —— 八方吉凶是查表来的，**模型输出可被机械对拍**：说「东南是绝命位」而表里是生气位，直接改回。这是命理解读做不到的确定性校验。

- [ ] **Step 1: 写失败测试**

创建 `packages/llm/src/fengshui/guard.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/llm exec vitest run src/fengshui/guard.test.ts`
Expected: FAIL — `Failed to resolve import "./guard"`

- [ ] **Step 3: 实现**

创建 `packages/llm/src/fengshui/guard.ts`：

```ts
import type { Direction } from "@eamvp/core";
import type { FengshuiFacts } from "./facts";

/**
 * 风水侧反幻觉后置两道（EP-fs-06）。
 * 与既有 sanitizeReading / correctMutagens 同层：确定性兜底，不依赖模型自觉。
 */

/** 「传统象征」条目禁用的伪科学措辞。 */
const PSEUDO_SCIENCE = [
  "研究表明", "研究显示", "科学证明", "科学研究", "实验显示", "实验证明",
  "临床", "数据显示", "已被证实", "医学证明",
];

/** 命中该行属于「传统象征」语境的标记。 */
const SYMBOLIC_MARKERS = ["传统象征", "象征意义", "仪式"];

/**
 * 删除「传统象征」语境下出现的伪科学措辞。
 * 判定为逐行：该行含象征标记 或 含事实中任一传统象征条目的动作片段。
 */
export function sanitizeFengshui(markdown: string, facts: FengshuiFacts): string {
  const symbolicActions = facts.remedies
    .filter((r) => r.evidence === "传统象征")
    .map((r) => r.action.slice(0, 8))
    .filter(Boolean);

  return markdown
    .split("\n")
    .map((line) => {
      const isSymbolic =
        SYMBOLIC_MARKERS.some((m) => line.includes(m)) ||
        symbolicActions.some((a) => line.includes(a));
      if (!isSymbolic) return line;
      let out = line;
      for (const w of PSEUDO_SCIENCE) {
        // 连同其后的逗号/顿号一并去掉，避免留下断句
        out = out.replace(new RegExp(`${w}[，,、]?`, "g"), "");
      }
      return out;
    })
    .join("\n");
}

export type DirectionCorrection = {
  direction: Direction;
  label: string;
  wrote: string;
  correct: string;
};

const ALL_STARS = ["生气", "天医", "延年", "伏位", "绝命", "五鬼", "六煞", "祸害"];

/**
 * 方位一致性校验：八方吉凶来自查表，模型输出可机械对拍。
 * 匹配「<方位名><连接词><星名>」，连接词可为 为/是/属/的 或直接相连。
 */
export function verifyDirectionConsistency(
  markdown: string,
  facts: FengshuiFacts,
): { text: string; corrections: DirectionCorrection[] } {
  const corrections: DirectionCorrection[] = [];
  let text = markdown;

  // 长名优先，避免「东」先于「东南」匹配
  const byLabel = [...facts.directions].sort((a, b) => b.label.length - a.label.length);

  for (const d of byLabel) {
    const pattern = new RegExp(`(${d.label})(方|方位)?(为|是|属|系)?(${ALL_STARS.join("|")})`, "g");
    text = text.replace(pattern, (match, label, suffix, linker, star) => {
      if (star === d.star) return match;
      corrections.push({ direction: d.direction, label: d.label, wrote: star, correct: d.star });
      return `${label}${suffix ?? ""}${linker ?? ""}${d.star}`;
    });
  }

  return { text, corrections };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @eamvp/llm exec vitest run src/fengshui/guard.test.ts`
Expected: PASS — 7 passed

> 若「东南是生气位」用例失败，多半是长名优先排序没生效（「东」抢先匹配了「东南」的前半）。检查 `byLabel` 的排序方向。

- [ ] **Step 5: 提交**

```bash
git add packages/llm/src/fengshui/guard.ts packages/llm/src/fengshui/guard.test.ts
git commit -m "feat(fengshui): 伪科学措辞净化 + 方位一致性机械对拍 [EP-fs-06]"
```

---

## Task 11: `generateFengshuiReading` 与 llm barrel

**Files:**
- Create: `packages/llm/src/fengshui/index.ts`
- Modify: `packages/llm/src/index.ts`
- Test: `packages/llm/src/fengshui/index.test.ts`

**Interfaces:**
- Consumes: Task 8–10 全部；`resolveLlmConfig` / `isLlmConfigured`（`../provider`）、`chat`（`../client`）
- Produces: `generateFengshuiReading(f, opts?): Promise<{ markdown: string; sections: Record<FengshuiSectionKey, string>; corrections: DirectionCorrection[] }>`、`adviseObjectText(advice, opts?): Promise<string>`；并从 `@eamvp/llm` 顶层导出

- [ ] **Step 1: 写失败测试**（用注入的假 config + mock `chat` 避免真实网络）

创建 `packages/llm/src/fengshui/index.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BirthInputSchema, computeUnifiedChart, computeFengshui } from "@eamvp/core";

const chatMock = vi.fn();
vi.mock("../client", () => ({ chat: (...a: unknown[]) => chatMock(...a) }));

const { generateFengshuiReading } = await import("./index");

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const fs = computeFengshui({ birth, chart: computeUnifiedChart(birth) });
const cfg = { provider: "anthropic", wire: "anthropic", model: "m", baseUrl: "http://x", apiKey: "k" } as never;

beforeEach(() => chatMock.mockReset());

describe("EP-fs-05 generateFengshuiReading", () => {
  it("切出三分节", async () => {
    chatMock.mockResolvedValue("## 形势\n甲\n\n## 境与你\n乙\n\n## 可做的事\n- 丙\n");
    const r = await generateFengshuiReading(fs, { config: cfg, language: "zh" });
    expect(r.sections.situation.trim()).toBe("甲");
    expect(r.sections.actions.trim()).toBe("- 丙");
  });

  it("方位说错时自动纠正并记录", async () => {
    const e = fs.personalDirections.E;
    const wrong = e.star === "绝命" ? "五鬼" : "绝命";
    chatMock.mockResolvedValue(`## 形势\n东为${wrong}方。\n\n## 境与你\n乙\n\n## 可做的事\n- 丙\n`);
    const r = await generateFengshuiReading(fs, { config: cfg, language: "zh" });
    expect(r.corrections.length).toBeGreaterThan(0);
    expect(r.markdown).toContain(`东为${e.star}方`);
  });

  it("伪科学措辞被清除", async () => {
    chatMock.mockResolvedValue("## 形势\n甲\n\n## 境与你\n乙\n\n## 可做的事\n- 放金属摆件（传统象征）。研究表明有效。\n");
    const r = await generateFengshuiReading(fs, { config: cfg, language: "zh" });
    expect(r.markdown).not.toContain("研究表明");
  });

  it("LLM 未配置时抛错（调用方据此走确定性降级）", async () => {
    await expect(generateFengshuiReading(fs, { config: { apiKey: "" } as never })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/llm exec vitest run src/fengshui/index.test.ts`
Expected: FAIL — `Failed to resolve import "./index"`

- [ ] **Step 3: 实现**

创建 `packages/llm/src/fengshui/index.ts`：

```ts
import type { FengshuiChart, ObjectAdvice } from "@eamvp/core";
import { resolveLlmConfig, isLlmConfigured, type LlmConfig } from "../provider";
import { chat } from "../client";
import type { ReadingLanguage } from "../prompt";
import { extractFengshuiFacts, type FengshuiFacts } from "./facts";
import {
  buildFengshuiSystemPrompt, buildFengshuiUserPrompt, parseFengshuiSections,
  FENGSHUI_SECTION_KEYS, type FengshuiSectionKey,
} from "./prompt";
import { sanitizeFengshui, verifyDirectionConsistency, type DirectionCorrection } from "./guard";

export * from "./facts";
export * from "./prompt";
export * from "./guard";

export type FengshuiReadingOptions = {
  config?: LlmConfig;
  language?: ReadingLanguage;
  nickname?: string;
};

export type FengshuiReading = {
  markdown: string;
  sections: Record<FengshuiSectionKey, string>;
  corrections: DirectionCorrection[];
};

/**
 * 生成风水报告（EP-fs-05）。反幻觉链：facts → prompt 硬规则 → sanitize → 方位对拍。
 * 抛错即代表无法生成 —— 调用方应降级为纯确定性呈现（盘图 + 化解清单），而非空页。
 */
export async function generateFengshuiReading(
  f: FengshuiChart,
  opts?: FengshuiReadingOptions,
): Promise<FengshuiReading> {
  const cfg = opts?.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置");
  const language = opts?.language ?? "zh";
  const facts = extractFengshuiFacts(f);

  const raw = await chat(cfg, [
    { role: "system", content: buildFengshuiSystemPrompt(language) },
    { role: "user", content: buildFengshuiUserPrompt(facts, { nickname: opts?.nickname }) },
  ], { maxTokens: 1600, temperature: 0.7 });

  const cleaned = sanitizeFengshui(raw, facts);
  const { text, corrections } = verifyDirectionConsistency(cleaned, facts);
  return { markdown: text, sections: parseFengshuiSections(text, language), corrections };
}

/** 物件顾问的说人话层（EP-fs-04）。短输出、低成本，调用方可缓存。 */
export async function adviseObjectText(
  advice: ObjectAdvice,
  opts?: { config?: LlmConfig; language?: ReadingLanguage; nickname?: string },
): Promise<string> {
  const cfg = opts?.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置");

  const sys =
    "你是 Mira 的「境」声部。把给定的物件摆放结论写成 2–3 句自然中文，" +
    "口吻平实、可执行、非决定论。只准使用给定的方位与规则，不得新增方位或断言吉凶后果。" +
    "不用「一定/必然/注定」，不谈医疗财务。只输出这几句本身。";
  const user = [
    `物件：${advice.categoryLabel}`,
    `五行：${advice.elementOfObject ?? "未定"}`,
    `推荐方位：${advice.recommendedDirections.map((r) => `${r.label}（${r.reason}）`).join("；") || "无"}`,
    `不宜方位：${advice.avoid.map((r) => `${r.label}（${r.reason}）`).join("；") || "无"}`,
    `品类规则：${advice.categoryRules.join("；")}`,
    `与命主关系：${advice.personalFit}`,
    advice.intendedVerdict
      ? `用户想放在：${advice.intendedVerdict.direction}，该方为${advice.intendedVerdict.star}（${advice.intendedVerdict.auspicious ? "吉" : "凶"}）`
      : "",
  ].filter(Boolean).join("\n");

  const raw = await chat(cfg, [
    { role: "system", content: sys },
    { role: "user", content: user },
  ], { maxTokens: 320, temperature: 0.8 });
  return raw.trim();
}

export { FENGSHUI_SECTION_KEYS };
export type { FengshuiSectionKey, FengshuiFacts, DirectionCorrection };
```

- [ ] **Step 4: 接到 llm barrel**

修改 `packages/llm/src/index.ts`，在 `extractTimelineFacts` 那行之后追加：

```ts
export {
  generateFengshuiReading, adviseObjectText, extractFengshuiFacts,
  buildFengshuiSystemPrompt, buildFengshuiUserPrompt, parseFengshuiSections,
  sanitizeFengshui, verifyDirectionConsistency, FENGSHUI_SECTION_KEYS,
} from "./fengshui/index";
export type {
  FengshuiFacts, FengshuiReading, FengshuiReadingOptions, FengshuiSectionKey, DirectionCorrection,
} from "./fengshui/index";
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @eamvp/llm exec vitest run src/fengshui/index.test.ts`
Expected: PASS — 4 passed

- [ ] **Step 6: 跑全量 llm 测试与类型检查**

Run: `pnpm --filter @eamvp/llm test`
Expected: 既有测试仍全绿（本波新增前基线 39 项）+ 新增 fengshui 四个测试文件

Run: `pnpm typecheck`
Expected: 无输出（通过）

- [ ] **Step 7: 提交**

```bash
git add packages/llm/src/fengshui/index.ts packages/llm/src/fengshui/index.test.ts packages/llm/src/index.ts
git commit -m "feat(fengshui): generateFengshuiReading + adviseObjectText + llm barrel [EP-fs-05]"
```

---

## Task 12: i18n 文案与导航「境」

**Files:**
- Modify: `apps/web/lib/i18n/messages/zh.ts`、`apps/web/lib/i18n/messages/en.ts`、`apps/web/components/AppShell.tsx`
- Test: `apps/web/components/__tests__/AppShell.test.tsx`（新建）

**Interfaces:**
- Produces: i18n 顶层命名空间 `fengshui`；`nav.fengshui` 键；导航项 `{ href: "/fengshui", char: "境", key: "nav.fengshui" }`（受 flag 门控）

- [ ] **Step 1: 写失败测试**

创建 `apps/web/components/__tests__/AppShell.test.tsx`：

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider locale="zh">{children}</I18nProvider>
);

afterEach(() => vi.resetModules());

describe("EP-fs-07 导航「境」flag 门控", () => {
  it("flag 关闭时导航不含「境」", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "");
    const { AppShell } = await import("../AppShell");
    render(<AppShell><div /></AppShell>, { wrapper: Wrapper });
    expect(screen.queryByLabelText("境")).toBeNull();
    vi.unstubAllEnvs();
  });

  it("flag 开启时导航含「境」且指向 /fengshui", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
    vi.resetModules();
    const { AppShell } = await import("../AppShell");
    render(<AppShell><div /></AppShell>, { wrapper: Wrapper });
    const links = screen.getAllByLabelText("境");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]!.getAttribute("href")).toBe("/fengshui");
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/web exec vitest run components/__tests__/AppShell.test.tsx`
Expected: FAIL — 找不到 aria-label 为「境」的元素

- [ ] **Step 3: 加 i18n 文案**

在 `apps/web/lib/i18n/messages/zh.ts` 的 `nav` 命名空间内加一行：

```ts
    fengshui: "境",
```

在同文件顶层（与 `spirit:` 平级）追加：

```ts
  fengshui: {
    title: "境",
    subtitle: "本命方位 · 人与空间",
    notEnabled: "「境」尚未开启。",
    loadingProfile: "读取档案中…",
    noProfile: "还没有命盘档案，先起一个盘。",
    goCast: "去起盘",
    mingGua: "本命卦",
    group: { east: "东四命", west: "西四命" },
    bestDirection: "生气方",
    tabs: { chart: "盘", remedy: "化解", object: "添置" },
    directionsTitle: "八方吉凶",
    affinityTitle: "宜用色与材",
    remedyTitle: "可做的事",
    effortLabel: { 零成本: "零成本", 挪动: "挪动", 添置: "添置", 装修: "装修" },
    evidenceSymbolic: "传统象征",
    evidenceBoth: "传统 + 现代",
    modernLabel: "现代机制",
    traditionalLabel: "传统依据",
    askMira: "和 Mira 聊聊这条",
    narrativeFailed: "叙述暂时生成不出来，下面的盘与建议不受影响。",
    regenerate: "重新生成叙述",
    disclaimer: "以上用于自我觉察与居住体验改善，不构成专业建议。",
    object: {
      title: "我想添置…",
      subtitle: "说说物件，给你落位建议",
      category: "品类",
      material: "材质",
      color: "颜色",
      shape: "造型",
      intendedDirection: "打算放在",
      unspecified: "不指定",
      submit: "看看放哪儿好",
      elementOf: "物件五行",
      recommended: "推荐方位",
      avoid: "不宜方位",
      rules: "这类物件的讲究",
      fit: "与你的关系",
      intended: "你想放的位置",
    },
  },
```

在 `apps/web/lib/i18n/messages/en.ts` 加**键结构完全一致**的英文版（`nav.fengshui: "Space"`；`title: "Space"`；`tabs: { chart: "Chart", remedy: "Remedies", object: "Add" }`；`askMira: "Ask Mira about this"`；命理专名 `生气/天医/绝命` 等**保留中文**，`effortLabel` 的键保持中文键名、值译为 `Free / Rearrange / Buy / Renovate`；`evidenceSymbolic: "Traditional symbolism"`、`evidenceBoth: "Traditional + modern"`）。

- [ ] **Step 4: 加导航项**

修改 `apps/web/components/AppShell.tsx` 的 `NAV` 常量（第 10–18 行），在 spirit 项之后、`/profiles` 之前插入：

```ts
  ...(process.env.NEXT_PUBLIC_FENGSHUI_ENABLED === "1"
    ? [{ href: "/fengshui", char: "境", key: "nav.fengshui" }]
    : []),
```

两个 flag 同开时底栏为 6 项，需为窄屏留出空间：把 `NavItem` 外层 `<Link>` 的 `px-2` 改为 `px-1.5`（第 72 行），其余样式不动。

```tsx
    <Link href={href} className="zj-nav flex flex-col items-center gap-1 px-1.5 py-1.5" aria-label={label}>
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @eamvp/web exec vitest run components/__tests__/AppShell.test.tsx`
Expected: PASS — 2 passed

- [ ] **Step 6: 提交**

```bash
git add apps/web/lib/i18n/messages/zh.ts apps/web/lib/i18n/messages/en.ts apps/web/components/AppShell.tsx apps/web/components/__tests__/AppShell.test.tsx
git commit -m "feat(fengshui): i18n fengshui 命名空间 + 导航「境」flag 门控 [EP-fs-07]"
```

---

## Task 13: 八方位盘图 `BaguaWheel`

**Files:**
- Create: `apps/web/components/charts/BaguaWheel.tsx`
- Test: `apps/web/components/charts/__tests__/BaguaWheel.test.tsx`

**Interfaces:**
- Consumes: `Direction`、`DirectionVerdict`、`DIRECTION_LABEL`（`@eamvp/core`）
- Produces: `BaguaWheel({ verdicts, size?, highlight? })`

八扇区 SVG，吉方朱色系、凶方墨灰系，中心显示命卦。与既有 `ZiweiBoard` / `NatalWheel` 同为 `components/charts/` 下的可视化。

- [ ] **Step 1: 写失败测试**

创建 `apps/web/components/charts/__tests__/BaguaWheel.test.tsx`：

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart, computeFengshui } from "@eamvp/core";
import { BaguaWheel } from "../BaguaWheel";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const fs = computeFengshui({ birth, chart: computeUnifiedChart(birth) });

describe("EP-fs-07 BaguaWheel", () => {
  it("渲染八个方位中文名", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    for (const label of ["北", "东北", "东", "东南", "南", "西南", "西", "西北"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("渲染八个星名", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    for (const s of ["生气", "天医", "延年", "伏位", "绝命", "五鬼", "六煞", "祸害"]) {
      expect(screen.getByText(s)).toBeInTheDocument();
    }
  });

  it("中心显示命卦", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    expect(screen.getByText("坎1")).toBeInTheDocument();
  });

  it("每个扇区带无障碍标签", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    const e = fs.personalDirections.E;
    expect(screen.getByLabelText(`东：${e.star}（${e.auspicious ? "吉" : "凶"}）`)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/web exec vitest run components/charts/__tests__/BaguaWheel.test.tsx`
Expected: FAIL — `Failed to resolve import "../BaguaWheel"`

- [ ] **Step 3: 实现**

创建 `apps/web/components/charts/BaguaWheel.tsx`：

```tsx
"use client";

import { DIRECTION_LABEL, type Direction, type DirectionVerdict } from "@eamvp/core";

/**
 * 八方位盘图（EP-fs-07）——「境」页视觉主体。
 * 八扇区按吉凶着色；确定性数据驱动，不依赖 LLM。
 */

/** 顺时针自正北起，与罗盘一致 */
const ORDER: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const R_OUT = 150;
const R_IN = 58;
const CX = 160;
const CY = 160;

function polar(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function sectorPath(index: number): string {
  const half = 22.5;
  const mid = index * 45;
  const a0 = mid - half;
  const a1 = mid + half;
  const [x0, y0] = polar(R_OUT, a0);
  const [x1, y1] = polar(R_OUT, a1);
  const [x2, y2] = polar(R_IN, a1);
  const [x3, y3] = polar(R_IN, a0);
  return `M ${x0} ${y0} A ${R_OUT} ${R_OUT} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${R_IN} ${R_IN} 0 0 0 ${x3} ${y3} Z`;
}

/** 吉方按 rank 由深到浅的朱色；凶方墨灰。 */
function fillOf(v: DirectionVerdict): string {
  if (!v.auspicious) return `rgba(60,58,54,${0.16 - v.rank * 0.02})`;
  return `rgba(203,70,54,${0.30 - v.rank * 0.05})`;
}

export function BaguaWheel({
  verdicts,
  centerLabel,
  size = 320,
}: {
  verdicts: Record<Direction, DirectionVerdict>;
  centerLabel: string;
  size?: number;
}) {
  return (
    <svg viewBox="0 0 320 320" width={size} height={size} role="img" aria-label="八方吉凶盘">
      {ORDER.map((d, i) => {
        const v = verdicts[d];
        const [lx, ly] = polar((R_OUT + R_IN) / 2, i * 45);
        return (
          <g key={d} aria-label={`${DIRECTION_LABEL[d]}：${v.star}（${v.auspicious ? "吉" : "凶"}）`}>
            <path d={sectorPath(i)} fill={fillOf(v)} stroke="var(--color-line)" strokeWidth={1} />
            <text
              x={lx} y={ly - 7} textAnchor="middle"
              style={{ fontFamily: "var(--font-serif)", fontSize: 15, fill: "var(--color-ink)" }}
            >
              {DIRECTION_LABEL[d]}
            </text>
            <text
              x={lx} y={ly + 12} textAnchor="middle"
              style={{ fontSize: 12, fill: v.auspicious ? "var(--color-cinnabar)" : "var(--color-muted)" }}
            >
              {v.star}
            </text>
          </g>
        );
      })}
      <circle cx={CX} cy={CY} r={R_IN - 4} fill="var(--color-surface)" stroke="var(--color-line)" />
      <text
        x={CX} y={CY + 8} textAnchor="middle"
        style={{ fontFamily: "var(--font-serif)", fontSize: 24, fill: "var(--color-ink)" }}
      >
        {centerLabel}
      </text>
    </svg>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @eamvp/web exec vitest run components/charts/__tests__/BaguaWheel.test.tsx`
Expected: PASS — 4 passed

- [ ] **Step 5: 提交**

```bash
git add apps/web/components/charts/BaguaWheel.tsx apps/web/components/charts/__tests__/BaguaWheel.test.tsx
git commit -m "feat(fengshui): 八方位盘图 BaguaWheel [EP-fs-07]"
```

---

## Task 14: 「境」页与报告接口

**Files:**
- Create: `apps/web/lib/fengshui-cache.ts`、`apps/web/app/api/fengshui/reading/route.ts`、`apps/web/app/fengshui/page.tsx`
- Test: `apps/web/app/fengshui/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `computeFengshui`、`FENGSHUI_ENGINE_VERSION`（`@eamvp/core`）；`generateFengshuiReading`（`@eamvp/llm`）；`BaguaWheel`（Task 13）；`getActiveProfile`/`Profile`（`@/lib/profiles`）；`hasTgSession`/`tgGetProfile`（`@/lib/tg/client`）
- Produces: `readFengshuiCache(key)`、`writeFengshuiCache(key, md)`、`fengshuiCacheKey(profileId, version, locale)`；`POST /api/fengshui/reading`

**关键降级：** 报告叙述由 LLM 生成，但**盘图与化解清单是确定性的**。LLM 失败时页面照常渲染盘与建议，只显示一行提示 + 重试按钮。这是设计内路径，不是异常。

- [ ] **Step 1: 写失败测试**

创建 `apps/web/app/fengshui/__tests__/page.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart } from "@eamvp/core";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const profile = { id: "p1", nickname: "阿甲", birthInput: birth, chart: computeUnifiedChart(birth), createdAt: "", reading: null };

vi.mock("@/lib/profiles", () => ({ getActiveProfile: vi.fn(async () => profile) }));
vi.mock("@/lib/tg/client", () => ({ hasTgSession: () => false, tgGetProfile: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/fengshui" }));

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider locale="zh">{children}</I18nProvider>
);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("## 形势\n甲\n\n## 境与你\n乙\n\n## 可做的事\n- 丙\n")));
});

describe("EP-fs-07 /fengshui Layer 0", () => {
  it("渲染命卦、八方盘与化解清单", async () => {
    const { default: Page } = await import("../page");
    render(<Page />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("坎1")).toBeInTheDocument());
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();
    expect(screen.getByText("可做的事")).toBeInTheDocument();
  });

  it("LLM 失败时仍渲染盘与化解，并显示降级提示", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 503 })));
    const { default: Page } = await import("../page");
    render(<Page />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument());
    expect(screen.getByText(/叙述暂时生成不出来/)).toBeInTheDocument();
  });

  it("flag 关闭时显示未开启文案，不渲染盘", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "");
    vi.resetModules();
    const { default: Page } = await import("../page");
    render(<Page />, { wrapper: Wrapper });
    expect(screen.getByText("「境」尚未开启。")).toBeInTheDocument();
    expect(screen.queryByLabelText("八方吉凶盘")).toBeNull();
  });

  it("每条化解带「和 Mira 聊聊这条」链接指向 /spirit", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
    const { default: Page } = await import("../page");
    render(<Page />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument());
    const links = screen.getAllByText("和 Mira 聊聊这条");
    expect(links[0]!.closest("a")!.getAttribute("href")).toMatch(/^\/spirit\?topic=fengshui:/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/web exec vitest run app/fengshui/__tests__/page.test.tsx`
Expected: FAIL — `Failed to resolve import "../page"`

- [ ] **Step 3: 实现缓存工具**

创建 `apps/web/lib/fengshui-cache.ts`：

```ts
/**
 * 风水报告 localStorage 缓存（EP-fs-07）。
 * 波 1 无服务端持久化（fengshui_reports 属波 2 的 EP-fs-11），
 * 与既有 polishDailyFortune 的按键缓存做法一致。
 * 缓存键含引擎版本 —— 引擎表一改即自动失效。
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
```

- [ ] **Step 4: 实现报告接口**

创建 `apps/web/app/api/fengshui/reading/route.ts`：

```ts
import { computeUnifiedChart, computeFengshui, BirthInputSchema } from "@eamvp/core";
import { generateFengshuiReading, resolveLlmConfig, isLlmConfigured } from "@eamvp/llm";
import { localeFromRequest } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/fengshui/reading —— 确定性排盘 + 风水派生 → 三分节报告 markdown。
 * 一次性返回（非流式）：报告较短且客户端会缓存。
 * LLM 未配置返回 503；客户端据此降级为纯确定性呈现，不留白页。
 */
export async function POST(req: Request): Promise<Response> {
  const cfg = resolveLlmConfig();
  if (!isLlmConfigured(cfg)) return new Response("LLM 未配置", { status: 503 });

  const parsed = BirthInputSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return new Response(parsed.error.issues.map((i) => i.message).join("; "), { status: 400 });
  }

  try {
    const chart = computeUnifiedChart(parsed.data);
    const fs = computeFengshui({ birth: parsed.data, chart });
    const r = await generateFengshuiReading(fs, {
      language: localeFromRequest(req),
      nickname: parsed.data.nickname,
    });
    return new Response(r.markdown, { headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch (e) {
    return new Response(`风水报告生成失败：${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
```

- [ ] **Step 5: 实现「境」页**

创建 `apps/web/app/fengshui/page.tsx`：

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { computeFengshui, FENGSHUI_ENGINE_VERSION, type FengshuiChart } from "@eamvp/core";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { useT, useLocale } from "@/lib/i18n/I18nProvider";
import { BaguaWheel } from "@/components/charts/BaguaWheel";
import { Markdown } from "@/components/Markdown";
import { Card } from "@/components/ui";
import { fengshuiCacheKey, readFengshuiCache, writeFengshuiCache } from "@/lib/fengshui-cache";

const ENABLED = process.env.NEXT_PUBLIC_FENGSHUI_ENABLED === "1";

export default function FengshuiPage() {
  const t = useT();
  const { locale } = useLocale();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ENABLED) return;
    (hasTgSession() ? tgGetProfile() : getActiveProfile())
      .then((p: Profile | null) => setProfile(p))
      .catch(() => setProfile(null));
  }, []);

  // 确定性派生：与 LLM 无关，永远可得
  const fs: FengshuiChart | null = useMemo(
    () => (profile ? computeFengshui({ birth: profile.birthInput, chart: profile.chart }) : null),
    [profile],
  );

  useEffect(() => {
    if (!profile || !fs) return;
    const key = fengshuiCacheKey(profile.id, FENGSHUI_ENGINE_VERSION, locale);
    const cached = readFengshuiCache(key);
    if (cached) { setNarrative(cached); return; }
    fetch("/api/fengshui/reading", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(profile.birthInput),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        const md = await r.text();
        writeFengshuiCache(key, md);
        setNarrative(md);
      })
      .catch(() => setFailed(true));
  }, [profile, fs, locale]);

  if (!ENABLED) return <Centered>{t("fengshui.notEnabled")}</Centered>;
  if (profile === undefined) return <Centered>{t("fengshui.loadingProfile")}</Centered>;
  if (profile === null) {
    return (
      <Centered>
        <p className="text-ink-2">{t("fengshui.noProfile")}</p>
        <Link href="/reading" className="mt-4 inline-block px-6 py-3 text-on-ink"
          style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}>
          {t("fengshui.goCast")}
        </Link>
      </Centered>
    );
  }

  const g = fs!.mingGua;
  return (
    <main className="mx-auto max-w-[720px] px-4 pb-8 pt-6">
      <h1 className="text-[24px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.title")}</h1>
      <p className="mt-1 text-[13px] text-muted">{t("fengshui.subtitle")}</p>

      <section className="mt-6 flex flex-col items-center">
        <BaguaWheel verdicts={fs!.personalDirections} centerLabel={`${g.guaName}${g.gua}`} />
        <p className="mt-2 text-[13px] text-ink-2">
          {t("fengshui.mingGua")}：{g.guaName}{g.gua}（{g.group}）
        </p>
      </section>

      {narrative && (
        <section className="mt-6">
          <Markdown text={narrative} />
        </section>
      )}
      {failed && !narrative && (
        <p className="mt-6 text-[13px] text-muted">{t("fengshui.narrativeFailed")}</p>
      )}

      <section className="mt-8">
        <h2 className="text-[18px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.remedyTitle")}</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {fs!.remedies.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center gap-2 text-[12px] text-muted">
                <span>{r.effort}</span>
                <span>·</span>
                <span>{r.evidence === "传统象征" ? t("fengshui.evidenceSymbolic") : t("fengshui.evidenceBoth")}</span>
              </div>
              <p className="mt-1.5 text-[15px] text-ink">{r.action}</p>
              <p className="mt-2 text-[13px] text-ink-2">{t("fengshui.traditionalLabel")}：{r.traditional}</p>
              {r.modern && (
                <p className="mt-1 text-[13px] text-ink-2">{t("fengshui.modernLabel")}：{r.modern}</p>
              )}
              <Link
                href={`/spirit?topic=fengshui:${encodeURIComponent(r.id)}`}
                className="mt-3 inline-block text-[13px]"
                style={{ color: "var(--color-cinnabar)" }}
              >
                {t("fengshui.askMira")}
              </Link>
            </Card>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-[12px] text-muted">{t("fengshui.disclaimer")}</p>

      <Link href="/fengshui/object" className="mt-6 inline-block text-[14px]" style={{ color: "var(--color-cinnabar)" }}>
        {t("fengshui.object.title")}
      </Link>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
```

> **已核实的两个 API（照抄，勿改写）：**
> - `useLocale()` 返回 **对象** `{ locale, setLocale }`（`apps/web/lib/i18n/I18nProvider.tsx:102`），必须解构取 `locale`，不能直接当字符串用。
> - `Markdown` 收 **`text` prop**，不是 children（`apps/web/components/Markdown.tsx:49`），写作 `<Markdown text={md} />`。
>
> 缓存键必须含 locale，否则切换语言会读到旧语言的报告。

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm --filter @eamvp/web exec vitest run app/fengshui/__tests__/page.test.tsx`
Expected: PASS — 4 passed

- [ ] **Step 7: 提交**

```bash
git add apps/web/lib/fengshui-cache.ts apps/web/app/api/fengshui/reading/route.ts apps/web/app/fengshui/page.tsx apps/web/app/fengshui/__tests__/page.test.tsx
git commit -m "feat(fengshui): 「境」页 Layer0 报告 + 确定性降级 + localStorage 缓存 [EP-fs-07]"
```

---

## Task 15: 物件顾问页与接口

**Files:**
- Create: `apps/web/app/fengshui/ObjectAdvisorForm.tsx`、`apps/web/app/fengshui/object/page.tsx`、`apps/web/app/api/fengshui/object/route.ts`
- Test: `apps/web/app/fengshui/__tests__/ObjectAdvisorForm.test.tsx`

**Interfaces:**
- Consumes: `adviseObject`、`computeFengshui`、`OBJECT_CATEGORIES`、`CATEGORY_LABEL`（`@eamvp/core`）；`adviseObjectText`（`@eamvp/llm`，服务端）
- Produces: `ObjectAdvisorForm({ fs })`；`POST /api/fengshui/object`

**回访钩子。** 建议本身**完全在客户端确定性算出**——LLM 只负责润色成句子，失败不影响可用性。

- [ ] **Step 1: 写失败测试**

创建 `apps/web/app/fengshui/__tests__/ObjectAdvisorForm.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart, computeFengshui } from "@eamvp/core";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { ObjectAdvisorForm } from "../ObjectAdvisorForm";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const fs = computeFengshui({ birth, chart: computeUnifiedChart(birth) });
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider locale="zh">{children}</I18nProvider>
);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("放东边靠墙就好。")));
});

describe("EP-fs-08 物件顾问表单", () => {
  it("提交后给出确定性建议（推荐方位与品类规则）", async () => {
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText("品类"), { target: { value: "desk" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    await waitFor(() => expect(screen.getByText("推荐方位")).toBeInTheDocument());
    expect(screen.getByText("这类物件的讲究")).toBeInTheDocument();
  });

  it("镜子显示「不对床」规则", async () => {
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText("品类"), { target: { value: "mirror" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    await waitFor(() => expect(screen.getByText(/不正对床/)).toBeInTheDocument());
  });

  it("LLM 失败时确定性结果仍完整显示", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 503 })));
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText("品类"), { target: { value: "desk" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    await waitFor(() => expect(screen.getByText("推荐方位")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/web exec vitest run app/fengshui/__tests__/ObjectAdvisorForm.test.tsx`
Expected: FAIL — `Failed to resolve import "../ObjectAdvisorForm"`

- [ ] **Step 3: 实现表单组件**

创建 `apps/web/app/fengshui/ObjectAdvisorForm.tsx`：

```tsx
"use client";

import { useState } from "react";
import {
  adviseObject, OBJECT_CATEGORIES, CATEGORY_LABEL, DIRECTIONS, DIRECTION_LABEL,
  type FengshuiChart, type ObjectAdvice, type ObjectCategory, type Direction,
} from "@eamvp/core";
import { useT } from "@/lib/i18n/I18nProvider";
import { Card, Button } from "@/components/ui";

const MATERIALS = ["原木", "金属", "玻璃", "陶瓷", "皮革", "棉麻", "石材"];
const SHAPES = ["长条", "方", "圆", "尖锐", "波浪"];

/** 物件顾问（EP-fs-08）。建议在客户端确定性算出；LLM 只润色成句，失败不影响可用性。 */
export function ObjectAdvisorForm({ fs }: { fs: FengshuiChart }) {
  const t = useT();
  const [category, setCategory] = useState<ObjectCategory>("desk");
  const [material, setMaterial] = useState("");
  const [shape, setShape] = useState("");
  const [dir, setDir] = useState<Direction | "">("");
  const [advice, setAdvice] = useState<ObjectAdvice | null>(null);
  const [prose, setProse] = useState<string | null>(null);

  function submit() {
    const a = adviseObject(
      { verdicts: fs.personalDirections, affinity: fs.elementAffinity },
      {
        category,
        material: material || undefined,
        shape: shape || undefined,
        intendedDirection: dir || undefined,
      },
    );
    setAdvice(a);
    setProse(null);
    fetch("/api/fengshui/object", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(a),
    })
      .then(async (r) => { if (r.ok) setProse(await r.text()); })
      .catch(() => { /* 确定性结果已足够，静默 */ });
  }

  return (
    <div>
      <div className="flex flex-col gap-3">
        <Field label={t("fengshui.object.category")} id="fs-cat">
          <select id="fs-cat" value={category} onChange={(e) => setCategory(e.target.value as ObjectCategory)} className="w-full">
            {OBJECT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label={t("fengshui.object.material")} id="fs-mat">
          <select id="fs-mat" value={material} onChange={(e) => setMaterial(e.target.value)} className="w-full">
            <option value="">{t("fengshui.object.unspecified")}</option>
            {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label={t("fengshui.object.shape")} id="fs-shape">
          <select id="fs-shape" value={shape} onChange={(e) => setShape(e.target.value)} className="w-full">
            <option value="">{t("fengshui.object.unspecified")}</option>
            {SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label={t("fengshui.object.intendedDirection")} id="fs-dir">
          <select id="fs-dir" value={dir} onChange={(e) => setDir(e.target.value as Direction | "")} className="w-full">
            <option value="">{t("fengshui.object.unspecified")}</option>
            {DIRECTIONS.map((d) => <option key={d} value={d}>{DIRECTION_LABEL[d]}</option>)}
          </select>
        </Field>
        <Button onClick={submit}>{t("fengshui.object.submit")}</Button>
      </div>

      {advice && (
        <Card className="mt-6 p-4">
          {prose && <p className="mb-3 text-[15px] text-ink">{prose}</p>}
          <p className="text-[13px] text-muted">
            {t("fengshui.object.elementOf")}：{advice.elementOfObject ?? "—"}
          </p>
          <h3 className="mt-3 text-[14px]">{t("fengshui.object.recommended")}</h3>
          <ul className="mt-1 text-[14px] text-ink-2">
            {advice.recommendedDirections.map((r) => <li key={r.direction}>{r.label}｜{r.reason}</li>)}
          </ul>
          <h3 className="mt-3 text-[14px]">{t("fengshui.object.avoid")}</h3>
          <ul className="mt-1 text-[14px] text-ink-2">
            {advice.avoid.map((r) => <li key={r.direction}>{r.label}｜{r.reason}</li>)}
          </ul>
          <h3 className="mt-3 text-[14px]">{t("fengshui.object.rules")}</h3>
          <ul className="mt-1 text-[14px] text-ink-2">
            {advice.categoryRules.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <p className="mt-3 text-[14px] text-ink-2">{t("fengshui.object.fit")}：{advice.personalFit}</p>
          {advice.intendedVerdict && (
            <p className="mt-2 text-[14px] text-ink-2">
              {t("fengshui.object.intended")}：{DIRECTION_LABEL[advice.intendedVerdict.direction]}
              ｜{advice.intendedVerdict.star}（{advice.intendedVerdict.auspicious ? "吉" : "凶"}）
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-[13px] text-ink-2">
      {label}
      {children}
    </label>
  );
}
```

- [ ] **Step 4: 实现接口与页面**

创建 `apps/web/app/api/fengshui/object/route.ts`：

```ts
import { adviseObjectText, resolveLlmConfig, isLlmConfigured } from "@eamvp/llm";
import { localeFromRequest } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/fengshui/object —— 把已算好的 ObjectAdvice 润色成 2–3 句。
 * 建议本身由客户端确定性算出，本接口只负责说人话；失败不影响页面可用性。
 */
export async function POST(req: Request): Promise<Response> {
  const cfg = resolveLlmConfig();
  if (!isLlmConfigured(cfg)) return new Response("LLM 未配置", { status: 503 });
  try {
    const advice = await req.json();
    const text = await adviseObjectText(advice, { language: localeFromRequest(req) });
    return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch (e) {
    return new Response(`生成失败：${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
```

创建 `apps/web/app/fengshui/object/page.tsx`：

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { computeFengshui, type FengshuiChart } from "@eamvp/core";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { useT } from "@/lib/i18n/I18nProvider";
import { ObjectAdvisorForm } from "../ObjectAdvisorForm";

const ENABLED = process.env.NEXT_PUBLIC_FENGSHUI_ENABLED === "1";

export default function FengshuiObjectPage() {
  const t = useT();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    if (!ENABLED) return;
    (hasTgSession() ? tgGetProfile() : getActiveProfile())
      .then((p: Profile | null) => setProfile(p))
      .catch(() => setProfile(null));
  }, []);

  const fs: FengshuiChart | null = useMemo(
    () => (profile ? computeFengshui({ birth: profile.birthInput, chart: profile.chart }) : null),
    [profile],
  );

  if (!ENABLED) return <Centered>{t("fengshui.notEnabled")}</Centered>;
  if (profile === undefined) return <Centered>{t("fengshui.loadingProfile")}</Centered>;
  if (profile === null) {
    return (
      <Centered>
        <p className="text-ink-2">{t("fengshui.noProfile")}</p>
        <Link href="/reading" className="mt-4 text-[14px]" style={{ color: "var(--color-cinnabar)" }}>
          {t("fengshui.goCast")}
        </Link>
      </Centered>
    );
  }

  return (
    <main className="mx-auto max-w-[720px] px-4 pb-8 pt-6">
      <Link href="/fengshui" className="text-[13px] text-ink-2">← {t("fengshui.title")}</Link>
      <h1 className="mt-3 text-[22px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.object.title")}</h1>
      <p className="mt-1 text-[13px] text-muted">{t("fengshui.object.subtitle")}</p>
      <div className="mt-6"><ObjectAdvisorForm fs={fs!} /></div>
      <p className="mt-8 text-[12px] text-muted">{t("fengshui.disclaimer")}</p>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @eamvp/web exec vitest run app/fengshui/__tests__/ObjectAdvisorForm.test.tsx`
Expected: PASS — 3 passed

- [ ] **Step 6: 全量验证**

Run: `pnpm test`
Expected: core / llm / web 三包全绿

Run: `pnpm typecheck`
Expected: 无输出

Run: `pnpm --filter @eamvp/web build`
Expected: 构建成功；`/fengshui` 与 `/fengshui/object` 出现在路由列表

- [ ] **Step 7: 提交**

```bash
git add apps/web/app/fengshui/ObjectAdvisorForm.tsx apps/web/app/fengshui/object/page.tsx apps/web/app/api/fengshui/object/route.ts apps/web/app/fengshui/__tests__/ObjectAdvisorForm.test.tsx
git commit -m "feat(fengshui): 物件顾问页 + 润色接口（确定性优先降级）[EP-fs-08]"
```

---

## 收尾：文档与冻结保护

- [ ] **Step 1: 确认 flag 关闭时的行为**

在**不设** `NEXT_PUBLIC_FENGSHUI_ENABLED` 的情况下：

Run: `pnpm --filter @eamvp/web build && pnpm --filter @eamvp/web start`
手动确认：导航无「境」；访问 `/fengshui` 显示「「境」尚未开启。」；既有 6 条路由（`/`、`/reading`、`/chart`、`/calendar`、`/profiles`、`/account`）行为无变化。

- [ ] **Step 2: 更新 `.agent/CURRENT.md`**

按 CLAUDE.md「Release 后必做」：在 Version History 追加一行；更新 Current Sprint Summary，注明波 1 已交付、flag 默认关、波 2（Layer 1 住宅实盘）待排期。

- [ ] **Step 3: 提交**

```bash
git add .agent/CURRENT.md
git commit -m "docs: 风水「境」波1 Layer0 交付记录 [EP-fs]"
```

---

## Self-Review 结果

**1. Spec 覆盖**：spec §14 波 1 的 EP-fs-01～08 全部有对应任务 —— 01→Task 1/2/3，02→Task 4，03→Task 5/7，04→Task 6，05→Task 8/9/11，06→Task 10，07→Task 12/13/14，08→Task 15。spec §12 的「LLM 挂了页面不白」由 Task 14/15 的降级测试锁定。

**2. 已修的三处不一致**：
- Task 7 原本先写 `computeBaziChart(input.birth)` 再改口用 `input.chart.bazi` —— 已直接写成正确版本并说明理由。
- Task 5 的租房过滤：波 1 无居所对象，拿不到租/买状态，已把过滤明确挪到波 2 的 EP-fs-12，测试只验排序。
- spec §8.2 的 `fengshui_reports` 属波 2，波 1 因此**无服务端持久化** —— 补了 `apps/web/lib/fengshui-cache.ts`，按 `(profileId, 引擎版本, locale)` 存 localStorage，与 `polishDailyFortune` 的缓存做法一致。

**3. 类型一致性**：`adviseObject(input, query)` 双参签名在 Task 6 定义、Task 15 调用一致；`FengshuiChart.personalDirections` 在 Task 7/8/13/14/15 用法一致；`Remedy.evidence` 的两个取值在 core/llm/web 三层拼写统一。

**4. 两处已知未核实（计划内已设卡点）**：Task 2 的命卦公式与 Task 3 的 64 格游年表均为通行式但未对拍权威表，两个任务各有一个**「必做，不可跳过」的对拍步骤**，并写明不一致时改公式与测试、同步修 spec，而非绕过测试。

