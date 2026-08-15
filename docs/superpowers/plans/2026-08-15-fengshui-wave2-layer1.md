# 风水「境」波 2 · Layer 1 住宅实盘 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在波 1「本命方位」之上加一层住宅实盘——用户回答一个问题（大门朝向）即得宅卦八方吉凶、宅层化解、以及同宅多人的吉凶对照。

**Architecture:** 沿用波 1 的分层：`@eamvp/core` 纯函数算宅卦与合看（新增 `dwelling.ts`，`FengshuiChart` 由单一类型改为 **Layer 0 / Layer 1 判别联合**）；`@eamvp/llm` 的 facts/prompt 扩展承载居所与合看事实；`apps/web` 新增居所录入与管理、「境」页 Tab 化。报告持久化从 localStorage **迁到 Supabase `fengshui_reports`**，用 `input_fingerprint` 做失效——因为居所可变、合看成员可增减，localStorage 那套按 (档案,版本,locale) 的键已经不够。

**Tech Stack:** TypeScript · Zod · vitest · Next.js 16 / React 19 / Tailwind 4 · Supabase（匿名 + RLS）

**Spec:** `docs/superpowers/specs/2026-08-14-fengshui-environment-design.md` §14 波 2（EP-fs-11 ~ EP-fs-18）
**前置:** 波 1 已合并 main（commit `14c2daf`），本计划全部建立在 as-delivered 代码上，**不是 spec 初稿**——多处签名在波 1 的评审中改过，见下方 Global Constraints。

## Global Constraints

- **Flag 门控**：全部新增 web 入口继续受 `NEXT_PUBLIC_FENGSHUI_ENABLED === "1"` 控制，默认关闭。
- **不改冻结命盘**：不修改 `UnifiedChart`、`packages/core/src/types/chart.ts`、`profiles` 表。
- **派生层纯函数**：`packages/core/src/fengshui/**` 全部纯函数，无 I/O、无随机、无当前时间依赖。
- **排盘不许 LLM 算**：宅卦八方吉凶同样来自 `EIGHT_MANSIONS` 查表，LLM 只解释。
- **诚实标注**：`Remedy` 是判别联合，`evidence: '传统象征' ⇒ modern: null` 由编译器强制。新增的宅层化解必须遵守，**不得**把类型放宽成 `modern: string | null`。
- **非决定论**：禁断祸福、禁医疗/财务/法律建议、强制免责。
- **LLM 挂了页面不白**：宅卦八方盘、宅层化解清单同样是确定性的，LLM 失败时页面仍完整可用。
- **i18n**：新增文案同时写 `zh.ts` 与 `en.ts`，键结构必须一致；命理专名保留中文。
- **测试命令**：`pnpm --filter @eamvp/core test`（基线 122）· `pnpm --filter @eamvp/llm test`（基线 130）· `pnpm --filter @eamvp/web test`（基线 65）· `pnpm typecheck`（全 monorepo）。

### as-delivered 接口（照抄，勿按 spec 初稿写）

```ts
// @eamvp/core
FENGSHUI_ENGINE_VERSION = "fs-1"                       // 波2 必须递增为 "fs-2"（见 Task 3）
type FengshuiInput  = { birth: BirthInput; chart: UnifiedChart }
type FengshuiChart  = { layer: 0; engineVersion: string; mingGua; personalDirections;
                        elementAffinity; remedies: Remedy[]; dwelling?: undefined; cohabitants?: undefined }
computeFengshui(input: FengshuiInput): FengshuiChart
buildPersonalRemedies(mingGua: MingGua, verdicts: Record<Direction, DirectionVerdict>,
                      affinity: ElementAffinity): Remedy[]
sortRemedies(list: Remedy[]): Remedy[]
adviseObject(input: ObjectAdviceInput, q: ObjectQuery): ObjectAdvice
type ObjectAdviceInput = { verdicts: Record<Direction, DirectionVerdict>; affinity: ElementAffinity }
type Remedy = (RemedyBase & { evidence: "双重支撑"; modern: string })
            | (RemedyBase & { evidence: "传统象征"; modern: null })
// ⚠️ 风水星名类型在 core barrel 顶层叫 FengshuiStar（Star 已被紫微星曜占用）
OPPOSITE: Record<Direction, Direction>                  // 对宫
DIRECTION_GUA: Record<Direction, Gua>                   // 方位 → 卦
directionsFor(gua: Gua): Record<Direction, DirectionVerdict>

// @eamvp/llm
type FengshuiFacts = { layer: 0; ... }                  // 波2 需放宽，见 Task 6
FENGSHUI_FACT_KEYS                                       // 字段白名单，新增字段必须同步
generateFengshuiReading(f, opts): Promise<{ markdown; sections; corrections; degraded }>

// apps/web（波2 将替换）
lib/fengshui-cache.ts  fengshuiCacheKey/readFengshuiCache/writeFengshuiCache  // localStorage，Task 7 起废弃
```

## File Structure

**新建 — core**：`packages/core/src/fengshui/dwelling.ts`（`DwellingInput` / `dwellingGua` / `sectorsFor` / `matchWithPerson`）、`packages/core/src/fengshui/cohabitants.ts`（合看）
**修改 — core**：`fengshui/index.ts`（判别联合 + Layer 1 分支 + 版本号）、`fengshui/remedy.ts`（宅层化解 + 租房过滤）、`fengshui/object-advisor.ts`（强版）、`src/index.ts`（barrel）
**新建 — core 测试**：`fengshui-dwelling.test.ts`、`fengshui-cohabitants.test.ts`
**修改 — llm**：`fengshui/facts.ts`（Layer 1 事实）、`fengshui/prompt.ts`（居所与合看段落）
**新建 — db**：`supabase/migrations/0011_dwellings.sql`
**新建 — web**：`lib/dwellings.ts`（数据访问）、`lib/fengshui-report.ts`（服务端持久化 + 指纹）、`app/fengshui/dwellings/page.tsx`（管理）、`app/fengshui/DwellingForm.tsx`（录入）、`app/fengshui/FengshuiTabs.tsx`
**修改 — web**：`app/fengshui/page.tsx`（Tab 化 + 合看 chips + 会员闸）、`app/fengshui/ObjectAdvisorForm.tsx`（接强版）、`app/api/fengshui/reading/route.ts`（收居所）、i18n 双字典
**删除 — web**：`lib/fengshui-cache.ts`（被服务端持久化取代，Task 7）

---

## Task 1: 数据库迁移 `0011_dwellings`

**Files:**
- Create: `supabase/migrations/0011_dwellings.sql`

**Interfaces:**
- Consumes: 既有 `auth.users`、`profiles`
- Produces: 表 `dwellings`、`fengshui_reports`（供 Task 7 的数据访问层使用）

> **本 task 只写 SQL 文件，不要尝试连接或修改任何线上数据库。** apply 由 controller 经 Supabase MCP 执行。

- [ ] **Step 1: 写迁移文件**

创建 `supabase/migrations/0011_dwellings.sql`（体例对照既有 `0009_entitlements.sql`）：

```sql
-- EP-fs-11 风水波2 Layer 1：居所 + 报告持久化
-- 波1 无迁移；本迁移只新增表，不改动 profiles / entitlements 等既有表。

create table if not exists public.dwellings (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references auth.users(id) on delete cascade,
  name text not null,                              -- 「家」「办公室」
  kind text not null default 'home',               -- home | office
  tenancy text not null default 'rent',            -- rent | own（驱动 Remedy 折叠）
  facing text,                                     -- 八方位枚举 N/NE/E/SE/S/SW/W/NW；null = 不确定 → 降级 Layer 0
  facing_degrees numeric,                          -- Layer 2 玄空飞星用罗盘度数，波2 留空
  built_year int,                                  -- Layer 2 元运用，波2 留空
  layout jsonb,                                    -- Layer 2 房间标注，波2 留空
  member_profile_ids uuid[] not null default '{}', -- 合看的档案 id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.dwellings enable row level security;
create policy own_all on public.dwellings for all
  using (auth.uid() = uid) with check (auth.uid() = uid);
create index if not exists dwellings_uid_idx on public.dwellings(uid);

-- 报告持久化。与三段式解读不同：命盘冻结所以解读永久有效，
-- 而居所可变（改朝向/增减同住人/切语言）→ 必须带失效机制。
create table if not exists public.fengshui_reports (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references auth.users(id) on delete cascade,
  dwelling_id uuid references public.dwellings(id) on delete cascade,  -- null = Layer 0 报告
  profile_id uuid not null,                        -- 视角所有者（主档案）；合看成员在 fingerprint 内
  layer int not null,
  locale text not null,
  input_fingerprint text not null,
  sections jsonb not null,                         -- { situation, youAndSpace, actions }
  created_at timestamptz not null default now()
);
alter table public.fengshui_reports enable row level security;
create policy own_all on public.fengshui_reports for all
  using (auth.uid() = uid) with check (auth.uid() = uid);
-- 命中查询：同一 uid + 指纹只保留一条有效记录
create unique index if not exists fengshui_reports_fp_idx
  on public.fengshui_reports(uid, input_fingerprint);
```

- [ ] **Step 2: 自检 SQL**

逐条确认：①两表都 `enable row level security`；②policy 的 `using` 与 `with check` 都比对 `auth.uid()`（只有 using 会让用户能写入他人行）；③`on delete cascade` 挂在 `auth.users` 与 `dwellings` 上；④Layer 2 三个字段（`facing_degrees` / `built_year` / `layout`）存在且可空——它们现在留空，飞星层落地时零迁移；⑤没有任何 `alter table` 动到既有表。

- [ ] **Step 3: 提交**

```bash
git add supabase/migrations/0011_dwellings.sql
git commit -m "feat(fengshui): 迁移 0011 dwellings + fengshui_reports + RLS [EP-fs-11]"
```

> **交付后 controller 会做的事（本 task 不做）：** 经 Supabase MCP apply 到线上，并实测 RLS 隔离（A 用户读不到 B 用户的居所）。

---

## Task 2: core `dwelling.ts` — 宅卦与八方

**Files:**
- Create: `packages/core/src/fengshui/dwelling.ts`
- Test: `packages/core/test/fengshui-dwelling.test.ts`

**Interfaces:**
- Consumes: `Direction`、`DIRECTIONS`、`OPPOSITE`、`DIRECTION_GUA`、`Gua`（`./directions`）；`directionsFor`、`DirectionVerdict`（`./eight-mansions`）；`MingGua`（`./ming-gua`）
- Produces: `DwellingInput`、`DwellingGua`、`dwellingGua(facing: Direction): DwellingGua`、`matchWithPerson(mingGua: MingGua, dwelling: DwellingGua): "相配" | "相冲"`

**领域规则：** 坐 = 向的**对宫**；坐山定宅卦（坐北 = 坎宅，即向南的房子是坎宅）。东四宅 = 坎离震巽，西四宅 = 乾兑艮坤。东四命宜住东四宅、西四命宜住西四宅。

- [ ] **Step 1: 写失败测试**

创建 `packages/core/test/fengshui-dwelling.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { DIRECTIONS } from "../src/fengshui/directions";
import { dwellingGua, matchWithPerson } from "../src/fengshui/dwelling";
import type { MingGua } from "../src/fengshui/ming-gua";

const mk = (guaName: MingGua["guaName"], group: MingGua["group"]): MingGua =>
  ({ gua: 1, guaName, group, direction: "N", lichunYear: 1990 });

describe("EP-fs-12 宅卦", () => {
  it("坐 = 向的对宫：向南的房子坐北，是坎宅", () => {
    const d = dwellingGua("S");
    expect(d.facing).toBe("S");
    expect(d.sitting).toBe("N");
    expect(d.guaName).toBe("坎");
    expect(d.group).toBe("东四宅");
  });

  it("向北 → 坐南 → 离宅（东四）；向西北 → 坐东南 → 巽宅（东四）", () => {
    expect(dwellingGua("N").guaName).toBe("离");
    expect(dwellingGua("N").group).toBe("东四宅");
    expect(dwellingGua("NW").guaName).toBe("巽");
    expect(dwellingGua("NW").group).toBe("东四宅");
  });

  it("向东南 → 坐西北 → 乾宅（西四）；向东北 → 坐西南 → 坤宅（西四）", () => {
    expect(dwellingGua("SE").guaName).toBe("乾");
    expect(dwellingGua("SE").group).toBe("西四宅");
    expect(dwellingGua("NE").guaName).toBe("坤");
    expect(dwellingGua("NE").group).toBe("西四宅");
  });

  it("八个朝向都能算出宅卦，且坐向互为对宫", () => {
    for (const f of DIRECTIONS) {
      const d = dwellingGua(f);
      expect(d.facing).toBe(f);
      expect(dwellingGua(d.sitting).sitting).toBe(f);
      expect(Object.keys(d.sectors)).toHaveLength(8);
    }
  });

  it("宅八方判语来自宅卦（与命卦无关）：坎宅生气在东南", () => {
    expect(dwellingGua("S").sectors.SE.star).toBe("生气");
  });

  it("东四命住东四宅相配，住西四宅相冲", () => {
    const east = mk("坎", "东四命");
    const west = mk("乾", "西四命");
    expect(matchWithPerson(east, dwellingGua("S"))).toBe("相配");   // 坎宅
    expect(matchWithPerson(west, dwellingGua("S"))).toBe("相冲");
    expect(matchWithPerson(west, dwellingGua("SE"))).toBe("相配");  // 乾宅
    expect(matchWithPerson(east, dwellingGua("SE"))).toBe("相冲");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-dwelling.test.ts`
Expected: FAIL — `Failed to resolve import "../src/fengshui/dwelling"`

- [ ] **Step 3: 实现**

创建 `packages/core/src/fengshui/dwelling.ts`：

```ts
import { OPPOSITE, DIRECTION_GUA, type Direction, type Gua } from "./directions";
import { directionsFor, type DirectionVerdict } from "./eight-mansions";
import type { MingGua } from "./ming-gua";

/**
 * 宅卦（EP-fs-12）。与命卦互不相干：命卦由人的立春年+性别定，宅卦由**坐山**定。
 * 坐 = 向的对宫 —— 向南的房子坐北，是坎宅。
 * 宅八方吉凶复用同一张 EIGHT_MANSIONS 查表（`directionsFor`），只是入参换成宅卦。
 */

/** 用户填的居所信息。facing 为 null 表示「不确定」→ 调用方降级回 Layer 0。 */
export type DwellingInput = {
  id: string;
  name: string;
  kind: "home" | "office";
  tenancy: "rent" | "own";
  facing: Direction;
};

const EAST_GROUP = new Set<Gua>(["坎", "离", "震", "巽"]);

export type DwellingGua = {
  facing: Direction;
  sitting: Direction;
  guaName: Gua;
  group: "东四宅" | "西四宅";
  /** 宅卦八方判语——注意这与「命卦八方」是两套，页面上不要混用 */
  sectors: Record<Direction, DirectionVerdict>;
};

export function dwellingGua(facing: Direction): DwellingGua {
  const sitting = OPPOSITE[facing];
  const guaName = DIRECTION_GUA[sitting];
  return {
    facing,
    sitting,
    guaName,
    group: EAST_GROUP.has(guaName) ? "东四宅" : "西四宅",
    sectors: directionsFor(guaName),
  };
}

/** 东四命宜东四宅、西四命宜西四宅。 */
export function matchWithPerson(mingGua: MingGua, dwelling: DwellingGua): "相配" | "相冲" {
  const personEast = mingGua.group === "东四命";
  const dwellingEast = dwelling.group === "东四宅";
  return personEast === dwellingEast ? "相配" : "相冲";
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-dwelling.test.ts`
Expected: PASS — 6 passed

- [ ] **Step 5: 变异验证**

把 `const sitting = OPPOSITE[facing]` 改成 `const sitting = facing`（去掉对宫）→ 必须有测试变红。还原。把断言写进报告。

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/fengshui/dwelling.ts packages/core/test/fengshui-dwelling.test.ts
git commit -m "feat(fengshui): 宅卦（坐向对宫 + 宅八方 + 命宅相配）[EP-fs-12]"
```

---

## Task 3: `FengshuiChart` 判别联合 + Layer 1 分支 + 宅层化解 + 租房折叠

**Files:**
- Modify: `packages/core/src/fengshui/index.ts`、`packages/core/src/fengshui/remedy.ts`、`packages/llm/src/fengshui/facts.ts`（仅一处类型放宽，见 Step 5）
- Test: `packages/core/test/fengshui-compute.test.ts`（扩充）、`packages/core/test/fengshui-remedy.test.ts`（扩充）

**Interfaces:**
- Consumes: `DwellingInput`、`DwellingGua`、`dwellingGua`、`matchWithPerson`（Task 2）
- Produces: `FengshuiChart`（判别联合）、`DwellingView`、扩充后的 `FengshuiInput`、`buildDwellingRemedies`、`sortRemedies(list, opts?)`、`FENGSHUI_ENGINE_VERSION = "fs-2"`

**为什么用判别联合：** 波 1 的 `FengshuiChart` 是 `layer: 0` 字面量 + `dwelling?: undefined`。若改成 `layer: 0 | 1` 加可选 `dwelling?`，就允许 `{ layer: 1, dwelling: undefined }` 这种非法状态通过编译。本分支已在 `Remedy` / `EnvPsychAnchor` 上用判别联合强制过同类不变式，这里保持一致——**`dwelling` 存在当且仅当 `layer === 1`**。

**版本号必须递增：** `FENGSHUI_ENGINE_VERSION` 从 `"fs-1"` 改为 `"fs-2"`。它进报告缓存指纹，化解生成规则一变就必须让旧报告失效。

- [ ] **Step 1: 写失败测试（compute）**

在 `packages/core/test/fengshui-compute.test.ts` 末尾追加：

```ts
describe("EP-fs-12 computeFengshui Layer 1", () => {
  const dwelling = {
    id: "d1", name: "家", kind: "home" as const, tenancy: "rent" as const, facing: "S" as const,
  };
  const runL1 = () => {
    const b = mk();
    return computeFengshui({ birth: b, chart: computeUnifiedChart(b), dwelling });
  };

  it("给了居所 → layer 1，且 dwelling 字段齐备", () => {
    const f = runL1();
    expect(f.layer).toBe(1);
    if (f.layer !== 1) throw new Error("unreachable");
    expect(f.dwelling.guaName).toBe("坎");        // 向南 → 坐北 → 坎宅
    expect(f.dwelling.name).toBe("家");
    expect(Object.keys(f.dwelling.sectors)).toHaveLength(8);
    expect(["相配", "相冲"]).toContain(f.dwelling.matchWithPerson);
  });

  it("不给居所 → 仍是 layer 0，dwelling 为 undefined（波1 行为不变）", () => {
    const f = run();
    expect(f.layer).toBe(0);
    expect(f.dwelling).toBeUndefined();
  });

  it("命卦八方与宅卦八方是两套，互不覆盖", () => {
    const f = runL1();
    if (f.layer !== 1) throw new Error("unreachable");
    // 1990 男 = 坎命；本例宅卦也是坎 → 两套恰好相同。换个朝向即应不同。
    const other = computeFengshui({ birth: mk(), chart: computeUnifiedChart(mk()), dwelling: { ...dwelling, facing: "SE" } });
    if (other.layer !== 1) throw new Error("unreachable");
    expect(other.dwelling.guaName).toBe("乾");
    expect(other.personalDirections.SE.star).toBe(f.personalDirections.SE.star); // 命卦不受居所影响
    expect(other.dwelling.sectors.SE.star).not.toBe(f.dwelling.sectors.SE.star); // 宅卦随朝向变
  });

  it("Layer 1 的化解里含宅层条目（target 提到宅或方位），且仍全部合法", () => {
    const f = runL1();
    expect(f.remedies.length).toBeGreaterThan(run().remedies.length);
    for (const r of f.remedies) {
      if (r.evidence === "传统象征") expect(r.modern).toBeNull();
    }
  });

  it("引擎版本已递增到 fs-2（化解生成规则变了，旧报告必须失效）", () => {
    expect(FENGSHUI_ENGINE_VERSION).toBe("fs-2");
  });

  it("纯函数：Layer 1 同输入两次调用深度相等", () => {
    expect(runL1()).toEqual(runL1());
  });
});
```

- [ ] **Step 2: 写失败测试（租房折叠）**

在 `packages/core/test/fengshui-remedy.test.ts` 末尾追加：

```ts
describe("EP-fs-12 租房折叠", () => {
  const own: Remedy = {
    id: "fs-own", target: "t", action: "改门", effort: "装修",
    tenancy: "需自有", traditional: "t", modern: null, evidence: "传统象征",
  };
  const rentOk: Remedy = {
    id: "fs-rent", target: "t", action: "挪桌", effort: "挪动",
    tenancy: "租房可做", traditional: "t", modern: "m", evidence: "双重支撑",
  };

  it("租住时「需自有」条目降级排到最后，但不丢弃", () => {
    const sorted = sortRemedies([own, rentOk], { tenancy: "rent" });
    expect(sorted.map((r) => r.id)).toEqual(["fs-rent", "fs-own"]);
    expect(sorted).toHaveLength(2); // 折叠 ≠ 删除
  });

  it("自有时不降级，仍按成本排序（装修在挪动之后）", () => {
    const sorted = sortRemedies([own, rentOk], { tenancy: "own" });
    expect(sorted.map((r) => r.id)).toEqual(["fs-rent", "fs-own"]);
  });

  it("自有时「需自有」的零成本条目能排到「租房可做」的装修条目之前", () => {
    const ownCheap: Remedy = { ...own, id: "fs-own-cheap", effort: "零成本" };
    const rentPricey: Remedy = { ...rentOk, id: "fs-rent-pricey", effort: "装修" };
    expect(sortRemedies([rentPricey, ownCheap], { tenancy: "own" }).map((r) => r.id))
      .toEqual(["fs-own-cheap", "fs-rent-pricey"]);
    // 租住时反过来：需自有的再便宜也排后面
    expect(sortRemedies([rentPricey, ownCheap], { tenancy: "rent" }).map((r) => r.id))
      .toEqual(["fs-rent-pricey", "fs-own-cheap"]);
  });

  it("不传 opts 时行为与波1 完全一致（不按 tenancy 分组）", () => {
    const ownCheap: Remedy = { ...own, id: "a", effort: "零成本" };
    const rentPricey: Remedy = { ...rentOk, id: "b", effort: "装修" };
    expect(sortRemedies([rentPricey, ownCheap]).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-compute.test.ts test/fengshui-remedy.test.ts`
Expected: FAIL — `computeFengshui` 不接受 `dwelling`；`sortRemedies` 不接受第二参

- [ ] **Step 4: 实现 remedy 侧**

修改 `packages/core/src/fengshui/remedy.ts`：

① `sortRemedies` 增加可选第二参，**租住时把「需自有」整体降级到最后**（折叠而非删除——spec §6 明确要求保留）：

```ts
/**
 * 零成本优先；同级内双重支撑先于传统象征；再按 id 稳定排序。
 * 传入 `{ tenancy: "rent" }` 时，「需自有」条目整体降到最后 —— 首发市场租房比例高，
 * 「把卧室换到东南方」对租客是废话，但**折叠不等于删除**（用户可能将来买房）。
 */
export function sortRemedies(list: Remedy[], opts?: { tenancy: "rent" | "own" }): Remedy[] {
  const demote = (r: Remedy) => (opts?.tenancy === "rent" && r.tenancy === "需自有" ? 1 : 0);
  return [...list].sort((a, b) =>
    demote(a) - demote(b) ||
    EFFORT_ORDER[a.effort] - EFFORT_ORDER[b.effort] ||
    (a.evidence === b.evidence ? 0 : a.evidence === "双重支撑" ? -1 : 1) ||
    a.id.localeCompare(b.id),
  );
}
```

② 新增宅层化解生成。**注意 `Remedy` 是判别联合**——「传统象征」条目的 `modern` 必须写成字面 `null`，不要放宽类型：

```ts
import type { DwellingGua } from "./dwelling";

/**
 * 宅层化解（EP-fs-12）：依据宅卦八方，而非命卦。与个人层化解并存 ——
 * 个人层说「你自己该朝哪坐」，宅层说「这套房子的哪块地方该怎么用」。
 */
export function buildDwellingRemedies(dwelling: DwellingGua, match: "相配" | "相冲"): Remedy[] {
  const sectors = Object.values(dwelling.sectors);
  const bestSector = sectors.filter((v) => v.auspicious).sort((a, b) => a.rank - b.rank)[0]!;
  const worstSector = sectors.filter((v) => !v.auspicious).sort((a, b) => a.rank - b.rank)[0]!;
  const out: Remedy[] = [
    {
      id: "fs-dw-best",
      target: `${DIRECTION_LABEL[bestSector.direction]}（宅${bestSector.star}位）`,
      action: `把每天久待的活动放到${DIRECTION_LABEL[bestSector.direction]}那一块——工作、阅读、会客都算`,
      effort: "挪动",
      tenancy: "租房可做",
      traditional: `${dwelling.guaName}宅的${bestSector.star}位在${DIRECTION_LABEL[bestSector.direction]}`,
      modern: "把高频活动集中到采光与动线最好的区域，减少一天里的无谓走动与环境切换",
      evidence: "双重支撑",
    },
    {
      id: "fs-dw-worst",
      target: `${DIRECTION_LABEL[worstSector.direction]}（宅${worstSector.star}位）`,
      action: `${DIRECTION_LABEL[worstSector.direction]}那一块用作储物或过道，别安排长时间停留`,
      effort: "挪动",
      tenancy: "租房可做",
      traditional: `${dwelling.guaName}宅的${worstSector.star}位在${DIRECTION_LABEL[worstSector.direction]}，宜静宜压`,
      modern: null,
      evidence: "传统象征",
    },
  ];
  if (match === "相冲") {
    out.push({
      id: "fs-dw-mismatch",
      target: "命宅不相配",
      action: "房子整体与你不同组时，重点放在你自己的四吉方——床头与常坐位对准这几个方位即可，不必推翻整套布局",
      effort: "零成本",
      tenancy: "租房可做",
      traditional: `${dwelling.group}与你的命卦不同组`,
      modern: "能改的先改：睡眠与久坐这两件事占掉一天多数时间，调它们的性价比高于重排全屋",
      evidence: "双重支撑",
    });
  }
  return out;
}
```

`DIRECTION_LABEL` 从 `./directions` import（文件顶部已有 import，追加即可）。

- [ ] **Step 5: 实现 index 侧（判别联合 + Layer 1 分支）**

修改 `packages/core/src/fengshui/index.ts`：

```ts
import { dwellingGua, matchWithPerson, type DwellingInput, type DwellingGua } from "./dwelling";
import { buildPersonalRemedies, buildDwellingRemedies, sortRemedies, type Remedy } from "./remedy";

export * from "./dwelling";

/** 改动命卦公式 / 游年表 / 化解生成规则时**必须**递增——它进报告指纹，旧报告靠它失效。 */
export const FENGSHUI_ENGINE_VERSION = "fs-2";

export type FengshuiInput = {
  birth: BirthInput;
  chart: UnifiedChart;
  /** 缺省或 facing 未知 = Layer 0 */
  dwelling?: DwellingInput;
};

/** 居所视图 = 宅卦结果 + 用户填的元信息 + 与本人的配合判定 */
export type DwellingView = DwellingGua & {
  id: string;
  name: string;
  kind: "home" | "office";
  tenancy: "rent" | "own";
  matchWithPerson: "相配" | "相冲";
};

type FengshuiChartBase = {
  engineVersion: string;
  mingGua: MingGua;
  personalDirections: Record<Direction, DirectionVerdict>;
  elementAffinity: ElementAffinity;
  remedies: Remedy[];
};

/**
 * 判别联合：**`dwelling` 存在当且仅当 `layer === 1`**，由编译器强制。
 * 用 `layer: 0 | 1` + 可选 `dwelling?` 会放过 `{ layer: 1, dwelling: undefined }` 这种非法状态。
 * 与 `Remedy` / `EnvPsychAnchor` 同一手法。
 */
export type FengshuiChart =
  | (FengshuiChartBase & { layer: 0; dwelling?: undefined; cohabitants?: undefined })
  | (FengshuiChartBase & { layer: 1; dwelling: DwellingView; cohabitants?: undefined });

export function computeFengshui(input: FengshuiInput): FengshuiChart {
  const mingGua = deriveMingGua(input.birth, input.chart);
  const personalDirections = directionsFor(mingGua.guaName);
  const affinity = elementDirections(deriveUsefulElements(input.chart.bazi));
  const personal = buildPersonalRemedies(mingGua, personalDirections, affinity);

  if (!input.dwelling) {
    return {
      layer: 0, engineVersion: FENGSHUI_ENGINE_VERSION,
      mingGua, personalDirections, elementAffinity: affinity,
      remedies: sortRemedies(personal),
    };
  }

  const d = input.dwelling;
  const gua = dwellingGua(d.facing);
  const match = matchWithPerson(mingGua, gua);
  const view: DwellingView = {
    ...gua, id: d.id, name: d.name, kind: d.kind, tenancy: d.tenancy, matchWithPerson: match,
  };
  return {
    layer: 1, engineVersion: FENGSHUI_ENGINE_VERSION,
    mingGua, personalDirections, elementAffinity: affinity,
    dwelling: view,
    remedies: sortRemedies([...personal, ...buildDwellingRemedies(gua, match)], { tenancy: d.tenancy }),
  };
}
```

同时在 `packages/core/src/index.ts` 的 fengshui 导出块追加值 `dwellingGua`、`matchWithPerson`、`buildDwellingRemedies`，类型 `DwellingInput`、`DwellingGua`、`DwellingView`。

- [ ] **Step 6: llm 侧一处类型放宽（保持诚实，不留假值）**

`packages/llm/src/fengshui/facts.ts` 现在把 `layer` 硬写成 `0`。`FengshuiChart` 变判别联合后这仍能编译，但会**把 Layer 1 的盘谎报成 layer 0**。改两处：

```ts
// 类型定义处
layer: 0 | 1;
// extractFengshuiFacts 返回处
layer: f.layer,
```

本 Task 只做这一处放宽保持诚实；Layer 1 的居所与合看事实由 Task 6 加入。

- [ ] **Step 7: 运行测试确认通过**

Run: `pnpm --filter @eamvp/core test && pnpm --filter @eamvp/llm test`
Expected: core 全绿（122 + 新增 10）、llm 全绿（130）

Run: `pnpm typecheck`
Expected: exit 0

- [ ] **Step 8: 变异验证**

①把 `sortRemedies` 的 `demote` 去掉 → 租房折叠测试必须红。②把判别联合改回 `layer: 0 | 1` + `dwelling?: DwellingView` → 在测试文件里写一个 `{ layer: 1 }` 缺 dwelling 的字面量，确认**改回后能编译通过**（即联合确实在起作用），随后还原并删掉该临时代码。两次都还原，`git status` 干净。写进报告。

- [ ] **Step 9: 提交**

```bash
git add packages/core packages/llm/src/fengshui/facts.ts
git commit -m "feat(fengshui): FengshuiChart 判别联合 + Layer1 分支 + 宅层化解 + 租房折叠 [EP-fs-12]"
```

---

## Task 4: 合看 `cohabitants`

**Files:**
- Create: `packages/core/src/fengshui/cohabitants.ts`
- Modify: `packages/core/src/fengshui/index.ts`（接入）、`packages/core/src/index.ts`（barrel）
- Test: `packages/core/test/fengshui-cohabitants.test.ts`

**Interfaces:**
- Consumes: `deriveMingGua`、`directionsFor`、`DirectionVerdict`、`Direction`、`DIRECTIONS`
- Produces: `CohabitantInput`、`Cohabitant`、`deriveCohabitants(main, list): Cohabitant[]`；`FengshuiInput.cohabitants`；Layer 1 的 `FengshuiChart.cohabitants: Cohabitant[]`

**产品意义：** 同一套房子对不同人吉凶不同——这是八宅的真实结论，也是真实风水咨询里最高频的问题（主卧朝向怎么选、孩子书桌放哪）。实现上它只是**拿同一个居所对多个档案各跑一遍纯函数**，几乎零额外工程。

- [ ] **Step 1: 写失败测试**

创建 `packages/core/test/fengshui-cohabitants.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, type BirthInput } from "../src/index";
import { deriveMingGua } from "../src/fengshui/ming-gua";
import { directionsFor } from "../src/fengshui/eight-mansions";
import { deriveCohabitants } from "../src/fengshui/cohabitants";

const mk = (over: Partial<BirthInput>): BirthInput =>
  BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false, ...over });

const person = (id: string, over: Partial<BirthInput>) => {
  const b = mk(over);
  return { profileId: id, name: id, birth: b, chart: computeUnifiedChart(b) };
};

// 1990 男 = 坎1（东四）；1984 男 = 兑7（西四）——刻意取一东一西
const main = person("main", {});
const west = person("west", { date: "1984-06-15" });
const alsoEast = person("east2", { date: "1991-06-15" }); // 离9，东四

describe("EP-fs-13 合看", () => {
  it("每位同住人各自算出命卦，不受主档案影响", () => {
    const c = deriveCohabitants(main, [west, alsoEast]);
    expect(c).toHaveLength(2);
    expect(c[0]!.mingGua.guaName).toBe("兑");
    expect(c[1]!.mingGua.guaName).toBe("离");
  });

  it("conflicts = 对主档案吉、对此人凶的方位（东西异组时必非空）", () => {
    const [w] = deriveCohabitants(main, [west]);
    expect(w!.conflicts.length).toBeGreaterThan(0);
    const mainV = directionsFor(deriveMingGua(main.birth, main.chart).guaName);
    const wV = directionsFor(deriveMingGua(west.birth, west.chart).guaName);
    for (const d of w!.conflicts) {
      expect(mainV[d].auspicious).toBe(true);
      expect(wV[d].auspicious).toBe(false);
    }
  });

  it("东西异组时 sharedGood 为空——四吉方分属两组，无交集", () => {
    const [w] = deriveCohabitants(main, [west]);
    expect(w!.sharedGood).toEqual([]);
  });

  it("同组的两人 sharedGood 非空、conflicts 为空", () => {
    const [e] = deriveCohabitants(main, [alsoEast]);
    expect(e!.sharedGood.length).toBeGreaterThan(0);
    expect(e!.conflicts).toEqual([]);
  });

  it("sharedGood 对所有人都吉（含主档案）", () => {
    const list = deriveCohabitants(main, [west, alsoEast]);
    const mainV = directionsFor(deriveMingGua(main.birth, main.chart).guaName);
    for (const c of list) {
      const cv = directionsFor(c.mingGua.guaName);
      for (const d of c.sharedGood) {
        expect(mainV[d].auspicious).toBe(true);
        expect(cv[d].auspicious).toBe(true);
      }
    }
  });

  it("空列表 → 空结果，不抛错", () => {
    expect(deriveCohabitants(main, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-cohabitants.test.ts`
Expected: FAIL — `Failed to resolve import "../src/fengshui/cohabitants"`

- [ ] **Step 3: 实现**

创建 `packages/core/src/fengshui/cohabitants.ts`：

```ts
import type { BirthInput } from "../types/birth-input";
import type { UnifiedChart } from "../types/chart";
import { DIRECTIONS, type Direction } from "./directions";
import { directionsFor } from "./eight-mansions";
import { deriveMingGua, type MingGua } from "./ming-gua";

/**
 * 合看（EP-fs-13）：同一套房子对不同人的吉凶不同 —— 这不是玄学修辞，
 * 而是八宅的直接结论（吉凶由**各人命卦**定，与房子无关）。
 * 实现上只是拿同一批方位对多个档案各跑一遍 `directionsFor`，无额外状态。
 */

export type CohabitantInput = {
  profileId: string;
  name: string;
  birth: BirthInput;
  chart: UnifiedChart;
};

export type Cohabitant = {
  profileId: string;
  name: string;
  mingGua: MingGua;
  /** 对主档案吉、对此人凶 —— 安排共用空间时最需要提醒的方位 */
  conflicts: Direction[];
  /** 对主档案与此人皆吉 —— 共用区域优先选这里 */
  sharedGood: Direction[];
};

export function deriveCohabitants(main: CohabitantInput, list: CohabitantInput[]): Cohabitant[] {
  const mainVerdicts = directionsFor(deriveMingGua(main.birth, main.chart).guaName);
  return list.map((p) => {
    const mingGua = deriveMingGua(p.birth, p.chart);
    const v = directionsFor(mingGua.guaName);
    const conflicts: Direction[] = [];
    const sharedGood: Direction[] = [];
    for (const d of DIRECTIONS) {
      if (mainVerdicts[d].auspicious && !v[d].auspicious) conflicts.push(d);
      if (mainVerdicts[d].auspicious && v[d].auspicious) sharedGood.push(d);
    }
    return { profileId: p.profileId, name: p.name, mingGua, conflicts, sharedGood };
  });
}
```

- [ ] **Step 4: 接入 `computeFengshui`**

修改 `packages/core/src/fengshui/index.ts`：`FengshuiInput` 增加 `cohabitants?: CohabitantInput[]`；判别联合的 Layer 1 分支把 `cohabitants?: undefined` 改为 `cohabitants: Cohabitant[]`；Layer 1 返回时填入

```ts
cohabitants: input.cohabitants?.length
  ? deriveCohabitants({ profileId: "main", name: "", birth: input.birth, chart: input.chart }, input.cohabitants)
  : [],
```

并 `export * from "./cohabitants";`，同时在 `packages/core/src/index.ts` 追加 `deriveCohabitants` 与类型 `CohabitantInput`、`Cohabitant`。

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @eamvp/core test`
Expected: 全绿

Run: `pnpm typecheck`
Expected: exit 0

- [ ] **Step 6: 变异验证**

把 `conflicts` 的判定从 `mainVerdicts[d].auspicious && !v[d].auspicious` 改成 `!v[d].auspicious`（去掉「对主档案吉」这半边）→ 必须有测试变红。还原，写进报告。

- [ ] **Step 7: 提交**

```bash
git add packages/core
git commit -m "feat(fengshui): 合看——同宅对不同人的吉凶对照 [EP-fs-13]"
```

---

## Task 5: `adviseObject` 强版（落到宅方位）

**Files:**
- Modify: `packages/core/src/fengshui/object-advisor.ts`
- Test: `packages/core/test/fengshui-object.test.ts`（扩充）

**Interfaces:**
- Consumes: `DirectionVerdict`、`Direction`、`ElementAffinity`
- Produces: `ObjectAdviceInput` 增加可选 `dwellingSectors?: Record<Direction, DirectionVerdict>`；`ObjectAdvice` 增加 `dwellingNote: string | null`

**签名兼容性是硬要求：** 波 1 的 `adviseObject(input, q)` 已在物件顾问页调用。新增字段必须**可选**，不传时行为与波 1 逐字节一致。

**判定叠加：** 有居所时，推荐方位需**同时**是命卦吉方与宅卦吉方；若交集为空，退回命卦吉方并在 `dwellingNote` 里说明这套房子在这件物件上帮不上忙。

- [ ] **Step 1: 写失败测试**

在 `packages/core/test/fengshui-object.test.ts` 末尾追加：

```ts
describe("EP-fs-18 物件顾问强版（有居所）", () => {
  const dwellingSectors = directionsFor("乾"); // 西四宅：吉方 NW/W/NE/SW

  it("不传 dwellingSectors 时行为与波1 完全一致", () => {
    const weak = adviseObject(base, { category: "desk", material: "原木" });
    const same = adviseObject({ ...base, dwellingSectors: undefined }, { category: "desk", material: "原木" });
    expect(same).toEqual(weak);
    expect(same.dwellingNote).toBeNull();
  });

  it("有居所时推荐方位必须同时是命卦吉方与宅卦吉方", () => {
    const withHouse = directionsFor("坎"); // 东四宅，与坎命同组 → 交集非空
    const a = adviseObject({ ...base, dwellingSectors: withHouse }, { category: "desk", material: "原木" });
    for (const r of a.recommendedDirections) {
      expect(base.verdicts[r.direction].auspicious).toBe(true);
      expect(withHouse[r.direction].auspicious).toBe(true);
    }
    expect(a.recommendedDirections.length).toBeGreaterThan(0);
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/core exec vitest run test/fengshui-object.test.ts`
Expected: FAIL — `dwellingSectors` / `dwellingNote` 不存在

- [ ] **Step 3: 实现**

修改 `packages/core/src/fengshui/object-advisor.ts`：

① 类型：

```ts
export type ObjectAdviceInput = {
  verdicts: Record<Direction, DirectionVerdict>;
  affinity: ElementAffinity;
  /** Layer 1 起可选传入宅卦八方；不传 = 波1 弱版行为，逐字节不变 */
  dwellingSectors?: Record<Direction, DirectionVerdict>;
};
```

`ObjectAdvice` 追加 `dwellingNote: string | null;`

② `adviseObject` 里，在挑选 `picked` 之前先按宅方位收窄：

```ts
  const { verdicts, affinity, dwellingSectors } = input;
  // …（el / all / good / bad / elDirs 保持原样）…

  // Layer 1：推荐位需同时是命卦吉方与宅卦吉方。交集为空说明这套房子在这件物件上
  // 帮不上忙——此时退回命卦吉方（人比房子更要紧），并显式说明，而不是给空数组。
  const houseGood = dwellingSectors ? good.filter((v) => dwellingSectors[v.direction].auspicious) : good;
  const usable = houseGood.length ? houseGood : good;
  const dwellingNote =
    dwellingSectors && houseGood.length === 0
      ? "这套房子的吉方与你的命卦吉方不重合，以下按你自己的吉方给建议——人比房子要紧，先顾好你久待的那几处。"
      : null;

  const preferred = usable.filter((v) => elDirs.includes(v.direction));
  const picked = (preferred.length ? preferred : usable).slice(0, 3);
```

③ 返回对象追加 `dwellingNote`。

⚠️ 不要改动 `avoid` 的计算（它只由命卦四凶方决定，波 1 已有测试锁定这一独立性）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @eamvp/core test`
Expected: 全绿（含波 1 那条「不传时与弱版一致」的回归）

- [ ] **Step 5: 变异验证**

把 `usable` 改成恒等于 `houseGood`（去掉退回分支）→ 交集为空的测试必须红（会得到空推荐）。还原，写进报告。

- [ ] **Step 6: 提交**

```bash
git add packages/core
git commit -m "feat(fengshui): 物件顾问强版——落到宅方位，交集为空显式退回 [EP-fs-18]"
```

---

## Task 6: llm — Layer 1 事实与提示

**Files:**
- Modify: `packages/llm/src/fengshui/facts.ts`、`packages/llm/src/fengshui/prompt.ts`
- Test: `packages/llm/src/fengshui/facts.test.ts`、`prompt.test.ts`（扩充）

**Interfaces:**
- Consumes: `FengshuiChart`（判别联合，Task 3）、`Cohabitant`（Task 4）
- Produces: `FengshuiFacts` 增加 `dwelling`、`cohabitants`；`FENGSHUI_FACT_KEYS` 同步扩充

**⚠️ 字段白名单是硬闸门：** `FENGSHUI_FACT_KEYS` 有一条测试断言 facts 的键集合恰好等于白名单——**新增字段不同步白名单，测试会红**。这道闸就是为了让「Layer 1 加字段」这一刻必须有人显式决定该字段能否进 prompt。这正是波 1 设计它的场景，不要绕过。

- [ ] **Step 1: 写失败测试**

在 `packages/llm/src/fengshui/facts.test.ts` 追加：

```ts
describe("EP-fs-16 Layer 1 事实", () => {
  const dwelling = { id: "d1", name: "家", kind: "home" as const, tenancy: "rent" as const, facing: "S" as const };
  const l1 = computeFengshui({ birth, chart: computeUnifiedChart(birth), dwelling });

  it("Layer 1 的 facts 带 dwelling，layer 如实为 1", () => {
    const f = extractFengshuiFacts(l1);
    expect(f.layer).toBe(1);
    expect(f.dwelling).toBeTruthy();
    expect(f.dwelling!.guaName).toBe("坎");
    expect(f.dwelling!.sectors).toHaveLength(8);
    expect(["相配", "相冲"]).toContain(f.dwelling!.matchWithPerson);
  });

  it("Layer 0 的 facts 里 dwelling 为 null（不是 undefined，便于序列化稳定）", () => {
    const f = extractFengshuiFacts(computeFengshui({ birth, chart: computeUnifiedChart(birth) }));
    expect(f.layer).toBe(0);
    expect(f.dwelling).toBeNull();
  });

  it("居所事实不夹带 id 等内部标识（只喂模型需要引用的东西）", () => {
    const f = extractFengshuiFacts(l1);
    expect(JSON.stringify(f)).not.toContain("d1");
  });

  it("白名单已同步——新增字段必须显式过闸", () => {
    const f = extractFengshuiFacts(l1);
    expect(Object.keys(f).sort()).toEqual([...FENGSHUI_FACT_KEYS].sort());
    expect(FENGSHUI_FACT_KEYS).toContain("dwelling");
    expect(FENGSHUI_FACT_KEYS).toContain("cohabitants");
  });
});
```

在 `prompt.test.ts` 追加：

```ts
describe("EP-fs-16 Layer 1 提示", () => {
  const dwelling = { id: "d1", name: "家", kind: "home" as const, tenancy: "rent" as const, facing: "S" as const };
  const l1Facts = extractFengshuiFacts(computeFengshui({ birth, chart: computeUnifiedChart(birth), dwelling }));

  it("user prompt 带入宅卦与宅八方，并与命卦八方分开标注", () => {
    const u = buildFengshuiUserPrompt(l1Facts);
    expect(u).toContain("坎宅");
    expect(u).toMatch(/宅.*八方|房屋八方/);
    expect(u).toMatch(/本命八方|命卦八方/);
  });

  it("Layer 0 的 user prompt 不出现宅相关段落（不给模型无中生有的余地）", () => {
    const u = buildFengshuiUserPrompt(extractFengshuiFacts(computeFengshui({ birth, chart: computeUnifiedChart(birth) })));
    expect(u).not.toContain("宅卦");
  });

  it("system prompt 明令命卦八方与宅卦八方不得混用", () => {
    expect(buildFengshuiSystemPrompt("zh")).toMatch(/不得混用|分别对应|两套/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/llm exec vitest run src/fengshui/`
Expected: FAIL — `f.dwelling` 不存在、白名单缺 dwelling/cohabitants

- [ ] **Step 3: 实现 facts**

`packages/llm/src/fengshui/facts.ts`：类型追加

```ts
  /** Layer 0 时为 null。刻意不放 id —— 模型不需要、也不该看到内部标识 */
  dwelling: {
    name: string; kind: string; tenancy: string;
    facingLabel: string; sittingLabel: string;
    guaName: string; group: string; matchWithPerson: string;
    sectors: { direction: Direction; label: string; star: FengshuiStar; auspicious: boolean; rank: number }[];
  } | null;
  cohabitants: { name: string; mingGua: string; group: string;
                 conflicts: string[]; sharedGood: string[] }[];
```

`FENGSHUI_FACT_KEYS` 追加 `"dwelling"`, `"cohabitants"`。

`extractFengshuiFacts` 内：

```ts
  const dwelling = f.layer === 1 ? {
    name: f.dwelling.name, kind: f.dwelling.kind, tenancy: f.dwelling.tenancy,
    facingLabel: DIRECTION_LABEL[f.dwelling.facing],
    sittingLabel: DIRECTION_LABEL[f.dwelling.sitting],
    guaName: f.dwelling.guaName, group: f.dwelling.group,
    matchWithPerson: f.dwelling.matchWithPerson,
    sectors: DIRECTIONS.map((d) => {
      const v = f.dwelling.sectors[d];
      return { direction: d, label: DIRECTION_LABEL[d], star: v.star, auspicious: v.auspicious, rank: v.rank };
    }),
  } : null;
  const cohabitants = (f.layer === 1 ? f.cohabitants : []).map((c) => ({
    name: c.name, mingGua: `${c.mingGua.guaName}${c.mingGua.gua}`, group: c.mingGua.group,
    conflicts: c.conflicts.map((d) => DIRECTION_LABEL[d]),
    sharedGood: c.sharedGood.map((d) => DIRECTION_LABEL[d]),
  }));
```

并在返回对象里加上 `layer: f.layer, dwelling, cohabitants`。

- [ ] **Step 4: 实现 prompt**

`packages/llm/src/fengshui/prompt.ts`：

① `buildFengshuiSystemPrompt` 的硬规则里追加一条（放在八星白名单那条之后）：

```
`${FENGSHUI_GUARDRAILS.length + 3}. 「本命八方」由命卦定、「房屋八方」由宅卦定，是两套彼此独立的判语，**不得混用或互相推导**。谈某个方位时必须说清是哪一套。`
```

② `buildFengshuiUserPrompt` 里，把现有方位段落的标题改为「本命八方判语：」，并在其后追加（仅 Layer 1）：

```ts
  const dwellingBlock = facts.dwelling ? [
    ``,
    `居所：${facts.dwelling.name}（${facts.dwelling.kind === "home" ? "住宅" : "办公"}，${facts.dwelling.tenancy === "rent" ? "租住" : "自有"}）`,
    `坐向：坐${facts.dwelling.sittingLabel}向${facts.dwelling.facingLabel} → ${facts.dwelling.guaName}宅（${facts.dwelling.group}）`,
    `与你：${facts.dwelling.matchWithPerson}`,
    `房屋八方判语（与上面的本命八方是两套，勿混用）：`,
    ...facts.dwelling.sectors
      .slice()
      .sort((a, b) => Number(b.auspicious) - Number(a.auspicious) || a.rank - b.rank)
      .map((d) => `- ${d.label}：${d.star}（${d.auspicious ? "吉" : "凶"}，第${d.rank}）`),
  ] : [];

  const cohabBlock = facts.cohabitants.length ? [
    ``,
    `同住人（同一套房子对每个人吉凶不同，这是八宅的直接结论，不要说成"因人而异的感受"）：`,
    ...facts.cohabitants.map((c) =>
      `- ${c.name}：${c.mingGua}（${c.group}）｜对你吉但对 TA 凶：${c.conflicts.join("、") || "无"}｜双方皆吉：${c.sharedGood.join("、") || "无"}`),
  ] : [];
```

把两个 block 插进返回数组（居所段在方位段之后、喜忌段之前）。

⚠️ **`sort` 前必须 `.slice()` 复制**——波 1 曾因直接 `.sort()` 原地改了调用方的 facts 数组，有专门测试锁定，别重蹈。

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @eamvp/llm test`
Expected: 全绿

Run: `pnpm typecheck`
Expected: exit 0

- [ ] **Step 6: 变异验证**

把 `FENGSHUI_FACT_KEYS` 里新加的 `"dwelling"` 删掉 → 白名单测试必须红（证明闸门仍在起作用）。还原，写进报告。

- [ ] **Step 7: 提交**

```bash
git add packages/llm
git commit -m "feat(fengshui): facts/prompt 承载居所与合看事实，两套八方显式分开 [EP-fs-16]"
```

---

## Task 7: web 数据层 — 居所访问 + 报告服务端持久化

**Files:**
- Create: `apps/web/lib/dwellings.ts`、`apps/web/lib/fengshui-report.ts`
- Delete: `apps/web/lib/fengshui-cache.ts`
- Test: `apps/web/lib/__tests__/fengshui-report.test.ts`

**Interfaces:**
- Consumes: `supabase()`/`ensureSession()`（`@/lib/supabase`）、`FENGSHUI_ENGINE_VERSION`、`DwellingInput`
- Produces: `Dwelling`、`listDwellings()`、`createDwelling()`、`updateDwelling()`、`deleteDwelling()`；`FengshuiSections`、`fengshuiFingerprint(...)`、`readFengshuiReport(fp)`、`saveFengshuiReport(...)`

**为什么废掉 localStorage：** 波 1 按 `(profileId, 引擎版本, locale)` 做键。波 2 的报告还依赖**居所字段**与**参与合看的档案集合**——改朝向、增减同住人都必须让报告失效，而这些进不了那个键。换成服务端 `fengshui_reports` + `input_fingerprint`，顺带获得跨设备一致。**这是替换、不是新增一层缓存**，不要两套并存。

- [ ] **Step 1: 写失败测试**

创建 `apps/web/lib/__tests__/fengshui-report.test.ts`（纯函数部分，不碰网络）：

```ts
import { describe, it, expect } from "vitest";
import { fengshuiFingerprint } from "../fengshui-report";

const base = {
  profileId: "p1", locale: "zh", engineVersion: "fs-2",
  dwelling: { id: "d1", facing: "S", tenancy: "rent" as const, kind: "home" as const },
  memberProfileIds: ["p2", "p3"],
};

describe("EP-fs-16 报告指纹", () => {
  it("同输入同指纹（可缓存）", () => {
    expect(fengshuiFingerprint(base)).toBe(fengshuiFingerprint({ ...base }));
  });

  it("改朝向 → 指纹变（这是 localStorage 那套键做不到的）", () => {
    expect(fengshuiFingerprint({ ...base, dwelling: { ...base.dwelling, facing: "N" } }))
      .not.toBe(fengshuiFingerprint(base));
  });

  it("增减同住人 → 指纹变", () => {
    expect(fengshuiFingerprint({ ...base, memberProfileIds: ["p2"] })).not.toBe(fengshuiFingerprint(base));
  });

  it("同住人顺序不影响指纹（集合语义，避免无谓重生成）", () => {
    expect(fengshuiFingerprint({ ...base, memberProfileIds: ["p3", "p2"] })).toBe(fengshuiFingerprint(base));
  });

  it("切语言 / 换引擎版本 / 换档案 → 指纹变", () => {
    expect(fengshuiFingerprint({ ...base, locale: "en" })).not.toBe(fengshuiFingerprint(base));
    expect(fengshuiFingerprint({ ...base, engineVersion: "fs-3" })).not.toBe(fengshuiFingerprint(base));
    expect(fengshuiFingerprint({ ...base, profileId: "pX" })).not.toBe(fengshuiFingerprint(base));
  });

  it("Layer 0（无居所）也有稳定指纹", () => {
    const l0 = { ...base, dwelling: null, memberProfileIds: [] };
    expect(fengshuiFingerprint(l0)).toBe(fengshuiFingerprint({ ...l0 }));
    expect(fengshuiFingerprint(l0)).not.toBe(fengshuiFingerprint(base));
  });

  it("租售状态变化 → 指纹变（它会改变化解排序）", () => {
    expect(fengshuiFingerprint({ ...base, dwelling: { ...base.dwelling, tenancy: "own" } }))
      .not.toBe(fengshuiFingerprint(base));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/web exec vitest run lib/__tests__/fengshui-report.test.ts`
Expected: FAIL — `Failed to resolve import "../fengshui-report"`

- [ ] **Step 3: 实现 `fengshui-report.ts`**

```ts
import { supabase, ensureSession } from "@/lib/supabase";

export type FengshuiSections = { situation: string; youAndSpace: string; actions: string };

export type FingerprintInput = {
  profileId: string;
  locale: string;
  engineVersion: string;
  /** null = Layer 0 */
  dwelling: { id: string; facing: string; tenancy: "rent" | "own"; kind: "home" | "office" } | null;
  memberProfileIds: string[];
};

/**
 * 报告指纹（EP-fs-16）。与三段式解读不同：命盘冻结所以解读永久有效，
 * 而居所可变 —— 改朝向、增减同住人、切语言、升引擎版本都必须让旧报告失效。
 * 波1 用的 (档案,版本,locale) localStorage 键装不下居所与成员集合，故换成指纹。
 * 同住人按集合语义（排序后入参），避免顺序变动触发无谓重生成。
 */
export function fengshuiFingerprint(i: FingerprintInput): string {
  const canonical = JSON.stringify({
    p: i.profileId,
    l: i.locale,
    v: i.engineVersion,
    d: i.dwelling ? [i.dwelling.id, i.dwelling.facing, i.dwelling.tenancy, i.dwelling.kind] : null,
    m: [...i.memberProfileIds].sort(),
  });
  // djb2：确定性、无依赖、够用（这不是安全哈希，只用来做缓存键）
  let h = 5381;
  for (let k = 0; k < canonical.length; k++) h = ((h << 5) + h + canonical.charCodeAt(k)) | 0;
  return `fs${(h >>> 0).toString(36)}`;
}

export async function readFengshuiReport(fingerprint: string): Promise<FengshuiSections | null> {
  await ensureSession();
  const { data, error } = await supabase()
    .from("fengshui_reports").select("sections")
    .eq("input_fingerprint", fingerprint).maybeSingle();
  if (error) throw error;
  return (data?.sections as FengshuiSections) ?? null;
}

export async function saveFengshuiReport(args: {
  fingerprint: string; profileId: string; dwellingId: string | null;
  layer: 0 | 1; locale: string; sections: FengshuiSections;
}): Promise<void> {
  const uid = await ensureSession();
  const { error } = await supabase().from("fengshui_reports").upsert({
    uid, input_fingerprint: args.fingerprint, profile_id: args.profileId,
    dwelling_id: args.dwellingId, layer: args.layer, locale: args.locale, sections: args.sections,
  }, { onConflict: "uid,input_fingerprint" });
  if (error) throw error;
}
```

- [ ] **Step 4: 实现 `dwellings.ts`**

```ts
import { supabase, ensureSession } from "@/lib/supabase";
import type { Direction } from "@eamvp/core";

export type Dwelling = {
  id: string; name: string;
  kind: "home" | "office";
  tenancy: "rent" | "own";
  /** null = 用户选了「不确定」→ 页面降级回 Layer 0 */
  facing: Direction | null;
  memberProfileIds: string[];
};

type Row = {
  id: string; name: string; kind: string; tenancy: string;
  facing: string | null; member_profile_ids: string[] | null;
};
const toDwelling = (r: Row): Dwelling => ({
  id: r.id, name: r.name,
  kind: r.kind === "office" ? "office" : "home",
  tenancy: r.tenancy === "own" ? "own" : "rent",
  facing: (r.facing as Direction | null) ?? null,
  memberProfileIds: r.member_profile_ids ?? [],
});

export async function listDwellings(): Promise<Dwelling[]> {
  await ensureSession();
  const { data, error } = await supabase()
    .from("dwellings").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(toDwelling);
}

export async function createDwelling(d: Omit<Dwelling, "id">): Promise<Dwelling> {
  const uid = await ensureSession();
  const { data, error } = await supabase().from("dwellings").insert({
    uid, name: d.name, kind: d.kind, tenancy: d.tenancy,
    facing: d.facing, member_profile_ids: d.memberProfileIds,
  }).select("*").single();
  if (error) throw error;
  return toDwelling(data as Row);
}

export async function updateDwelling(id: string, patch: Partial<Omit<Dwelling, "id">>): Promise<void> {
  await ensureSession();
  const { error } = await supabase().from("dwellings").update({
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.kind !== undefined && { kind: patch.kind }),
    ...(patch.tenancy !== undefined && { tenancy: patch.tenancy }),
    ...(patch.facing !== undefined && { facing: patch.facing }),
    ...(patch.memberProfileIds !== undefined && { member_profile_ids: patch.memberProfileIds }),
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
}

export async function deleteDwelling(id: string): Promise<void> {
  await ensureSession();
  const { error } = await supabase().from("dwellings").delete().eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 5: 删除 localStorage 缓存**

删除 `apps/web/lib/fengshui-cache.ts`。此时 `app/fengshui/page.tsx` 会因 import 失效而编译报错——**这是预期的**，Task 9 会把页面改到新数据层。为让本 task 独立可交付，先把 `page.tsx` 顶部的 `fengshui-cache` import 与三处调用替换为 `fengshui-report` 的等价调用（指纹用 `dwelling: null, memberProfileIds: []` 走 Layer 0），Tab 化留给 Task 9。

- [ ] **Step 6: 运行测试与类型检查**

Run: `pnpm --filter @eamvp/web test`
Expected: 全绿（原缓存相关用例已随页面改造调整）

Run: `pnpm typecheck`
Expected: exit 0

- [ ] **Step 7: 提交**

```bash
git add apps/web/lib apps/web/app/fengshui
git rm apps/web/lib/fengshui-cache.ts
git commit -m "feat(fengshui): 居所数据层 + 报告服务端持久化（指纹失效），废弃 localStorage 缓存 [EP-fs-11/16]"
```

---

## Task 8: 居所录入与管理页

**Files:**
- Create: `apps/web/app/fengshui/DwellingForm.tsx`、`apps/web/app/fengshui/dwellings/page.tsx`
- Modify: `apps/web/lib/i18n/messages/{zh,en}.ts`
- Test: `apps/web/app/fengshui/__tests__/DwellingForm.test.tsx`

**Interfaces:**
- Consumes: `listDwellings`/`createDwelling`/`updateDwelling`/`deleteDwelling`（Task 7）、`DIRECTIONS`/`DIRECTION_LABEL`
- Produces: `DwellingForm({ initial?, onSaved })`；路由 `/fengshui/dwellings`

**一个真实的坑（spec §8.3）：** 「你家大门朝哪」比想象中难，**相当比例的用户会填反**——传统的「向」是大门**朝外**的方向，不是站在门外看房子的方向。三个应对缺一不可：①图形化八方位选择器，不用下拉框；②明确提示语「站在屋内、面朝大门，你面对的方向」；③**给「不确定」选项**，选它就降级回 Layer 0，而不是逼用户瞎猜出一份错报告。

- [ ] **Step 1: 写失败测试**

创建 `apps/web/app/fengshui/__tests__/DwellingForm.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { DwellingForm } from "../DwellingForm";

const createDwelling = vi.fn(async (d: unknown) => ({ id: "d1", ...(d as object) }));
vi.mock("@/lib/dwellings", () => ({
  createDwelling: (d: unknown) => createDwelling(d),
  updateDwelling: vi.fn(async () => {}),
}));

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider locale="zh">{children}</I18nProvider>
);
beforeEach(() => createDwelling.mockClear());

describe("EP-fs-14 居所录入", () => {
  it("八个方位都是可点的按钮，不是下拉框（避免误选，且更易读）", () => {
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    for (const label of ["北", "东北", "东", "东南", "南", "西南", "西", "西北"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("显示防填反的提示语——「向」是站在屋内面朝大门的方向", () => {
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByText(/站在屋内、面朝大门/)).toBeInTheDocument();
  });

  it("提供「不确定」选项，选它保存出 facing=null（降级 Layer 0，而非逼用户瞎猜）", async () => {
    const onSaved = vi.fn();
    render(<DwellingForm onSaved={onSaved} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: /不确定/ }));
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(createDwelling).toHaveBeenCalled());
    expect(createDwelling.mock.calls[0]![0]).toMatchObject({ facing: null });
    expect(onSaved).toHaveBeenCalled();
  });

  it("选具体方位后保存出对应枚举值", async () => {
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: /^南/ }));
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(createDwelling).toHaveBeenCalled());
    expect(createDwelling.mock.calls[0]![0]).toMatchObject({ facing: "S" });
  });

  it("租/自有可选，默认租住（首发市场租房比例高）", async () => {
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: /^南/ }));
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(createDwelling).toHaveBeenCalled());
    expect(createDwelling.mock.calls[0]![0]).toMatchObject({ tenancy: "rent" });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/web exec vitest run app/fengshui/__tests__/DwellingForm.test.tsx`
Expected: FAIL — `Failed to resolve import "../DwellingForm"`

- [ ] **Step 3: 加 i18n 文案**

`zh.ts` 的 `fengshui` 命名空间下追加，并在 `en.ts` 加**键结构完全一致**的英文版：

```ts
    dwelling: {
      title: "我的居所",
      add: "添加居所",
      nameLabel: "名称",
      namePlaceholder: "家 / 办公室",
      kindHome: "住宅",
      kindOffice: "办公",
      tenancyRent: "租住",
      tenancyOwn: "自有",
      facingLabel: "大门朝向",
      facingHint: "站在屋内、面朝大门，你面对的方向。不确定就选「不确定」——我们会只按你的本命方位给建议，不猜。",
      facingUnknown: "不确定",
      save: "保存",
      saving: "保存中…",
      empty: "还没有登记居所。填一个朝向，就能看到这套房子对你的八方吉凶。",
      deleteConfirm: "删除这个居所？相关报告也会一并失效。",
      membersLabel: "同住人",
      membersHint: "同一套房子对每个人的吉凶不同——加进来可以看对照。",
    },
```

- [ ] **Step 4: 实现 `DwellingForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { DIRECTIONS, DIRECTION_LABEL, type Direction } from "@eamvp/core";
import { createDwelling, updateDwelling, type Dwelling } from "@/lib/dwellings";
import { useT } from "@/lib/i18n/I18nProvider";
import { Button } from "@/components/ui";

/**
 * 居所录入（EP-fs-14）。
 * ⚠️ 朝向是本表单唯一容易出错的输入：「向」指大门**朝外**的方向，
 * 相当比例的用户会理解反。三重应对：图形化按钮（非下拉）、明确提示语、
 * 以及「不确定」选项 —— 宁可降级回 Layer 0，也不要一份方向性错误的报告。
 */
export function DwellingForm({ initial, onSaved }: { initial?: Dwelling; onSaved: (d: Dwelling) => void }) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<"home" | "office">(initial?.kind ?? "home");
  const [tenancy, setTenancy] = useState<"rent" | "own">(initial?.tenancy ?? "rent");
  const [facing, setFacing] = useState<Direction | null>(initial?.facing ?? null);
  const [touchedFacing, setTouchedFacing] = useState(initial != null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const payload = {
        name: name.trim() || t("fengshui.dwelling.namePlaceholder"),
        kind, tenancy, facing, memberProfileIds: initial?.memberProfileIds ?? [],
      };
      const saved = initial
        ? (await updateDwelling(initial.id, payload), { ...initial, ...payload })
        : await createDwelling(payload);
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-[13px] text-ink-2">
        {t("fengshui.dwelling.nameLabel")}
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder={t("fengshui.dwelling.namePlaceholder")} className="w-full" />
      </label>

      <Segmented value={kind} onChange={setKind}
        options={[["home", t("fengshui.dwelling.kindHome")], ["office", t("fengshui.dwelling.kindOffice")]]} />
      <Segmented value={tenancy} onChange={setTenancy}
        options={[["rent", t("fengshui.dwelling.tenancyRent")], ["own", t("fengshui.dwelling.tenancyOwn")]]} />

      <div>
        <p className="text-[13px] text-ink-2">{t("fengshui.dwelling.facingLabel")}</p>
        <p className="mt-1 text-[12px] text-muted">{t("fengshui.dwelling.facingHint")}</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {DIRECTIONS.map((d) => (
            <button key={d} type="button"
              onClick={() => { setFacing(d); setTouchedFacing(true); }}
              className="rounded-[var(--radius-button)] border px-2 py-2 text-[14px]"
              style={{
                borderColor: facing === d ? "var(--color-cinnabar)" : "var(--color-line)",
                color: facing === d ? "var(--color-cinnabar)" : "var(--color-ink)",
              }}>
              {DIRECTION_LABEL[d]}
            </button>
          ))}
          <button type="button"
            onClick={() => { setFacing(null); setTouchedFacing(true); }}
            className="col-span-4 rounded-[var(--radius-button)] border px-2 py-2 text-[13px]"
            style={{
              borderColor: touchedFacing && facing === null ? "var(--color-cinnabar)" : "var(--color-line)",
              color: touchedFacing && facing === null ? "var(--color-cinnabar)" : "var(--color-muted)",
            }}>
            {t("fengshui.dwelling.facingUnknown")}
          </button>
        </div>
      </div>

      <Button onClick={save} disabled={saving || !touchedFacing}>
        {saving ? t("fengshui.dwelling.saving") : t("fengshui.dwelling.save")}
      </Button>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: [T, string][];
}) {
  return (
    <div className="flex gap-2">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className="flex-1 rounded-[var(--radius-button)] border py-2 text-[14px]"
          style={{
            borderColor: value === v ? "var(--color-cinnabar)" : "var(--color-line)",
            color: value === v ? "var(--color-cinnabar)" : "var(--color-ink)",
          }}>
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: 实现管理页 `dwellings/page.tsx`**

结构照搬 `/fengshui/object/page.tsx` 的骨架（flag 门控 → 档案加载 → 内容），主体为：`listDwellings()` 结果逐条渲染（名称 / 类型 / 租售 / 朝向中文名或「不确定」/ 删除按钮，删除前 `confirm(t("fengshui.dwelling.deleteConfirm"))`），下方是 `<DwellingForm onSaved={…} />`；列表为空时显示 `t("fengshui.dwelling.empty")`。返回链接指向 `/fengshui`。

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm --filter @eamvp/web test`
Expected: 全绿（新增 5）

- [ ] **Step 7: 变异验证**

去掉「不确定」按钮 → 对应测试必须红。把提示语文案删掉 → 对应测试必须红。两次还原，写进报告。

- [ ] **Step 8: 提交**

```bash
git add apps/web
git commit -m "feat(fengshui): 居所录入（图形八方位 + 防填反提示 + 不确定降级）与管理页 [EP-fs-14]"
```

---

## Task 9: 「境」页 Tab 化 + 合看 chips

**Files:**
- Modify: `apps/web/app/fengshui/page.tsx`、`apps/web/app/api/fengshui/reading/route.ts`、i18n 双字典
- Test: `apps/web/app/fengshui/__tests__/page.test.tsx`（扩充）

**Interfaces:**
- Consumes: `listDwellings`（Task 7）、`fengshuiFingerprint`/`readFengshuiReport`/`saveFengshuiReport`（Task 7）、`computeFengshui` Layer 1（Task 3/4）
- Produces: Tab `[盘 | 化解 | 添置]`（i18n 键 `fengshui.tabs.*` 已存在，波 1 建的死键在此激活）

**合看 chips 是本波最好的演示：** 同一张八方图，切换家人，吉凶着色整体改变——一眼说明「为什么这房子对你和对他不一样」。

**必须保住的波 1 性质：** LLM 挂了盘图与化解仍完整渲染；`degraded` 为真时隐藏叙述、显示提示、不写缓存、有重试；flag 关闭时不渲染盘图。

- [ ] **Step 1: 写失败测试**

在 `page.test.tsx` 追加（沿用既有 `renderPage()` 辅助与 `vi.mock` 骨架，新增对 `@/lib/dwellings` 的 mock）：

```tsx
describe("EP-fs-15 Layer 1 与 Tab", () => {
  it("有居所时渲染宅卦与宅八方，且与本命八方分开标注", async () => { /* 断言页面同时出现「本命八方」与「房屋八方」两个标题，且宅卦名可见 */ });
  it("Tab 切到「化解」显示化解清单，切到「添置」显示物件顾问入口", async () => { /* 断言三个 tab 可点、内容互斥 */ });
  it("合看 chips：切换同住人，八方盘的吉凶着色随之改变", async () => {
    // 断言切换前后至少一个扇区的 aria-label 从「吉」变「凶」——
    // 这正是"同一套房对不同人不同"的可见证据，不能只断言 chip 被点了
  });
  it("居所 facing 为 null（不确定）时降级 Layer 0：不渲染宅八方，仍渲染本命八方", async () => { /* … */ });
  it("LLM 失败时宅八方与化解清单仍完整渲染（波1 性质不得回退）", async () => { /* … */ });
});
```

> 每条测试的具体断言由实现者补全，但**必须满足**：合看那条要断言**着色/判语真的变了**（读扇区 `aria-label`），不能只断言 chip 存在或被点击——波 1 反复出现过「渲染了但没验证被测逻辑」的空转断言。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @eamvp/web exec vitest run app/fengshui/__tests__/page.test.tsx`
Expected: FAIL

- [ ] **Step 3: 加 i18n**

`fengshui` 命名空间追加（zh/en 同步）：`dwellingTitle: "房屋八方"`、`personalTitle: "本命八方"`、`cohabitantsTitle: "同住人对照"`、`noDwelling: "还没登记居所——填一个大门朝向，就能看到这套房子对你的八方吉凶。"`、`addDwelling: "登记居所"`、`viewAs: "以谁的视角看"`、`facingUnknownNote: "这个居所的朝向未确定，下面只按你的本命方位给建议。"`。波 1 已存在的 `tabs.chart/remedy/object` 在此激活。

- [ ] **Step 4: 实现**

`page.tsx` 改造要点：
1. 加载 `listDwellings()`，取第一个（多居所切换属会员权益，Task 10 处理）；`facing === null` 时不传 dwelling → 走 Layer 0 并显示 `facingUnknownNote`。
2. `computeFengshui({ birth, chart, dwelling, cohabitants })`——cohabitants 由 `dwelling.memberProfileIds` 映射到各自档案（`getProfile(id)`）后传入。
3. 三个 Tab：`盘`（八方盘 + 本命/房屋两组判语 + 合看 chips）｜`化解`（化解清单 + 叙述第三节）｜`添置`（跳 `/fengshui/object` 的入口卡）。
4. `viewAs` chips：默认「我」，切到某位同住人时，八方盘改用**该人的** `directionsFor(其命卦)` 着色，并显示其 `conflicts`/`sharedGood`。
5. 报告请求体带上 `dwellingId` 与 `memberProfileIds`；缓存改用 `fengshuiFingerprint` + `readFengshuiReport`/`saveFengshuiReport`。
6. `route.ts` 接收居所与合看成员，服务端重新 `computeFengshui` 后交给 `generateFengshuiReading`。

- [ ] **Step 5: 运行测试与类型检查**

Run: `pnpm --filter @eamvp/web test && pnpm typecheck`
Expected: 全绿 / exit 0

- [ ] **Step 6: 变异验证**

把合看 chips 的着色切换改成恒用主档案的 `personalDirections` → 合看那条测试必须红。还原，写进报告。

- [ ] **Step 7: 提交**

```bash
git add apps/web
git commit -m "feat(fengshui): 「境」页 Tab 化 + 宅八方 + 合看 chips [EP-fs-15]"
```

---

## Task 10: 会员闸门

**Files:**
- Modify: `apps/web/app/fengshui/page.tsx`、`apps/web/app/fengshui/dwellings/page.tsx`、`apps/web/app/api/fengshui/reading/route.ts`
- Test: `apps/web/app/fengshui/__tests__/page.test.tsx`（扩充）

**Interfaces:**
- Consumes: `getEntitlement`/`isMember`（`@/lib/entitlements`）、既有 `Paywall` 组件
- Produces: 无新导出

**边界（spec §11）：** Layer 0 本命方位与物件顾问弱版**免费**；住宅实盘 + 分级化解、多住客合看、多套居所**会员**。**全程 `BILLING_ENABLED` 门控**——该 flag 在 pre-prod 默认关，关时不做任何限制。**不引入新的计费形态**：现有 Stripe/TG Stars 支付本身都还没接通，风水不该在此时再加一种买法。

- [ ] **Step 1: 写失败测试**

```tsx
describe("EP-fs-17 会员闸门", () => {
  it("BILLING_ENABLED 关闭时不做任何限制（pre-prod 默认态）", async () => { /* 非会员也能看到宅八方 */ });
  it("开闸 + 非会员：Layer 0 内容与物件顾问入口照常可见", async () => { /* 免费层不能被误伤 */ });
  it("开闸 + 非会员：宅八方与合看被 Paywall 取代", async () => { /* … */ });
  it("开闸 + 会员：宅八方与合看正常渲染", async () => { /* … */ });
  it("开闸 + 非会员：只能保存一个居所，第二个触发 Paywall", async () => { /* … */ });
});
```

- [ ] **Step 2–5: 失败 → 实现 → 通过 → 变异验证**

实现要点：页面读 `getEntitlement(uid)` → `isMember`；`BILLING_ENABLED !== "1"` 时直接视为放行。route 侧同样校验（客户端闸门可绕过，服务端必须独立判断）。变异：把 route 侧校验删掉 → 必须有测试红（证明不是只有客户端在挡）。

- [ ] **Step 6: 提交**

```bash
git add apps/web
git commit -m "feat(fengshui): 实盘/合看/多居所会员闸门，BILLING_ENABLED 门控 [EP-fs-17]"
```

---

## Task 11: 物件顾问接强版

**Files:**
- Modify: `apps/web/app/fengshui/ObjectAdvisorForm.tsx`、`apps/web/app/fengshui/object/page.tsx`、`apps/web/app/api/fengshui/object/route.ts`、i18n 双字典
- Test: `apps/web/app/fengshui/__tests__/ObjectAdvisorForm.test.tsx`（扩充）

**Interfaces:**
- Consumes: `adviseObject` 强版（Task 5，`dwellingSectors` 可选参）、`listDwellings`
- Produces: 无新导出

- [ ] **Step 1: 写失败测试**

```tsx
it("有居所时把宅八方传给 adviseObject，推荐位同时满足命卦与宅卦", async () => { /* … */ });
it("无居所时行为与波1 一致（不传 dwellingSectors）", async () => { /* … */ });
it("交集为空时显示 dwellingNote 说明，而不是给空推荐", async () => { /* 断言提示文案可见且推荐非空 */ });
```

- [ ] **Step 2–5: 失败 → 实现 → 通过 → 变异验证**

实现要点：`ObjectAdvisorForm` 接收可选 `dwellingSectors` 并透传；`dwellingNote` 非空时在结果卡顶部渲染。i18n 新增 `fengshui.object.dwellingNoteTitle`。变异：把 `dwellingSectors` 的透传去掉 → 第一条测试必须红。

- [ ] **Step 6: 提交**

```bash
git add apps/web
git commit -m "feat(fengshui): 物件顾问接强版，落到宅方位 [EP-fs-18]"
```

---

## 收尾（由 controller 执行，不属任何 task）

- [ ] 经 Supabase MCP apply `0011_dwellings`，并**实测 RLS 隔离**（A 用户读不到 B 用户的居所与报告）
- [ ] flag 关闭态回归：既有 6 条路由行为不变，导航无「境」
- [ ] 更新 `.agent/CURRENT.md` 与 `docs/architecture.md` §7b（波 2 从「未实施」改为已交付，并记录新的已知限制）
- [ ] 波 2 完成后接 EP-fs-tg（TG 原生适配一次覆盖全部界面，含本波新增的居所录入/管理/Tab）

---

## Self-Review 结果

**1. Spec 覆盖**：spec §14 波 2 的 EP-fs-11~18 全部有对应 task——11→Task 1/7，12→Task 2/3，13→Task 4，14→Task 8，15→Task 9，16→Task 6/7，17→Task 10，18→Task 5/11。spec §8.3「居所录入的坑」→ Task 8 三重应对。spec §11 付费边界 → Task 10。

**2. 与 as-delivered 对齐（本计划的主要风险面）**：所有签名取自磁盘真实代码而非 spec 初稿——`FengshuiChart` 是 `layer: 0` 字面量（Task 3 改判别联合）、`ObjectAdviceInput` 是 `{verdicts, affinity}`（Task 5 加可选第三字段）、`sortRemedies(list)` 单参（Task 3 加可选 opts）、`FengshuiFacts.layer` 硬写 `0`（Task 3 Step 6 放宽）、风水星名类型顶层叫 `FengshuiStar`。

**3. 已识别并处理的跨 task 风险**：
- `FengshuiChart` 变判别联合会让 llm 侧「谎报 layer 0」——Task 3 Step 6 就地放宽，不留假值到 Task 6。
- 删 `fengshui-cache.ts` 会打断 `page.tsx` 编译——Task 7 Step 5 明确要求同步改到新数据层，Tab 化留给 Task 9。
- `FENGSHUI_FACT_KEYS` 白名单会在 Layer 1 加字段时变红——这是**设计意图**（波 1 专为此建），Task 6 明确要求同步而非绕过。
- 波 1 有「user prompt 不得原地 sort facts」的测试——Task 6 Step 4 明确要求 `.slice()`。

**4. 每个 task 都带变异验证**：波 1 反复出现「测试渲染了但没验证被测逻辑」「期望值由被测函数自己算」的空转断言，因此本计划把变异验证写进每个 task 的交付要求，而非留给评审发现。

