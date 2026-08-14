# 风水 · 境（人与空间）— Design Spec

- **Date:** 2026-08-14
- **Status:** Draft（设计已确认，待 writing-plans 拆实施计划）
- **代号前缀:** `EP-fs-*`
- **产品名:** 本设计起，产品对外名为 **Mira**（原代号「照见 / Zhaojian」仍为仓库与域名标识）
- **驱动:** ①产品完整性——已有「命」（八字/紫微/星盘）与「运」（大限/流年/流日），缺「境」；②变现——风水是高付费意愿品类
- **范围:** 新增 `packages/core/src/fengshui`、`packages/llm/src/fengshui`、`apps/web/app/fengshui`、迁移 `0011_dwellings`。**不改**冻结命盘、不改三段式解读、第一波不动 `/calendar`
- **关系到 MVP 冻结:** 本设计为冻结后 feature，全程 `NEXT_PUBLIC_FENGSHUI_ENABLED` flag 门控，默认关闭

---

## 1. 问题与定位

Mira 当前覆盖「命」与「运」，两者都是**关于人自身**的。缺失的第三条线是**人与所处空间的关系**——这既是叙事上的缺口（命·运·境），也是商业上的缺口（风水咨询客单价远高于命理解读）。

但直接搬传统风水会与产品既有 DNA 冲突。CLAUDE.md 明确要求「反思性、非决定论、成长导向」，而传统风水话术是「门对门必漏财」这类强决定论断言。

**本设计的解法是双层**：底层用正统八宅确定性计算（专业感、可验证、支撑付费），输出层用 Mira 声部重构为非决定论建议，并给出「传统说法 ↔ 环境心理学」对照。这与产品已有的「东西双盘互证」是同一条产品语法，只是从「人的内在」换到「人与空间」。

## 2. 定位：风水是派生层，不是第四个引擎

风水**不需要新的天文历法计算**。全部输入来自已有 `UnifiedChart` 加一个新的居所对象。因此它落在与 `deriveSpirit` / `deriveUsefulElements` 同一层——纯函数派生，不进冻结命盘。

这直接继承了 CLAUDE.md 的既有原则：「引擎深化派生事实在 facts 层算、不进冻结命盘」，新旧命盘通吃、零迁移。

## 3. 口吻立场：双层 + 诚实标注

| 层 | 做法 |
|---|---|
| 计算层 | 正统八宅（命卦 / 宅卦 / 游年八方吉凶），确定性查表，逐格可测 |
| 表达层 | Mira 声部重写为非决定论建议；每条给「传统说法」与「现代机制」对照 |

**关键约束——诚实标注。** 传统化解里有两类内容，混讲会毁掉可信度：

- **双重支撑**：床头避西晒、书桌背靠实墙、减少杂物、增加绿植——传统有说法，现代机制也真实存在，两边都给。
- **传统象征**：金属化五黄、水景催财——传统有说法，现代机制**没有**对应解释。

对第二类，**既不假装有科学依据，也不删除**，而是用「仪式与掌控感」框架呈现：有意识地布置自己的空间这一行为本身会改变人与空间的关系。这有研究支撑，且没有谎称铜铃能挡煞。

数据结构上用 `evidence: '双重支撑' | '传统象征'` 显式标注，UI 明示，**prompt 硬规则禁止 LLM 为「传统象征」条目编造科学解释**。

## 4. 分层设计（一次定型、分批实现）

| | Layer 0 · 本命方位（零输入·免费） | Layer 1 · 住宅实盘（一个问题·会员） | Layer 2 · 玄空飞星（后续 spec） |
|---|---|---|---|
| 输入 | 无（复用出生数据） | 大门朝向（八方位）+ 可选租/自有 | + 建成年份 + 精确坐向 |
| 盘 | 命卦四吉四凶 + 用神色材方位 | + 宅卦八方实盘 + 合看对照 | + 山星/向星 + 流年飞星 |
| 化解 | 个人层面（摆位/朝向/颜色） | + 宅层面分级化解 | + 飞星化解 |
| 物件 | 弱版（对人不对宅） | 强版（落到具体方位） | 强版 |

**本 spec 覆盖 Layer 0 与 Layer 1**，schema 一次定型并为 Layer 2 预留可空字段（见 §8），使飞星层落地时零迁移。

## 5. core 引擎设计

新模块 `packages/core/src/fengshui/`，纯函数 + Zod，与 `deriveSpirit` 同层。

### 5.1 `deriveMingGua(birth, chart) → MingGua`

命卦需要「立春年 + 性别」。两处注意：

- **性别不在 `UnifiedChart` 里**（见 `packages/core/src/types/chart.ts`），只在 `BirthInput`。既有派生函数是 `deriveSpirit(chart)` 单参范式，本函数必须破例收双参。
- **立春年不用重算**：`chart.bazi.pillars.year` 天生是立春为界的干支年。用它配合 `birth.date` 的公历年 ±1 窗口即可唯一确定（干支 60 年周期在 ±1 年内无歧义）。**不动 `normalizeBirth`**，同时绕开大多数在线排盘算错立春分界的坑。

采用三元命卦通行算法（`s` = 立春年四位数字反复相加至个位）：

| | 1900–1999 | 2000–2099 |
|---|---|---|
| 男 | `10 - s` | `9 - s` |
| 女 | `s + 5` | `s + 6` |

结果 >9 减 9；结果为 5 时，男寄坤(2)、女寄艮(8)。

> 命卦算法存在流派变体。本项目**选定上述三元通行式**（与 iztro `algorithm: 'zhongzhou'` 的显式选派做法一致），并在实现时**逐年对拍公开命卦表**，由测试锁定。

输出 `{ gua: 1–9, guaName: 坎/坤/震/巽/乾/兑/艮/离, group: '东四命' | '西四命' }`。
东四命 = 坎1 离9 震3 巽4；西四命 = 乾6 兑7 艮8 坤2。

### 5.2 `EIGHT_MANSIONS` — 八宅常量表

8 卦 × 8 方 → 四吉（生气 / 天医 / 延年 / 伏位）四凶（绝命 / 五鬼 / 六煞 / 祸害）。

**游年翻卦的结果直接硬编码为查表**，零推算歧义、逐格可测。这是「排盘不许 LLM 算」在风水侧的落实。

起始表（实现时**必须逐格对拍权威游年表**，64 格全部由测试锁定）：

| 卦 | 生气 | 天医 | 延年 | 伏位 | 绝命 | 五鬼 | 六煞 | 祸害 |
|---|---|---|---|---|---|---|---|---|
| 坎1 | 巽 | 震 | 离 | 坎 | 坤 | 艮 | 乾 | 兑 |
| 离9 | 震 | 巽 | 坎 | 离 | 乾 | 兑 | 艮 | 坤 |
| 震3 | 离 | 坎 | 巽 | 震 | 兑 | 乾 | 坤 | 艮 |
| 巽4 | 坎 | 离 | 震 | 巽 | 艮 | 坤 | 兑 | 乾 |
| 乾6 | 兑 | 艮 | 坤 | 乾 | 离 | 震 | 坎 | 巽 |
| 兑7 | 乾 | 坤 | 艮 | 兑 | 震 | 离 | 巽 | 坎 |
| 艮8 | 坤 | 乾 | 兑 | 艮 | 巽 | 坎 | 离 | 震 |
| 坤2 | 艮 | 兑 | 乾 | 坤 | 坎 | 巽 | 震 | 离 |

`directionsFor(gua) → Record<Direction, { star, auspicious: boolean, rank: 1–4 }>`

### 5.3 `dwellingGua(facing) → DwellingGua`

坐 = 向的对宫，坐山定宅卦（坐北为坎宅）。第一波只收八方位枚举 `N | NE | E | SE | S | SW | W | NW`；24 山与罗盘度数字段留空给 Layer 2。

### 5.4 `elementDirections(usefulElements) → ElementAffinity`

五行 → 方位/颜色/材质的纯映射（木=东/东南、火=南、土=西南/东北、金=西/西北、水=北），接现有 `deriveUsefulElements` 的 `favorable` / `unfavorable`。土在传统上兼主中宫，但中宫不属八方，故八方映射只取西南/东北。

**这是 Layer 0 的主力**——零新输入即可产出完整可用建议。

### 5.5 `ENV_PSYCH_ANCHORS` — 环境心理学对照表

双层口吻的西方半边，做成 **core 常量**（不交由 LLM 现编，与 `RESONANCE_ANCHORS` 同思路）。结构 `{ 风水概念, 现代机制, 可做的事, evidence }`：

| 风水概念 | 现代机制 |
|---|---|
| 背后有靠 / 靠山 | prospect-refuge：背实墙 + 视野开阔 → 警觉负荷下降 |
| 藏风聚气 | 恢复性环境（Kaplan ART）：围合感与注意力恢复 |
| 门冲床 / 床对镜 | 夜间惊跳反应与睡眠中断 |
| 形煞 / 杂乱 | 视觉杂乱 → 认知负荷上升 |
| 西晒 | 光照节律与入睡困难 |
| 明堂开阔 | 视觉深度与情绪基调 |
| 木/绿植 | biophilia 与压力恢复 |

「靠山」与 prospect-refuge 近乎同一直觉的东西方两种说法——这是产品既有「双盘互证」语法在空间维度上的自然延伸。

### 5.6 `computeFengshui(input) → FengshuiChart`

```ts
type FengshuiInput = {
  birth: BirthInput;
  chart: UnifiedChart;
  dwelling?: DwellingInput;          // 缺省 = Layer 0
  cohabitants?: Array<{ profileId: string; name: string; birth: BirthInput; chart: UnifiedChart }>;
};

type FengshuiChart = {
  layer: 0 | 1;
  mingGua: MingGua;
  personalDirections: Record<Direction, DirectionVerdict>;   // 命卦四吉四凶
  elementAffinity: ElementAffinity;                          // 用神 → 方位/色/材
  dwelling?: {
    facing: Direction; sitting: Direction;
    gua: Gua; group: '东四宅' | '西四宅';
    matchWithPerson: '相配' | '相冲';
    sectors: Record<Direction, SectorVerdict>;               // 宅卦八方
  };
  cohabitants?: Array<{
    profileId: string; name: string; mingGua: MingGua;
    conflicts: Direction[];                                  // 对此人凶、对主档案吉
    sharedGood: Direction[];                                 // 对所有人皆吉
  }>;
  remedies: Remedy[];
};
```

### 5.7 一处与命盘相反的决定：风水盘不冻结

命盘冻结是因为出生数据不变。**居所天生可变**——人会搬家、会改布置、会增减同住人。因此 `FengshuiChart` 每次现算；只有**报告文本**持久化，且带失效机制（§8.2）。

## 6. 化解方案 `Remedy`

```ts
type Remedy = {
  id: string;
  target: string;                                   // 针对哪个方位/问题
  action: string;                                   // 做什么
  effort: '零成本' | '挪动' | '添置' | '装修';
  tenancy: '租房可做' | '需自有';
  traditional: string;                              // 传统依据（五行通关等）
  modern: string | null;                            // 现代机制；传统象征做法为 null
  evidence: '双重支撑' | '传统象征';
};
```

**排序规则**：`effort` 升序（零成本优先），同级内双重支撑优先于传统象征。

**租房过滤**：`tenancy: '需自有'` 的条目在用户标记为租住时降级折叠，不直接丢弃。

首发市场是海外华裔 + 西方探索者，租房比例高。「把卧室换到东南方」对房主是建议、对租客是废话——分级是让建议真正可执行的前提，也直接服务「今天就能做一件小事」的产品调性。

## 7. 物件顾问 `adviseObject`

「我想添个书桌，放哪儿好」「这面镜子能不能挂这」。这是本设计的**回访钩子**——每次添置家具都会回来问一次。

判断依据三层叠加：

1. **物件五行**：材质（木/金属/玻璃/陶瓷）、颜色、形状（尖→火、方→土、圆→金、波浪→水、长条→木）
2. **品类硬规则**：按 category 查表——镜不对床、鱼缸忌卧室、床头忌横梁、灯具与光照
3. **与你的关系**：命卦四吉方 + 用神喜忌五行

```ts
adviseObject(chart: FengshuiChart, query: {
  category: 'bed'|'desk'|'sofa'|'mirror'|'plant'|'aquarium'|'storage'|'lamp'|'art'|'other';
  material?: string; color?: string; shape?: string;
  intendedDirection?: Direction;                    // 空 = 由系统推荐
}) → {
  elementOfObject: string;
  recommendedDirections: Array<{ direction: Direction; reason: string }>;
  avoid: Array<{ direction: Direction; reason: string }>;
  categoryRules: string[];
  personalFit: string;
  remedies: Remedy[];
}
```

**全部确定性计算，LLM 只负责说成人话。**

**Layer 0 即可用**：「按你的命卦与用神，书桌宜木质、朝东、避白色金属」已是完整建议；填了住宅朝向后同一函数自动升级为「放在东南那间的靠墙位」。这让 Layer 0 那一波不只是引流噱头，本身具备回访价值。

**交互**：第一波做**表单式**（选品类 + 材质颜色 → 出建议），确定性、无歧义。让 Mira 在自由对话中识别「我想买个沙发」并自动调用需要意图识别 / function-calling，属新工程，留待后续。

## 8. 数据模型

### 8.1 `dwellings`（迁移 `0011_dwellings.sql`）

```sql
create table dwellings (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references auth.users(id) on delete cascade,
  name text not null,                          -- 「家」「办公室」
  kind text not null default 'home',           -- home | office
  tenancy text not null default 'rent',        -- rent | own（驱动 Remedy 过滤）
  facing text,                                 -- 八方位枚举（向）；null = 不确定 → 降级 Layer 0
  facing_degrees numeric,                      -- Layer 2 罗盘，先留空
  built_year int,                              -- Layer 2 元运，先留空
  layout jsonb,                                -- Layer 2 房间标注，先留空
  member_profile_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

RLS `uid = auth.uid()`，与 `profiles` 同构。**Layer 2 的三个字段现在就建好留空 → 飞星层零迁移**，与「派生事实不进冻结命盘」是同一条防迁移思路。

### 8.2 `fengshui_reports`：与解读不同，需要失效机制

现有三段式解读能「一次生成永久有效」，是因为命盘冻结。**风水报告不行**——改朝向、增减同住人、切换语言都会使其过期。

```sql
create table fengshui_reports (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references auth.users(id) on delete cascade,
  dwelling_id uuid references dwellings(id) on delete cascade,   -- null = Layer 0 报告
  profile_id uuid not null,                                      -- 视角所有者（主档案）；合看成员在 fingerprint 内
  layer int not null,
  locale text not null,
  input_fingerprint text not null,
  content text not null,
  created_at timestamptz not null default now()
);
```

`input_fingerprint` = 哈希(居所关键字段 + 参与档案 ids + 各档案命盘冻结标识 + locale)。命中复用，不命中重生成。

物件顾问结果**不持久化**（轻、一次性；存历史属于回访功能，留待后续）。

### 8.3 居所录入：一个真实的坑

「你家大门朝哪」比想象中难，且**相当比例的用户会填反**——传统的「向」是大门朝外的方向，不是站在门外看房子的方向。三个应对：

- 图形化八方位选择器，不用下拉框
- 明确提示语：「站在屋内、面朝大门，你面对的方向」
- 提供「不确定」选项 → 优雅降级回 Layer 0，而非逼用户瞎猜出一份错报告

手机罗盘留到 Layer 2（室内磁干扰严重，不适合作主输入）。

## 9. LLM 层

新增 `packages/llm/src/fengshui/`。

### 9.1 风水声部（三分节，与现有三段式同构）

| 节 | 内容 |
|---|---|
| **形势** | 盘面客观：命卦、宅卦、八方吉凶、与你的配合 |
| **境与你** | 环境心理学解释——双层口吻的西方半边 |
| **可做的事** | 分级化解清单，零成本优先 |

`extractFengshuiFacts(FengshuiChart)` 沿用现有 `extractFacts` 思路：只喂带标签的结论，砍掉原始查表数据。

输出契约为 **markdown 三分节**（不依赖 json_schema），与现有解读一致。locale 走现有 `x-zj-locale` 机制。

### 9.2 守护栏 `FENGSHUI_GUARDRAILS`

- 禁断祸福（「必漏财」「会生病」）——非决定论
- 禁自行推算方位吉凶（只能用 facts 给定的）
- 禁医疗 / 财务建议
- **禁为 `evidence: '传统象征'` 条目编造科学依据**
- 强制免责声明

### 9.3 反幻觉链：复用四道 + 新增两道

现有四道（facts → prompt 硬规则 → sanitize → 后置纠正）全部复用，新增：

- **`sanitizeFengshui`**：扫描输出中是否给「传统象征」化解配上「研究表明 / 科学证明」类措辞，命中即删。这是 §3 诚实标注的执行端。
- **方位一致性后置校验**：输出提到的每个方位吉凶必须与 facts 一致，不一致则纠正。

第二条值得单独说明：**八方吉凶是查表来的，因此模型输出可被机械对拍**——它说「东南是生气位」而表中为绝命位，可直接判错。命理解读做不到这种程度的确定性校验（`correctMutagens` 仅覆盖四化），风水这一层反而更硬。

### 9.4 物件顾问的 LLM

轻量：把 `adviseObject` 的结构化结果说成人话，量级接近 `polishDailyFortune`，可缓存。

## 10. 页面与信息架构

导航新增第 6 个字「**境**」，`NEXT_PUBLIC_FENGSHUI_ENABLED` flag 门控（照搬 spirit 做法，默认关、不破坏冻结）。

现有导航为单字体系 `照 · 运 · 盘 · 灵 · 我`（`apps/web/components/AppShell.tsx`）。单字很省空间，6 字在 375px 下每格约 62px 可行；≥6 项时收紧间距。

```
/fengshui  「境」
├─ 无居所 → Layer 0 本命方位报告（免费）+「填住宅解锁实盘」CTA
├─ 有居所 → Tab [盘 | 化解 | 添置]
│   ├─ 盘：八方位盘图（八扇区按吉凶着色）+ 合看家人 chips 切换
│   ├─ 化解：分级清单，零成本优先，传统/现代双列 + 象征标注
│   └─ 添置：物件顾问表单 → 建议卡
├─ 每条建议底部「和 Mira 聊聊这条」→ /spirit?topic=fengshui:<id>
└─ /fengshui/dwellings  居所管理（多套 / 成员 / 租售状态）
```

八方位盘图是「境」页视觉主体，对应现有每页皆有图谱的惯例（`ZiweiBoard` / `NatalWheel` 同类）。

**合看的 chips 切换是最好的演示**：同一张图，换个家人，吉凶着色整体改变——一眼说明「为什么这房子对你和对他不一样」。

## 11. 付费边界

沿用现有会员制，**不引入新计费形态**——现有 billing 的 Stripe / TG Stars 支付尚未接通（T5/T6 待凭据），风水不应在此时再加一种买法。

| | 免费 | 会员 |
|---|---|---|
| Layer 0 本命方位 | ✅ | ✅ |
| 物件顾问（弱版） | ✅ | ✅ |
| 住宅实盘 + 分级化解 | — | ✅ |
| 多住客合看 / 多套居所 | — | ✅ |

全程 `BILLING_ENABLED` 门控，与现有一致（pre-prod 默认关 = 不限制）。免费层给足（本命方位 + 物件顾问均可回访），付费卡在「你家」这条线上。

## 12. 降级与错误处理

**一个好性质：LLM 挂了页面不白。** 风水骨架——八方位盘图、吉凶着色、化解清单、物件建议——**全为确定性计算**，LLM 仅负责解说层。LLM 超时或失败时页面仍完整可用，只是少了叙述文字。这比现有解读页强（解读页无 LLM 即无内容）。**此为设计内的降级路径，非意外。**

其余：

- 无居所 / 朝向选「不确定」→ 落回 Layer 0，属正常状态非错误
- 合看成员档案被删 → 从 `member_profile_ids` 剔除，指纹变化触发重生成
- 指纹不命中 → 先渲染旧报告 + 「正在更新」，不留白屏

## 13. 测试策略

**core（TDD）**

- 命卦：男女各若干、跨立春边界（1 月 / 2 月初出生）、5 数寄卦、1900s 与 2000s 两式
- 八宅表：8 卦 × 8 方 = 64 格逐格对拍权威游年表
- 宅卦：坐向对宫
- 用神 → 方位/色/材映射
- 合看：同宅多命卦，`conflicts` / `sharedGood` 正确
- 化解排序：零成本优先；租住时 `需自有` 折叠
- 物件顾问：品类硬规则（镜不对床）、五行推导、推荐方位

**llm**

- facts 提取无 PII、无原始查表数据泄漏
- eval：「传统象征」化解不得配科学措辞
- 方位一致性后置校验

**web**

- Layer 0 报告渲染
- 朝向提示语可见；「不确定」→ 降级
- 合看 chips 切换
- **flag 关 → 导航无「境」、路由不可达**（保护冻结）

## 14. 实施分波

两波之间有明确的验证间隙：波 1 上线后视反馈再决定是否投入波 2。因此 writing-plans **建议拆成两个独立 plan**，而非一个跨波大计划。

### 波 1 — Layer 0 本命方位（零输入·免费）

| ID | 层 | 内容 | 验收 |
|---|---|---|---|
| EP-fs-01 | core | `deriveMingGua` + `EIGHT_MANSIONS` + `directionsFor` | 命卦跨立春/寄卦全测；64 格逐格对拍 |
| EP-fs-02 | core | `elementDirections`（用神 → 方位/色/材）+ `ENV_PSYCH_ANCHORS` | 映射全测；对照表为常量非 LLM 生成 |
| EP-fs-03 | core | `computeFengshui` Layer 0 分支 + `Remedy` 生成与排序 | 零成本优先排序生效（租房过滤依赖居所，见 EP-fs-12） |
| EP-fs-04 | core | `adviseObject` 弱版（对人不对宅） | 品类规则与五行推导全测 |
| EP-fs-05 | llm | 风水声部 + `FENGSHUI_GUARDRAILS` + `extractFengshuiFacts` | 三分节输出；facts 无泄漏 |
| EP-fs-06 | llm | `sanitizeFengshui` + 方位一致性校验 + eval 用例 | 象征条目不得配科学措辞 |
| EP-fs-07 | web | `/fengshui` Layer 0 页 + 八方位盘图 + 导航「境」（flag 门控） | flag 关时导航无「境」且路由不可达 |
| EP-fs-08 | web | 物件顾问表单页 +「和 Mira 聊聊这条」接 `/spirit?topic=` | 复用现有 topic 机制 |

### 波 2 — Layer 1 住宅实盘（一个问题·会员）

| ID | 层 | 内容 | 验收 | 依赖 |
|---|---|---|---|---|
| EP-fs-11 | db | 迁移 `0011_dwellings` + `fengshui_reports` + RLS | RLS 隔离验证；Layer 2 字段留空 | — |
| EP-fs-12 | core | `dwellingGua` + `computeFengshui` Layer 1 分支 + 宅层化解 + 租房过滤 | 坐向对宫；宅卦八方正确；租住时「需自有」折叠 | EP-fs-03 |
| EP-fs-13 | core | 合看：`cohabitants` 的 `conflicts` / `sharedGood` | 同宅多命卦吉凶各异 | EP-fs-12 |
| EP-fs-14 | web | 居所录入（图形八方位 + 提示语 + 「不确定」降级）+ 居所管理页 | 「不确定」正确降级 Layer 0 | EP-fs-11 |
| EP-fs-15 | web | 「境」页 Tab 化 [盘\|化解\|添置] + 合看 chips 切换 | 换人吉凶着色整体改变 | EP-fs-12/13 |
| EP-fs-16 | web+llm | 报告持久化 + `input_fingerprint` 失效重生成 | 改朝向/增成员/切语言均触发重生成 | EP-fs-11 |
| EP-fs-17 | web | 会员闸门（实盘/合看/多居所），`BILLING_ENABLED` 门控 | 关闸时不限制；开闸时非会员见 paywall | EP-fs-15 |
| EP-fs-18 | core | `adviseObject` 强版（落到具体方位） | 有居所时建议落到方位 | EP-fs-12 |

## 15. 风险与边界

- **冻结期张力**：本设计驱动为产品完整性与变现，**非用户反馈**——风水是零用户信号的新品类。波 1 成本低（零新表、零新输入），可作为需求探针；波 2 视波 1 反馈再决定投入。
- **流派分歧**：命卦算法与游年表存在流派变体。已显式选定三元通行式并由测试锁定，与 iztro 显式选派（`zhongzhou`）做法一致。此为**选定**而非**正确性保证**，需在文案中标注所用流派。
- **合规**：风水建议不得触及医疗、财务、法律领域，由 `FENGSHUI_GUARDRAILS` 与 `sanitizeFengshui` 双重拦截；免责声明强制。
- **朝向填反**：即使有提示语仍会有一定比例填反，导致整份报告方向性错误。缓解手段为「不确定」降级选项与 Layer 2 的罗盘辅助；无法完全消除。
- **导航膨胀**：spirit 与 fengshui 两个 flag 同开时底栏 6 项。已确认可行，但若后续再加一级入口需重新审视 IA。
- **token 成本**：风水报告为新增长文本生成，需配合现有 prompt cache（EP-511）与报告持久化（§8.2）控制成本。

## 16. 留待后续（不在本 spec）

- **Layer 2 玄空飞星**：元运 + 24 山坐向 + 山星/向星 + 流年飞星 + 手机罗盘
- **流年方位接 `/calendar`**：年九星（二黑病符 / 五黄 / 八白）零输入接入现有时序层，属「运」的节奏，独立小 spec
- **Mira 对话内自动调用物件顾问**：需意图识别 / function-calling
- **户型图上传与房间标注**
- **物件顾问历史记录**（回访功能）
