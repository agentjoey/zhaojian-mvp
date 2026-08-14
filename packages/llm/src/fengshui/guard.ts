import type { Direction } from "@eamvp/core";
import type { FengshuiFacts } from "./facts";

/**
 * 风水侧反幻觉后置两道（EP-fs-06）。
 * 与既有 sanitizeReading / correctMutagens 同层：确定性兜底，不依赖模型自觉。
 */

/**
 * 「传统象征」条目禁用的伪科学措辞：一个「名词(+名词)?+动词」链式组合正则，
 * 外加几个不成链式模板的独立短语。
 *
 * ⚠️ 必须是**单趟组合正则**，不能对词表逐项各自独立 `.replace()`：后者在两个词条
 * 共享字符时会让先处理的一项吃掉另一项的前半，在文本里留下孤立残片——例如若先删
 * 「研究表明」，会在「科学研究表明」里留下无意义的「科学」；若先删「数据显示」，
 * 会在「实验数据显示」里留下孤立的「实验」（均已用 guard.test.ts 的 Minor A 用例
 * 锁定预期输出）。改用链式组合正则一次性吃掉整条措辞，与
 * verifyDirectionConsistency 的单趟正则是同一类问题、同一类修法。
 */
const PSEUDO_SCIENCE_CHAIN =
  "(?:科学|临床|实验|医学|数据|研究)(?:研究|实验|数据)?(?:表明|显示|证明|证实)";
/** 不走「名词+动词」链式模板的独立短语（原词表遗留项，链式正则覆盖不到）。 */
const PSEUDO_SCIENCE_STANDALONE = ["科学研究", "已被证实", "临床"];
const PSEUDO_SCIENCE_RE = new RegExp(
  // 连同其后的逗号/顿号一并去掉，避免留下断句
  `(?:${PSEUDO_SCIENCE_CHAIN}|${PSEUDO_SCIENCE_STANDALONE.join("|")})[，,、]?`,
  "g",
);

/** 命中该行属于「传统象征」语境的标记。 */
const SYMBOLIC_MARKERS = ["传统象征", "象征意义", "仪式"];

/**
 * 删除「传统象征」语境下出现的伪科学措辞。
 * 判定为逐行：该行含象征标记 或 含事实中任一传统象征条目的动作片段。
 *
 * 语境判定主要依赖①：prompt.ts 的输出格式说明已把「传统象征」行内标注从「必要时」
 * 改为强制要求（模型必须给候选化解里每条 evidence 为「传统象征」的条目标注
 * 「（传统象征）」，不再是可自行判断是否需要的软约束），因此 SYMBOLIC_MARKERS
 * 命中在实战中应当稳定触发，是这道净化能不能生效的主要保障。
 * ②facts 动作片段前缀匹配（symbolicActions）保留作次要兜底，用于模型偶尔漏标记时
 * 的补救——但 prompt.ts 同时要求「可合并同类」改写化解文案，模型逐字保留
 * `action.slice(0, 8)` 的概率本来就低，不应当作主要依赖，只当保底。
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
      return line.replace(PSEUDO_SCIENCE_RE, "");
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

/** markdown 加粗标记，允许出现在方位名两侧（如「**东南**是绝命位」）。 */
const BOLD = "\\*\\*";
/** 方位名后允许的量词/类别后缀。长名在前——同一 alternation 内「方位」须先于「方」试，否则「方」会先命中、留下孤立的「位」。 */
const SUFFIX = "(?:方位|方|角)";
/**
 * 方位名与星名之间允许的「胶水」：连接词、标点、markdown 表格分隔符、空白，允许重复
 * 出现几次（如表格行「| 东南 | 绝命 |」里，方位名与星名之间的 " | " 由「空格+竖线+
 * 空格」三个胶水单元拼成）。
 *
 * 「属于」必须排在「属」前面：同一 alternation 内 JS 正则是最左优先、不是最长优先，
 * 若「属」先试，会在「属于」处只吃掉「属」这一个字，剩下的「于」既不是胶水词也不是
 * 星名首字，导致整条匹配失败（见 guard.test.ts「东南属于绝命方」用例）。
 */
const GLUE = "(?:的|是|为|属于|属|系|：|:|（|\\(|、|，|,|-|—|\\||\\s)";

/**
 * 方位一致性校验：八方吉凶来自查表，模型输出可机械对拍。
 * 匹配「(\*\*)?<方位名>(\*\*)?<可选量词后缀><可选胶水，可重复若干次><星名>」。
 * 覆盖句式举例：「东南是绝命位」「东南方为绝命」「东南：绝命」「东南（绝命）」
 * 「**东南**是绝命位」「| 东南 | 绝命 |」「东南的绝命位」「东南属于绝命方」
 * 「东南角是绝命位」。
 *
 * ⚠️ 已知未覆盖形态：**星名在前**（如「绝命位落在东南」）。本函数不做反向匹配——
 * 星名只有 8 个词，若同时支持「星名+方位名」的反向扫描，会形成两套 alternation
 * 交叉匹配，误伤面显著增大，风险收益比不划算，本次刻意不覆盖。未来若有真实语料
 * 证明这种句式常见，再单独评估一套反向匹配规则。
 *
 * ⚠️ 必须用**单趟组合正则**（一个 alternation 里放全部方位名，长名优先），
 * 不能对每个方位分别单独 `.replace()`：后者各自独立扫描「上一轮已被改写过」的
 * 文本，短名会吃进长名替换产物的尾部——例如「东南」先被纠正为「东南是生气」后，
 * 单字「南」的独立一趟又在这个替换结果里二次命中「南是生气」，把刚改对的又改错。
 * 长名优先排序只解决同一起点处「谁先试」，解决不了「短名事后吃掉长名替换产物」；
 * 单趟扫描对原文一次性做非重叠匹配，两个问题一起规避。
 *
 * 关于长名优先排序（sortLabelsLongestFirst）：在当前 8 个方位名 + 8 个星名 + 上面
 * 这份胶水/后缀词表下，经变异测试证实——对「单趟组合正则」这个结构而言，排序方向
 * 已经不是黑盒行为测试能够证伪的维度。原因：会造成方位名前缀歧义的字符只有「北」
 * 「南」（分别是「东北/西北」「东南/西南」被短名「东/西」截断后剩下的部分），而
 * 这两个字既不在胶水词表里，也不是任何星名的首字——短名匹配到这类前缀后，因为凑
 * 不齐后面必须紧跟的星名，一定会匹配失败并回溯去试更长的方位名，与排序方向无关。
 * 保留排序仍是必要的防御措施（防未来胶水词表或星名表扩充后重新变得 load-bearing），
 * 因此额外补了一条**白盒**单测直接钉住 `sortLabelsLongestFirst` 的排序方向本身
 * （见 guard.test.ts「方位名排序」用例）——黑盒测不出来的不变量，白盒测。
 */
export function verifyDirectionConsistency(
  markdown: string,
  facts: FengshuiFacts,
): { text: string; corrections: DirectionCorrection[] } {
  const corrections: DirectionCorrection[] = [];

  const byLabel = sortLabelsLongestFirst(facts.directions);
  const byLabelName = new Map(byLabel.map((d) => [d.label, d]));
  const pattern = new RegExp(
    `(${BOLD})?(${byLabel.map((d) => d.label).join("|")})(${BOLD})?(${SUFFIX})?((?:${GLUE}){0,6})(${ALL_STARS.join("|")})`,
    "g",
  );

  const text = markdown.replace(
    pattern,
    (match: string, boldBefore: string, label: string, boldAfter: string, suffix: string, glue: string, star: string) => {
      const d = byLabelName.get(label)!;
      if (star === d.star) return match;
      corrections.push({ direction: d.direction, label: d.label, wrote: star, correct: d.star });
      return `${boldBefore ?? ""}${label}${boldAfter ?? ""}${suffix ?? ""}${glue ?? ""}${d.star}`;
    },
  );

  return { text, corrections };
}

/**
 * 长名优先排序：单趟组合正则的 alternation 分支顺序（JS 正则最左优先，非最长优先），
 * 长名必须排在其前缀短名之前，否则短名会抢先命中长名的前缀部分。
 * 单独导出是为了让测试能直接钉住排序方向本身——见上方函数 docstring 里对
 * 「这个维度黑盒测不出来」的解释，这里只能用白盒测。
 */
export function sortLabelsLongestFirst<T extends { label: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.label.length - a.label.length);
}
