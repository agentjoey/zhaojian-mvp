import { DIRECTION_LABEL } from "./directions";
import type { DirectionVerdict } from "./eight-mansions";
import type { Direction } from "./directions";
import type { ElementAffinity } from "./directions";

/**
 * 「境」页主视觉下方那句一句话基调（2026-08 对齐设计稿）。
 *
 * 确定性生成，不经 LLM——评审后续要求把「境」/「流日」两处的叙述收成一句话基调
 * + 别处展开详述，而这句话本身的素材（生气方位、喜用五行）本来就全部来自已经
 * 算好的确定性 facts，没有必要为一句可以查表得出的话再走一次 LLM 生成/反幻觉链。
 *
 * ⚠️ 只取自 `personalDirections`（本命八方），绝不取自宅卦——「本命八方」与
 * 「房屋八方」是两套独立判语，即使境页当下以居所为主视觉呈现，这句话说的
 * 也是本命卦的生气方，不是宅卦的（两套表不得互推/混用，见 llm 侧 system prompt
 * 硬规则同一条约束）。
 *
 * 生气方在 8 个方位里必然恰好存在一个（八宅结构：8 星与 8 方位一一对应），
 * 结构上 `.find` 不会落空，故不返回 null——调用方不必处理「没有生气方」这种
 * 不存在的分支。
 */
export function deriveFengshuiTagline(
  personalDirections: Record<Direction, DirectionVerdict>,
  affinity: Pick<ElementAffinity, "favorableElements">,
  dayMasterElement: string,
): string {
  const best = Object.values(personalDirections).find((v) => v.star === "生气")!;
  const favorable = affinity.favorableElements[0];
  const bestLabel = DIRECTION_LABEL[best.direction];
  if (favorable) {
    return `${dayMasterElement}命之人，宜近${favorable}——你的生气在${bestLabel}。`;
  }
  // 用神中和、无明显扶抑时不编造一个「宜近的五行」，只说方位本身。
  return `你的生气在${bestLabel}——多留意、多打理这个方向。`;
}
