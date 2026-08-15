import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, computeFengshui, adviseObject, directionsFor, FENGSHUI_GUARDRAILS } from "@eamvp/core";
import { extractFengshuiFacts } from "./facts";
import {
  buildFengshuiSystemPrompt, buildFengshuiUserPrompt, parseFengshuiSections, FENGSHUI_SECTION_KEYS,
  buildObjectAdviceSystemPrompt, buildObjectAdviceUserPrompt,
} from "./prompt";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const fsChart = computeFengshui({ birth, chart: computeUnifiedChart(birth) });
const facts = extractFengshuiFacts(fsChart);
const objectAdvice = adviseObject(
  { verdicts: fsChart.personalDirections, affinity: fsChart.elementAffinity },
  { category: "desk", material: "原木" },
);

describe("EP-fs-05 风水 prompt", () => {
  it("三个分节键", () => {
    expect(FENGSHUI_SECTION_KEYS).toEqual(["situation", "youAndSpace", "actions"]);
  });

  // ⚠️ 下面两条只验 core 守护栏被带进来了。它们**不能**用来验本模块新增的硬规则——
  // FENGSHUI_GUARDRAILS 的原文就含「传统象征」「研究表明/科学证明」「不构成」「禁止自行推算」，
  // 把本模块新增的两行全删掉，这些断言照样通过。本模块自己的约束由后两条测试守。
  it("system prompt 带入 core 守护栏全文", () => {
    const s = buildFengshuiSystemPrompt("zh");
    for (const g of FENGSHUI_GUARDRAILS) expect(s).toContain(g);
  });

  it("system prompt 列出八个合法星名的白名单（本模块新增，core 守护栏没有）", () => {
    const s = buildFengshuiSystemPrompt("zh");
    for (const star of ["生气", "天医", "延年", "伏位", "绝命", "五鬼", "六煞", "祸害"]) {
      expect(s).toContain(star);
    }
    // 该措辞只存在于本模块，core 守护栏无此句
    expect(s).toContain("不得改写某方位对应的星");
    expect(FENGSHUI_GUARDRAILS.join("")).not.toContain("不得改写某方位对应的星");
  });

  it("system prompt 对传统象征给出仪式框架（本模块新增措辞）", () => {
    const s = buildFengshuiSystemPrompt("zh");
    expect(s).toContain("安顿自己的仪式");
    expect(FENGSHUI_GUARDRAILS.join("")).not.toContain("安顿自己的仪式");
  });

  // 发现3：sanitizeFengshui 的语境判定主要靠「传统象征」行内标注命中，但旧版
  // 输出格式说明只说"必要时"标注——非强制，能否标注取决于模型自愿，与"不依赖模型
  // 自觉"的反幻觉设计意图相悖。这里把它改成强制措辞，此测试锁定这个变化：
  // 既要确认强制语气真的换上了，也要确认旧的软化措辞"必要时"真的被替换掉了
  // （不能只加新句不删旧句，那样模型可能读到自相矛盾的指示）。
  it("system prompt 对「传统象征」标注改为强制，不再是「必要时」的软约束（发现3）", () => {
    const s = buildFengshuiSystemPrompt("zh");
    expect(s).toContain("必须在对应这一条的行内加注「（传统象征）」");
    expect(s).not.toContain("必要时在括号里标「传统象征」");
    // 该措辞只存在于本模块（输出格式说明），core 守护栏没有这句强制标注指示
    expect(FENGSHUI_GUARDRAILS.join("")).not.toContain("必须在对应这一条的行内加注");
  });

  it("user prompt 带入命卦与八方判语", () => {
    const u = buildFengshuiUserPrompt(facts);
    expect(u).toContain("坎");
    expect(u).toContain("东南"); // 坎命生气方
    expect(u).toContain("生气");
  });

  it("user prompt 对传统象征条目显式标注，且 modern 为空时写明不得编造", () => {
    const u = buildFengshuiUserPrompt(facts);
    expect(u).toContain("传统象征");
    // 留白会让模型自行填补现代机制，正是要防的反模式
    expect(u).toContain("无（不得编造）");
  });

  it("user prompt 不改动传入的 facts（sort 必须先复制）", () => {
    // ⚠️ 必须新造一份：模块级的 facts 已被前面的用例排过序，
    // 拿它当基准会让「原地排序」变成幂等操作而测不出来
    const fresh = extractFengshuiFacts(computeFengshui({ birth, chart: computeUnifiedChart(birth) }));
    const before = fresh.directions.map((d) => d.direction);
    // extractFengshuiFacts 按 DIRECTIONS 规范顺序产出，不是按吉凶排序
    expect(before).toEqual(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
    buildFengshuiUserPrompt(fresh);
    expect(fresh.directions.map((d) => d.direction)).toEqual(before);
  });

  it("parseFengshuiSections 按 H2 切三节，缺节置空", () => {
    const md = "## 形势\n甲\n\n## 境与你\n乙\n";
    const s = parseFengshuiSections(md, "zh");
    expect(s.situation.trim()).toBe("甲");
    expect(s.youAndSpace.trim()).toBe("乙");
    expect(s.actions).toBe("");
  });
});

// Task 11 复审必修2：adviseObjectText 的 prompt 此前是 index.ts 内联的手写字符串，
// 一条 core 硬规则都没带。builder 搬到这里后必须复用 FENGSHUI_GUARDRAILS（导入+展开），
// 不得手写删减版或复制粘贴守护栏原文。
describe("Task11 buildObjectAdviceSystemPrompt / buildObjectAdviceUserPrompt", () => {
  it("system prompt 带入 core 守护栏全文", () => {
    const s = buildObjectAdviceSystemPrompt("zh");
    for (const g of FENGSHUI_GUARDRAILS) expect(s).toContain(g);
  });

  // 两个语言分支各自独立展开 guardrails 数组，只测 zh 分支测不出 en 分支被单独
  // 删掉的变异（曾用变异验证实测：只删 en 分支的 ...guardrails 展开，若没有这条，
  // 全部测试仍然全绿）。两个分支都要单独钉住。
  it("en 分支也带入 core 守护栏全文（防止只删 en 分支展开而不被测出）", () => {
    const s = buildObjectAdviceSystemPrompt("en");
    for (const g of FENGSHUI_GUARDRAILS) expect(s).toContain(g);
  });

  // ⚠️ 与 prompt.ts 顶部注释同理：下面这条不能只验守护栏在场（那样删光本模块新增的
  // 物件专属约束，测试也会照样通过）。所以额外断言这些措辞**不在** core 守护栏原文
  // 里——证明它们确实是本模块自己贡献的内容，不是靠导入的守护栏躺赢。
  it("system prompt 含物件专属约束，且该措辞不在 core 守护栏原文里", () => {
    const s = buildObjectAdviceSystemPrompt("zh");
    const guardText = FENGSHUI_GUARDRAILS.join("");
    for (const phrase of ["只准使用给定的方位与规则", "不得断言吉凶后果", "只输出这"]) {
      expect(s).toContain(phrase);
      expect(guardText).not.toContain(phrase);
    }
    expect(s).toContain("2–3");
  });

  it("language 默认 zh", () => {
    expect(buildObjectAdviceSystemPrompt()).toContain("简体中文");
  });

  // Task 11 复审必修1：language="en" 时必须是本模块自己撰写的英文框架文字，
  // 不能是「中文原文 + 追加一句 answer in English」（旧 buildFengshuiSystemPrompt
  // 的反模式，这里明确不许重蹈）。
  it("language=en 时物件专属约束真的用英文书写，不是中文后面加一句 answer in English", () => {
    const en = buildObjectAdviceSystemPrompt("en");
    // 中文专属措辞不应残留在英文分支里——如果只是在中文提示后追加一行英文指令，
    // 这几个中文短语仍会出现在字符串里，下面两条断言就会失败。
    expect(en).not.toContain("自然中文");
    expect(en).not.toContain("只准使用给定的方位与规则");
    // 本模块自撰的英文物件专属约束必须真实存在（而不仅仅是结尾一行语言指令）。
    expect(en).toContain("Only use the directions and rules given");
    expect(en).toContain("2–3");
    expect(en).toMatch(/write the whole answer in english/i);
  });

  it("user prompt 传入 nickname 时出现在文本里，未传时兜底为「你」", () => {
    const withName = buildObjectAdviceUserPrompt(objectAdvice, { nickname: "小明" });
    expect(withName).toContain("称呼：小明");
    const withoutName = buildObjectAdviceUserPrompt(objectAdvice);
    // ⚠️ 不能只断言子串「你」——personalFit 里本来就常含「…属你命局所忌…」这类
    // 文字，裸「你」哪怕没接称呼兜底逻辑也会碰巧命中，测不出真问题。必须钉住
    // 「称呼：你」这个精确片段才是真的在验兜底逻辑本身。
    expect(withoutName).toContain("称呼：你");
  });

  it("user prompt 带入物件建议关键字段（品类、命局契合度）", () => {
    const u = buildObjectAdviceUserPrompt(objectAdvice);
    expect(u).toContain(objectAdvice.categoryLabel);
    expect(u).toContain(objectAdvice.personalFit);
  });

  /**
   * dwellingNote 必须进 prompt —— 这是强版物件顾问**唯一**多出来的可观察内容。
   *
   * 八宅的结构决定了「命卦吉方 ∩ 宅卦吉方」只可能是 4 或 0（枚举 8×8 全部命卦×宅卦
   * 组合验证过：东四命的四吉方恰好就是四个东四方，同组则四个全留、异组则一个不留），
   * 所以 object-advisor 里的 `usable` 恒等于 `good`，强版与弱版的 recommendedDirections
   * 逐字节相同。漏喂 dwellingNote，说人话层就会在一句「此宅与你不合」旁边照夸方位。
   *
   * ⚠️ fixture 必须真的取到异组宅卦：坎命（东四）配乾宅（西四）→ 交集为空 → note 非空。
   * 下面第一条断言先钉死这个前提，否则后面的断言会退化成恒真。
   */
  it("宅局提示非空时进 user prompt，并要求措辞与之一致", () => {
    const clash = adviseObject(
      {
        verdicts: fsChart.personalDirections,
        affinity: fsChart.elementAffinity,
        dwellingSectors: directionsFor("乾"), // 西四宅，与坎命（东四）异组
      },
      { category: "desk", material: "原木" },
    );
    // 前提校验：异组组合确实产出了非空 note。若哪天 core 改了行为，这里先红，
    // 而不是让下面那条断言悄悄变成「拼一个 null 进去也通过」。
    expect(clash.dwellingNote).not.toBeNull();

    const u = buildObjectAdviceUserPrompt(clash);
    expect(u).toContain(clash.dwellingNote!);
    expect(u).toContain("宅局提示");
  });

  it("宅局提示为空（同组或弱版）时不往 prompt 里塞空行", () => {
    // 同组：坎命配坎宅 → 交集非空 → note 为 null，与弱版一致。
    const same = adviseObject(
      {
        verdicts: fsChart.personalDirections,
        affinity: fsChart.elementAffinity,
        dwellingSectors: directionsFor("坎"),
      },
      { category: "desk", material: "原木" },
    );
    expect(same.dwellingNote).toBeNull();
    expect(buildObjectAdviceUserPrompt(same)).not.toContain("宅局提示");
    // 弱版（压根没传 dwellingSectors）同样不该出现。
    expect(buildObjectAdviceUserPrompt(objectAdvice)).not.toContain("宅局提示");
  });

  it("system prompt 中英两侧都带「不得反驳宅局提示」这条硬规则", () => {
    // 这条规则是上面 user prompt 那条的另一半：光把 note 喂进去，模型仍可能
    // 在下一句把同一个方位夸成「这套房子里的好位置」。
    expect(buildObjectAdviceSystemPrompt("zh")).toContain("宅局提示");
    expect(buildObjectAdviceSystemPrompt("en")).toMatch(/dwelling note/i);
  });
});

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
    const l0 = extractFengshuiFacts(computeFengshui({ birth, chart: computeUnifiedChart(birth) }));
    const u = buildFengshuiUserPrompt(l0);
    // ⚠️ 断言必须挑**实现真的会输出**的字符串。原先查的是「宅卦」——那两个字只出现在
    // system prompt 里，user prompt 无论哪一层都不会有，所以就算 Layer 0 漏出整个
    // 居所段落，那条断言也照样通过。这里改查 dwellingBlock 实际会产出的标记。
    expect(u).not.toContain("房屋八方判语");
    expect(u).not.toContain("居所：");
    expect(u).not.toContain("坐向：");
    // 同时确认它并非因为 prompt 是空的才"不含"——本命段落必须照常在
    expect(u).toContain("本命八方判语");

    // 对照组：Layer 1 下这三个标记都必须出现，证明上面查的确实是活的标记而非死字符串
    const l1 = buildFengshuiUserPrompt(l1Facts);
    expect(l1).toContain("房屋八方判语");
    expect(l1).toContain("居所：");
    expect(l1).toContain("坐向：");
  });

  it("system prompt 明令命卦八方与宅卦八方不得混用", () => {
    expect(buildFengshuiSystemPrompt("zh")).toMatch(/不得混用|分别对应|两套/);
  });

  // 与上面「user prompt 不改动传入的 facts（sort 必须先复制）」同款保护，覆盖宅八方这条
  // 新排序：⚠️ 必须新造一份 fresh facts —— 复用 describe 顶层的 l1Facts 会被前一个用例
  // 排过序，拿它当基准会让「原地排序」变成幂等操作而测不出来（与上面那条注释同一个坑）。
  it("user prompt 不改动传入的宅八方顺序（宅八方排序同样必须先 .slice() 复制）", () => {
    const fresh = extractFengshuiFacts(computeFengshui({ birth, chart: computeUnifiedChart(birth), dwelling }));
    const before = fresh.dwelling!.sectors.map((d) => d.direction);
    // extractFengshuiFacts 按 DIRECTIONS 规范顺序产出，不是按吉凶排序
    expect(before).toEqual(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
    buildFengshuiUserPrompt(fresh);
    expect(fresh.dwelling!.sectors.map((d) => d.direction)).toEqual(before);
  });
});
