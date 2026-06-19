/**
 * 东西方「共振映射」表 —— 本项目的核心知识资产。
 *
 * ⚠️ 立场（见 research/liz-greene-psychological-astrology.md §5）：
 *   这是「编辑性的解读桥梁」，不是 1:1 等价。两套体系机制根本不同
 *   （八字=太阳历五行；紫微=太阴历星曜；西方=黄道行星相位）。
 *   产品呈现为「同一个人的两面镜子」，仅在主题真正交汇处标注「共振(resonance)」，
 *   绝不输出「你的福德宫星 = 你的土星课题」式的硬等价。
 *
 * 用途：作为 LLM「整合声部」提示词的受控知识，约束它只在以下锚点谈共振。
 * 可信度 confidence：high=主题高度交汇；medium=结构类比；low=仅供启发。
 */

export type ResonanceAnchor = {
  /** 主题锚点 */
  theme: string;
  /** 东方信号源（紫微宫位 / 八字要素）*/
  eastern: string;
  /** 西方信号源（行星 / 宫位 / 相位）*/
  western: string;
  /** 利兹·格林心理学语汇 */
  psychological: string;
  confidence: "high" | "medium" | "low";
  note: string;
};

/**
 * 最可靠的桥点是「内在世界 / 心理状态」轴：紫微福德宫 ↔ 西方月亮/土星/硬相位。
 * 其余为结构类比，谨慎使用。
 */
export const RESONANCE_ANCHORS: ResonanceAnchor[] = [
  {
    theme: "内在世界 / 心理底色",
    eastern: "紫微·福德宫；八字·日主旺衰与喜忌",
    western: "月亮(情感需求) + 土星 + 紧密硬相位",
    psychological: "inner life / 情绪需求 / 个体化底色",
    confidence: "high",
    note: "研究确认的最强桥点：福德宫明确主管心理状态、苦乐、精神生活，与格林的心理领域高度重合。",
  },
  {
    theme: "核心自我 / 性格",
    eastern: "紫微·命宫+身宫主星与亮度；八字·日主",
    western: "上升点 / 太阳 / 第一宫",
    psychological: "core identity / persona / 自我呈现",
    confidence: "medium",
    note: "结构类比：都指向『此人是谁』。命宫=先天，身宫=后天/下半生，可类比太阳(意志)与上升(面具)之别。",
  },
  {
    theme: "成长课题 / 阴影",
    eastern: "紫微·化忌所落宫位；八字·忌神/受克之处",
    western: "土星(格林招牌) + 硬相位(square/opposition)",
    psychological: "Saturn lesson / shadow / 必经的限制与成长",
    confidence: "medium",
    note: "化忌=能量卡点/执着处，与土星『以限制换成长』、硬相位=两种需求的内在谈判，主题相通；但机制不同，仅作共振。",
  },
  {
    theme: "关系模式",
    eastern: "紫微·夫妻宫 + 桃花星(贪狼/廉贞/红鸾)",
    western: "金星/火星/月亮 + 第七宫 + 合盘",
    psychological: "anima/animus 投射 / 关系即完成未完成之物",
    confidence: "medium",
    note: "都描述亲密关系倾向；格林视角强调投射与无意识理想伴侣意象，可为东方『桃花』叙事注入心理深度。",
  },
  {
    theme: "事业 / 驱力",
    eastern: "紫微·官禄宫；八字·官杀/食伤/十神格局",
    western: "太阳/火星 + 第十宫(MC) + 主导相位",
    psychological: "drive profile / 天赋功能与表达方式",
    confidence: "low",
    note: "结构类比为主。八字十神(官杀/食伤)可类比驱力的不同功能，但避免直接等价为某行星。",
  },
  {
    theme: "时序 / 当下功课",
    eastern: "紫微·大限/流年四化；八字·大运流年",
    western: "外行星行运(transit) 对本命的触发",
    psychological: "当下的发展张力（非事件预测）",
    confidence: "low",
    note: "两套时序系统各自独立推算，仅在『今年的内在主题』层面做反思性整合，禁止事件化预测。",
  },
];

/** 给整合声部 LLM 的硬约束规则。*/
export const SYNTHESIS_GUARDRAILS = [
  "只在 RESONANCE_ANCHORS 列出的主题锚点上谈东西共振，且措辞为『两套传统都指向…』。",
  "禁止 1:1 等价（如『X宫=Y行星』）；称之为共振/呼应，不是等式。",
  "优先 high 置信度锚点（内在世界轴）；low 置信度仅作启发，可省略。",
  "所有结论必须可追溯到计算层提供的具体命盘事实，禁止编造星曜/宫位/行星位置。",
  "语气反思性、非决定论、成长导向；不做医疗/法律/财务/生死预测。",
] as const;
