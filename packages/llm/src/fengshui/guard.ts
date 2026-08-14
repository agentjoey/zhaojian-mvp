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

/** markdown 加粗标记，允许出现在方位名与星名两侧（如「- **东南**：**生气**（吉）」）。 */
const BOLD = "\\*\\*";
/**
 * 方位名后允许的量词/类别后缀（「东南方」「东南角」「东南方位」）。
 *
 * 长名在前只是**防御性**写法，不是 load-bearing 约束：JS 正则确实是最左优先而非
 * 最长优先，但短分支导致整条匹配失败后会回溯去试更长的分支。把「方位」与「方」
 * 对调后做 138,240 条穷举差分，输出零差异——所以别再声称「否则会留下孤立的『位』」。
 * 保留顺序，是为了将来词表扩充时不必重新推导这件事。
 */
const DIR_SUFFIX = "(?:方位|方|角)";
/** 星名后允许的后缀，比方位名多一个「位」（「绝命方」「绝命位」）。 */
const STAR_SUFFIX = "(?:方位|方|位|角)";
/**
 * 「方位名 → 星名」之间允许的「胶水」：连接词、标注符号、markdown 表格分隔符、
 * **行内**空白，允许重复出现几次（表格行「| 东南 | 绝命 |」里，两者之间的 " | "
 * 由「空格+竖线+空格」三个胶水单元拼成）。
 *
 * ⚠️ 绝不能放进来的东西：**分句标点（、，,）与换行**。它们不是胶水，是边界。
 * 曾经放进来过（且允许重复 6 次），这道闸门于是开始跨分句、跨行地把「前一句的
 * 方位名」和「后一句的星名」配成一对——一份逐条符合查表的正确输出被记下 8 条伪
 * correction、3 行正确文字被改错（见 guard.test.ts「EP-fs-06b 回归：含星名的
 * 负向语料」用例组，那组会在胶水重新放宽时立刻变红）。同理 `\s` 必须写成
 * `[ \t]`：换行是段落边界，不是词间空白。**这才是真正的边界，`GLUE_MAX` 的
 * 取值大小不能替代它**：下面的实测显示只要分句标点/换行留在闸门外，胶水单元数
 * 上限本身对误伤面没有可观测影响。
 *
 * 「属于」排在「属」前面同样只是可读性上的防御、不是 load-bearing：即便「属」先试、
 * 在「属于」处只吃掉一个字，后面凑不齐星名一样会回溯回来（对调后穷举差分零差异）。
 */
const GLUE = "(?:的|是|为|属于|属|系|：|:|（|\\(|-|—|\\||[ \\t])";
/**
 * 胶水重复上限。**实测（非断言）：6 比 3 更合适**——
 *
 * 1. 收到 3 会漏检对齐填充的 markdown 表格：模型偶尔会为对齐列宽多打空格，
 *    「| 东南  | 绝命 |」（两个空格）比标准写法「| 东南 | 绝命 |」多一个胶水单元，
 *    胶水单元数=4，超出 3 的上限、不再命中（见 guard.test.ts「GLUE_MAX 覆盖对齐
 *    填充的 markdown 表格」用例，此用例在 `GLUE_MAX=3` 时会变红）。
 * 2. 放回 6 未观察到新误伤：对既有全部黑盒用例（含整篇对拍）跑一遍 6 与 3 两个
 *    取值，输出零差异；额外用一组针对性构造的对抗语料（多空格、多短横线、多竖线、
 *    多括号、全角破折号等高密度胶水字符的组合）探测 4–6 这个此前 3 覆盖不到的
 *    区间，结果是：能多命中的语料全部是「方位名与星名之间只隔着更多同类标点/
 *    空白、中间不掺真实汉字或分句标点」的场景（如「东南  --  绝命」「东南——是
 *    ——绝命」）——因为 `GLUE` 词表本身不含分句标点或汉字，一旦中间插入真实文字或
 *    顿号/逗号/换行，链条在任何上限下都会断，与上限取 3 还是 6 无关。也就是说，
 *    上限只决定「同一类安全字符最多能连续出现几次」，不决定「能不能跨语义边界」——
 *    后者由 `GLUE` 词表本身（不含分句标点/换行）把关，见上方 ⚠️ 段。
 *
 * 结论：3 是无据收窄（旧注释「再多就是白送误配面」没有实测支撑），6 才是有数据
 * 支撑、且不漏检真实 markdown 排版的取值。
 */
const GLUE_MAX = 6;
/**
 * 「星名 → 方位名」之间要求的**方位动词**（「绝命方在西南」「五鬼位落在东南」
 * 「生气方为东南」）。刻意比 GLUE 严得多：这一向只认显式的方位断言，不认空白与
 * 表格分隔符——否则「东南：绝命 北：伏位」里的「绝命 北」也会被当成一对。
 */
const LOCATIVE = "[ \\t]*(?:落在|位于|在|为|是)[ \\t]*";

/**
 * 方位一致性校验：八方吉凶来自查表，模型输出可机械对拍。**双向**匹配，两个分支
 * 放在同一条正则的 alternation 里，对原文一次非重叠扫描：
 *
 * ① 方位名在前：「(\*\*)?<方位名>(\*\*)?<后缀>?<胶水×0-6>(\*\*)?<星名>(\*\*)?<后缀>?」
 *   覆盖「东南是绝命位」「东南方为绝命」「- 东南：绝命」「东南（绝命）」
 *   「**东南**是绝命位」「| 东南 | 绝命 |」「东南的绝命位」「东南属于绝命方」
 *   「东南角是绝命位」「- **东南**：**绝命**」。
 * ② 星名在前：「(\*\*)?<星名>(\*\*)?<后缀>?<方位动词>(\*\*)?<方位名>」
 *   覆盖「绝命方在西南」「五鬼位落在东南」「生气方为东南」——这是八宅最常见的
 *   中文语序，曾被当作「刻意不覆盖的良性缺口」，实际上它不是不覆盖，是被 ① 系统性
 *   误配：胶水一旦含分句标点，「…西：绝命方在西南」里的「西：绝命」就会被 ① 吃掉，
 *   把「西」判成绝命方并改写。所以覆盖 ② 与修 ① 是同一件事。
 *
 * 两分支交界处的裁决规则：**① 不得认领一个正在被 ② 认领的星名**——① 结尾挂一条
 * 否定前瞻，其内容就是 ② 的尾巴片段本身（同一份 `starFirstTail` 生成，capture 与否
 * 而已，两者不可能不同步）。语义上：中文里「X 方**在** Y」是比前文「Y'：」更强、
 * 更近的绑定，冲突时让位给它。JS 正则最左优先，若无这条前瞻，「西：绝命方在西南」
 * 里起点更靠左的 ① 会先赢——分支顺序救不了，必须靠前瞻。
 *
 * 无论哪个分支，**锚点都是方位名**（查表的 key），被改写的都是星名。
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
  const dirAlt = byLabel.map((d) => d.label).join("|");
  const starAlt = ALL_STARS.join("|");
  /**
   * 分支①专用：单字方位名（东/南/西/北）前加否定回顾 `(?<![一-龥])`（前面不得
   * 紧邻汉字），堵住「东西」「广东」「坐东」这类词里的裸字被当成方位名前半截、
   * 又和后面偶然出现的星名硬凑的误伤（如「这东西的生气很足」被错误纠正成
   * 「这东西的祸害很足」）。只加在①、只加给单字方位名：
   * - 双字方位名（东南/西南/东北/西北）没有这个歧义，不受影响，仍用不加限制的
   *   `dirAlt`。
   * - 分支②不受影响，仍用不加限制的 `dirAlt`——②的方位名常年紧跟在「在/落在/
   *   位于/为/是」这类汉字动词后面（如「延年位在南」），同一条回顾若误加到②会
   *   连着这些合法句式一起打断。
   * 实测（非断言）：对 guard.test.ts 全部既有黑盒用例（含要求必须命中的全部
   * 句式、整篇对拍）跑一遍，零回归——原因是这三类误伤命中的锚字全部紧邻真实
   * 汉字，而所有「必须命中」的分支①用例锚点要么是双字方位名、要么是单字方位名
   * 但前面是字符串开头或标点（不在 `[一-龥]` 范围内），两者都不受这条回顾影响。
   * 因此采用，详见 guard.test.ts「Task10 复审必修3」。
   */
  const aDirAlt = byLabel
    .map((d) => (d.label.length === 1 ? `(?<![一-龥])${d.label}` : d.label))
    .join("|");

  /**
   * 分支 ② 的尾巴：「<星名后缀>?<方位动词>(\*\*)?<方位名>」。
   * capture=true 用于 ② 本体（要拿回各段以便原样重拼），false 用于 ① 的否定前瞻。
   * `(?!四)`：「东四命 / 西四命 / 东四宅」是八宅的固有词，不能把里面的「东」「西」
   * 当成方位名——否则「生气方是东四命的最吉方位」会被判成「东 = 生气」并改写。
   */
  const starFirstTail = (capture: boolean) => {
    const g = (name: string) => (capture ? `(?<${name}>` : "(?:");
    return (
      `${g("bStarSuffix")}${STAR_SUFFIX})?${g("bGlue")}${LOCATIVE})` +
      `${g("bDirBold")}${BOLD})?${g("bDir")}${dirAlt})(?!四)`
    );
  };

  const pattern = new RegExp(
    // ① 方位名在前
    `(?<aDirBoldPre>${BOLD})?(?<aDir>${aDirAlt})(?<aDirBoldPost>${BOLD})?(?<aDirSuffix>${DIR_SUFFIX})?` +
      `(?<aGlue>(?:${GLUE}){0,${GLUE_MAX}})` +
      `(?<aStarBoldPre>${BOLD})?(?<aStar>${starAlt})(?<aStarBoldPost>${BOLD})?(?<aStarSuffix>${STAR_SUFFIX})?` +
      // 让位给 ②：这个星名是「X 方在 Y」的主语，它属于后面那个方位名，不属于前面那个
      `(?!(?:${BOLD})?${starFirstTail(false)})` +
      "|" +
      // ② 星名在前：星名前不得紧邻顿号 `(?<!、)`。星名只有 8 个词，若上一个分句
      // 或上一个「星名/方位名」枚举以顿号收尾、紧接着又是「位于/在」+ 方位枚举，
      // 枚举里最后一个星名会和下一个枚举的第一个方位名被误配成一对——例如
      // 「生气、天医、延年、伏位位于东南、东、南、北。」这句逐条都对，但「伏位」
      // 紧邻「位于东南」，没有这条回顾时会被②当成「东南」的星，与查表值「生气」
      // 不符而被错误纠正。顿号必然是枚举分隔符，其后的星名属于「枚举的下一项」，
      // 不是独立语句的主语，不该被②认领（见 guard.test.ts「Task10 复审必修1」）。
      `(?<!、)(?<bStarBoldPre>${BOLD})?(?<bStar>${starAlt})(?<bStarBoldPost>${BOLD})?${starFirstTail(true)}`,
    "g",
  );

  const text = markdown.replace(pattern, (match: string, ...rest: unknown[]) => {
    // 有命名捕获组时，replacer 的最后一个实参是 groups 对象（两个分支都有，恒成立）。
    const g = rest[rest.length - 1] as Record<string, string | undefined>;
    const dirFirst = g.aDir !== undefined;
    const label = (dirFirst ? g.aDir : g.bDir)!;
    const star = (dirFirst ? g.aStar : g.bStar)!;
    const d = byLabelName.get(label)!;
    if (star === d.star) return match;
    corrections.push({ direction: d.direction, label: d.label, wrote: star, correct: d.star });
    // 「伏位」自带「位」后缀：直接拼会得到「伏位位在北」，正确星名已含该后缀时去重。
    const suffix = (s: string | undefined) => (s && d.star.endsWith(s) ? "" : (s ?? ""));
    return dirFirst
      ? `${g.aDirBoldPre ?? ""}${label}${g.aDirBoldPost ?? ""}${g.aDirSuffix ?? ""}${g.aGlue ?? ""}` +
          `${g.aStarBoldPre ?? ""}${d.star}${g.aStarBoldPost ?? ""}${suffix(g.aStarSuffix)}`
      : `${g.bStarBoldPre ?? ""}${d.star}${g.bStarBoldPost ?? ""}${suffix(g.bStarSuffix)}` +
          `${g.bGlue ?? ""}${g.bDirBold ?? ""}${label}`;
  });

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
