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
  /** 命宅异组、交集为空时的说明；没话说则为 null */
  dwellingNote: string | null;
};

export type ObjectAdviceInput = {
  verdicts: Record<Direction, DirectionVerdict>;
  affinity: ElementAffinity;
  /** Layer 1 起可选传入宅卦八方；不传 = 波1 弱版行为，逐字节不变 */
  dwellingSectors?: Record<Direction, DirectionVerdict>;
};

function elementOf(q: ObjectQuery): string | null {
  if (q.material && MATERIAL_ELEMENT[q.material]) return MATERIAL_ELEMENT[q.material]!;
  if (q.shape && SHAPE_ELEMENT[q.shape]) return SHAPE_ELEMENT[q.shape]!;
  return null;
}

export function adviseObject(input: ObjectAdviceInput, q: ObjectQuery): ObjectAdvice {
  const { verdicts, affinity, dwellingSectors } = input;
  const el = elementOf(q);
  const all = Object.values(verdicts);
  const good = all.filter((v) => v.auspicious).sort((a, b) => a.rank - b.rank);
  const bad = all.filter((v) => !v.auspicious).sort((a, b) => a.rank - b.rank);

  // Layer 1：推荐位需同时是命卦吉方与宅卦吉方。交集为空说明这套房子在这件物件上
  // 帮不上忙——此时退回命卦吉方（人比房子更要紧），并显式说明，而不是给空数组。
  const houseGood = dwellingSectors ? good.filter((v) => dwellingSectors[v.direction].auspicious) : good;
  const usable = houseGood.length ? houseGood : good;
  const dwellingNote =
    dwellingSectors && houseGood.length === 0
      ? "这套房子的吉方与你的命卦吉方不重合，以下按你自己的吉方给建议——人比房子要紧，先顾好你久待的那几处。"
      : null;

  // 物件五行自身的方位（若可判），与四吉方取交集优先
  const elDirs = el ? (ELEMENT_DIRECTIONS[el] ?? []) : [];
  const preferred = usable.filter((v) => elDirs.includes(v.direction));
  const picked = (preferred.length ? preferred : usable).slice(0, 3);

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
    dwellingNote,
  };
}
