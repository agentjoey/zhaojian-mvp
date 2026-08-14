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

/**
 * 化解成本分级。定义在此（而非 remedy.ts）是因为 remedy 依赖本模块，
 * 反向依赖会成环；remedy.ts 重新导出以保持公开 API 不变。
 */
export type Effort = "零成本" | "挪动" | "添置" | "装修";

type EnvPsychBase = {
  /** 传统风水概念 */
  traditional: string;
  /** 可做的事 */
  action: string;
  /**
   * 这条建议实际要花多少代价。**显式标注，不从文案推断** ——
   * 首发市场租房比例高，成本诚实是对用户的核心承诺，
   * 靠子串匹配 action/traditional 猜成本会在文案改动时静默标错。
   */
  effort: Effort;
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
    effort: "挪动",
    evidence: "双重支撑",
  },
  {
    traditional: "藏风聚气",
    modern: "恢复性环境（Kaplan ART）：适度围合感有助注意力恢复",
    action: "为久坐处做出局部围合，避免置身穿堂动线中央",
    effort: "挪动",
    evidence: "双重支撑",
  },
  {
    traditional: "门冲床 / 床对镜",
    modern: "半醒状态下的突发视觉刺激与夜间惊跳反应，影响睡眠连续性",
    action: "床不正对门；镜面避开床的正面视线",
    effort: "挪动",
    evidence: "双重支撑",
  },
  {
    traditional: "形煞 / 屋内杂乱",
    modern: "视觉杂乱提升认知负荷，削弱工作记忆可用容量",
    action: "清掉台面与地面动线上的堆积物",
    effort: "零成本",
    evidence: "双重支撑",
  },
  {
    traditional: "西晒",
    modern: "午后强光照延后褪黑素分泌，影响入睡",
    action: "西向卧室加遮光帘；床头避开西墙",
    effort: "添置",
    evidence: "双重支撑",
  },
  {
    traditional: "明堂开阔",
    modern: "视觉纵深与开阔视野关联更平稳的情绪基调",
    action: "保持入口与主要窗前的通透，勿堆放高物",
    effort: "零成本",
    evidence: "双重支撑",
  },
  {
    traditional: "木气生发 / 绿植",
    modern: "biophilia：室内绿植与自然元素关联压力恢复",
    action: "在久处的房间放一两盆好养的绿植",
    effort: "添置",
    evidence: "双重支撑",
  },
  {
    traditional: "金泄土煞（凶方置金属器物）",
    modern: null,
    action: "在该方位放一件你自己喜欢的金属器物，作为「这一块我已安顿好」的标记",
    effort: "添置",
    evidence: "传统象征",
  },
  {
    traditional: "凶方宜静宜压",
    modern: null,
    action: "把储物、少用的柜子放在凶方，把久待的活动放到吉方",
    effort: "挪动",
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
