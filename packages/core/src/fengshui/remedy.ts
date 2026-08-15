import { DIRECTION_LABEL, type Direction, type ElementAffinity } from "./directions";
import type { DirectionVerdict } from "./eight-mansions";
import type { MingGua } from "./ming-gua";
import { ENV_PSYCH_ANCHORS, type Effort } from "./env-psych";
import type { DwellingGua } from "./dwelling";

/**
 * 化解方案（EP-fs-03）。两条硬约束：
 *  1) 成本分级 —— 首发市场租房比例高，「零成本」条目必须排在前面；
 *  2) 诚实标注 —— evidence='传统象征' 的条目 modern 恒为 null。
 */

/** 定义在 env-psych.ts（remedy 依赖它，反向会成环）；此处重新导出保持公开 API 不变。 */
export type { Effort };

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
      effort: a.effort, // 显式取自锚点，不从文案猜（见 env-psych.ts 的 effort 注释）
      tenancy: "租房可做",
      traditional: a.traditional,
      modern: a.modern,
      evidence: a.evidence,
    });
  }

  return sortRemedies(out);
}

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
