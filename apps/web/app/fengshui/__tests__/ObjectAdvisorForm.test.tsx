import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import {
  BirthInputSchema, computeUnifiedChart, computeFengshui, dwellingGua,
  DIRECTIONS, DIRECTION_LABEL, type Direction,
} from "@eamvp/core";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { ObjectAdvisorForm } from "../ObjectAdvisorForm";

/**
 * EP-fs-18：把 core 的 `adviseObject` 包一层记录入参（**不改行为**，直接透传真实
 * 实现）。理由与 `app/fengshui/__tests__/page.test.tsx` 包 `computeFengshui` 的理由
 * 一模一样，而且这里更硬：
 *
 * 八宅的四吉方要么整组落在东四方、要么整组落在西四方，因此「命卦吉方 ∩ 宅卦吉方」
 * 只可能是**四个全中**（同组）或**一个不中**（异组）——已对全部 8 命卦 × 8 朝向
 * 共 64 种组合实测确认。于是同组居所下，强版算出的 `recommendedDirections` 与弱版
 * **逐字节相同**：把 `dwellingSectors` 的透传整个删掉，任何只看渲染结果的断言都照绿。
 * 想让「宅八方真的传下去了」成为一条可证伪的事实，只能直接看入参。
 */
const { adviseObjectCalls } = vi.hoisted(() => ({
  adviseObjectCalls: { inputs: [] as { dwellingSectors?: unknown }[] },
}));
vi.mock("@eamvp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@eamvp/core")>();
  return {
    ...actual,
    adviseObject: (
      input: Parameters<typeof actual.adviseObject>[0],
      q: Parameters<typeof actual.adviseObject>[1],
    ) => {
      adviseObjectCalls.inputs.push(input);
      return actual.adviseObject(input, q);
    },
  };
});

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const fs = computeFengshui({ birth, chart: computeUnifiedChart(birth) });

function Wrapper({ children, locale = "zh" as const }: { children: React.ReactNode; locale?: "zh" | "en" }) {
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}

beforeEach(() => {
  adviseObjectCalls.inputs.length = 0;
  vi.stubGlobal("fetch", vi.fn(async () => new Response("放东边靠墙就好。")));
});

/**
 * EP-fs-08 物件顾问表单。建议本身（推荐方位 / 不宜方位 / 品类规则 / 与你的关系）
 * 完全由 `adviseObject`（core 纯函数）在客户端确定性算出；LLM 只把结果润色成
 * 2–3 句人话，失败不影响可用性 —— 这是本组件与「境」主页面共享的降级原则。
 */
describe("EP-fs-08 物件顾问表单", () => {
  it("提交后给出确定性建议（推荐方位与品类规则）", async () => {
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText("品类"), { target: { value: "desk" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    await waitFor(() => expect(screen.getByText("推荐方位")).toBeInTheDocument());
    expect(screen.getByText("这类物件的讲究")).toBeInTheDocument();
  });

  it("镜子显示「不对床」规则", async () => {
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText("品类"), { target: { value: "mirror" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    await waitFor(() => expect(screen.getByText(/不正对床/)).toBeInTheDocument());
  });

  it("LLM 失败时确定性结果仍完整显示", async () => {
    const fetchMock = vi.fn(async () => new Response("x", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText("品类"), { target: { value: "desk" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    // 确定性结果由 submit() 同步 setAdvice() 算出，点击那一刻就已经在 DOM 里——
    // 所以「推荐方位」在 fetch 的 503 响应被处理前就已可见，光 waitFor 一次极易在
    // 第一次同步检查就通过而根本没等 .then()/.catch() 跑完，测不出「失败路径是否
    // 反而把已有结果清空」这类回归（曾实测：故意让失败分支 setAdvice(null)，
    // 这里若不显式等待该异步链路落定，测试仍会绿）。显式等 fetch 被调用、
    // 再把它返回的 promise 走完（与组件内部 `.then` 挂在同一个 promise 上，
    // 按调用顺序，组件的 `.then` 先挂上、必定先于这里的 await 结算），
    // 才断言确定性结果仍完整——这才是这条用例名字承诺的东西。
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => { await fetchMock.mock.results[0]!.value; });
    expect(screen.getByText("推荐方位")).toBeInTheDocument();
    expect(screen.getByText("这类物件的讲究")).toBeInTheDocument();
    expect(screen.getByText("不宜方位")).toBeInTheDocument();
    expect(screen.getByText("与你的关系")).toBeInTheDocument();
  });

  // 补充：brief 给的三条只覆盖「品类规则」一个确定性板块；「不宜方位」与「与你的关系」
  // 是另外两个独立渲染分支，各自都可能被误删而不被上面三条测试察觉，需要单独锁定。
  it("不宜方位与与你的关系两个板块也一并渲染", async () => {
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText("品类"), { target: { value: "desk" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    await waitFor(() => expect(screen.getByText("不宜方位")).toBeInTheDocument());
    expect(screen.getByText("与你的关系")).toBeInTheDocument();
  });

  // "金属" 是 core `MATERIAL_ELEMENT` 表里字面登记的键，对应五行"金"——直接取自
  // packages/core/src/fengshui/object-advisor.ts 源码，不经过在测试里再调用一次
  // adviseObject() 来"自证"期望值。
  it("选定材质后按五行对照表显示物件五行", async () => {
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText("品类"), { target: { value: "desk" } });
    fireEvent.change(screen.getByLabelText("材质"), { target: { value: "金属" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    await waitFor(() => expect(screen.getByText("物件五行：金")).toBeInTheDocument());
  });

  it("未指定摆放方位时不显示「你想放的位置」；指定后才显示", async () => {
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText("品类"), { target: { value: "desk" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    await waitFor(() => expect(screen.getByText("推荐方位")).toBeInTheDocument());
    expect(screen.queryByText("你想放的位置")).toBeNull();

    fireEvent.change(screen.getByLabelText("打算放在"), { target: { value: "N" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    await waitFor(() => expect(screen.getByText("你想放的位置")).toBeInTheDocument());
  });

  // 「境」主页面（page.tsx）请求 /api/fengshui/reading 时带 x-zj-locale 头，物件顾问
  // 走同一条约定；这里直接断言请求头，而不是断言润色文案本身的语言（那要靠 LLM，
  // 本组件对此没有决定权），避免测出一个组件管不到的东西。
  it("提交请求带上 x-zj-locale 头，随当前 locale 变化", async () => {
    const fetchMock = vi.fn<(...args: [RequestInfo | URL, RequestInit?]) => Promise<Response>>(
      async () => new Response("ok"),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: (p) => <Wrapper {...p} locale="en" /> });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "desk" } });
    fireEvent.click(screen.getByText("Find a good spot"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/fengshui/object");
    expect(init!.headers).toMatchObject({ "x-zj-locale": "en" });
  });
});

/* ────────────────────────── EP-fs-18 强版（宅八方） ────────────────────────── */

/**
 * 从「推荐方位」标题后面那个 `<ul>` 里精确读出方位名。
 *
 * ⚠️ 中文方位名互为子串（北 ⊂ 东北，东/南/西 ⊂ 东南/西南/西北），本仓库已因此出过
 * 三次 bug。所以这里**不做任何字符串包含匹配**：先按渲染模板的分隔符 `｜` 切出
 * 「方位名」那一段，再用一张精确的「名 → 枚举」反查表还原成 Direction。名字对不上
 * 就得到 undefined，由调用方断言拦下，不会静默跳过。
 */
const DIRECTION_BY_LABEL = Object.fromEntries(
  DIRECTIONS.map((d) => [DIRECTION_LABEL[d], d]),
) as Record<string, Direction | undefined>;

function readDirections(headingText: string): Direction[] {
  const list = screen.getByText(headingText).nextElementSibling;
  expect(list?.tagName).toBe("UL");
  return Array.from(list!.querySelectorAll("li")).map((li) => {
    const label = li.textContent!.split("｜")[0]!;
    const dir = DIRECTION_BY_LABEL[label];
    expect(dir, `渲染出的方位名「${label}」不在八方枚举里`).toBeDefined();
    return dir!;
  });
}

function submitDeskInWood() {
  fireEvent.change(screen.getByLabelText("品类"), { target: { value: "desk" } });
  fireEvent.change(screen.getByLabelText("材质"), { target: { value: "原木" } });
  fireEvent.click(screen.getByText("看看放哪儿好"));
}

/**
 * 夹具全部从**真实**命卦/宅卦算出，不手写方位数组：
 * - 命主 1990-06-15 男 → 坎命（东四命），四吉方 = 东四方 {N,S,E,SE}
 * - 「相配」居所：向北 → 坐南 → 离宅（东四宅），四吉方同为东四方 → 交集 = 四吉方
 * - 「相冲」居所：向东南 → 坐西北 → 乾宅（西四宅），四吉方 = 西四方 → 交集为空
 *
 * 交集是不是真的空，由下面第一条「夹具自检」实测断言，不靠假设——brief 第三条测试
 * 的全部意义都建立在「交集确实为空」上，这个前提一旦悄悄不成立（比如把 facing 写成
 * 同组方位），整条测试就退化成一句恒真的废话。
 */
const clashSectors = dwellingGua("SE").sectors; // 乾宅（西四宅）
const matchSectors = dwellingGua("N").sectors; // 离宅（东四宅）

/** 坎命四吉方按吉度排序 = 生气巽(SE) → 天医震(E) → 延年离(S) → 伏位坎(N)。 */
const KAN_GOOD_BY_RANK: Direction[] = ["SE", "E", "S", "N"];
/**
 * 期望的推荐方位（**手工从数据表推出，不调用被测函数自证**）：
 * 书桌 + 原木 → 五行木 → `ELEMENT_DIRECTIONS.木 = [E, SE]`；四吉方与之取交集后
 * 仍按吉度排序 → [SE, E]，`adviseObject` 取前 3 个 → 就是这两个。
 */
const EXPECTED_PICKS: Direction[] = ["SE", "E"];

describe("EP-fs-18 物件顾问强版（宅八方）", () => {
  it("夹具自检：相冲居所与命卦吉方交集确为空；相配居所交集确为四吉方", () => {
    const personGood = DIRECTIONS.filter((d) => fs.personalDirections[d].auspicious);
    expect(personGood.slice().sort()).toEqual(KAN_GOOD_BY_RANK.slice().sort());
    // 交集为空——brief 第三条测试成立的前提，实测而非假设。
    expect(personGood.filter((d) => clashSectors[d].auspicious)).toEqual([]);
    // 对照组：同组居所的交集是满的（说明上面那个空不是因为读错了 sectors 结构）。
    expect(personGood.filter((d) => matchSectors[d].auspicious).slice().sort()).toEqual(
      personGood.slice().sort(),
    );
  });

  it("有居所时把宅八方交给 adviseObject（入参可证伪），推荐位仍是手工推出的那两个", async () => {
    render(<ObjectAdvisorForm fs={fs} dwellingSectors={matchSectors} />, { wrapper: Wrapper });
    submitDeskInWood();
    await waitFor(() => expect(screen.getByText("推荐方位")).toBeInTheDocument());

    // ① 宅八方**确实**交到了 adviseObject 手上。同组居所下渲染结果与弱版逐字节
    //    相同（见文件顶部 vi.mock 的说明），这条入参断言是唯一能证伪「透传被删掉」
    //    的手段——少了它，把 dwellingSectors 整个删掉本条测试照样全绿。
    expect(adviseObjectCalls.inputs).toHaveLength(1);
    expect(adviseObjectCalls.inputs[0]!.dwellingSectors).toEqual(matchSectors);

    const picks = readDirections("推荐方位");
    // ② 再钉死具体是哪几个方位（手工从游年表 + 五行方位表推出）——只断言「非空」
    //    在这里是空转的：本组合下推荐位恒为两个，长度检查抓不到任何一种排错。
    expect(picks).toEqual(EXPECTED_PICKS);
    // ⚠️ 最终评审 M2：这里原来还有一个 `for (const d of picks)` 循环，断言每个推荐位
    //    同时是命卦吉方与宅卦吉方。它**恒真**，删除，别再加回来：
    //    (a) 本条测试上面那句 `expect(picks).toEqual(EXPECTED_PICKS)` 已经把结果钉死到
    //        具体的两个方位，逐元素再检查一遍性质提供不了额外判别力；
    //    (b) 更根本的是，本文件第一条「夹具自检」已经实测证明了本夹具下
    //        `personGood ⊆ matchGood`（同组居所交集是满的），所以只要 picks ⊆ personGood
    //        ——那是 core 对**弱版**就成立的性质——循环里的两个断言必然同时成立；
    //    (c) 这个性质也根本不是强版的特征：八宅结构决定「命卦吉方 ∩ 宅卦吉方」只可能是
    //        4（同组）或 0（异组），所以它对弱版同样成立。旧标题「推荐位同时满足命卦与
    //        宅卦」复述的正是这个已被推翻的前提（详见 ../object/page.tsx 顶部注释）。
    //    本条真正承重的是 ① 的入参 spy —— 标题已据实改写。
    //
    // 交集非空 → core 判定「没话说就不说」，不该出现说明卡。
    // 这不是恒真的缺席断言：同一个字符串在下面「相冲」两条测试里确实会渲染出来。
    expect(screen.queryByText("关于这套房子")).toBeNull();
  });

  it("无居所时行为与波1 一致（不传 dwellingSectors）", async () => {
    const fetchMock = vi.fn<(...a: [RequestInfo | URL, RequestInit?]) => Promise<Response>>(
      async () => new Response("ok"),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: Wrapper });
    submitDeskInWood();
    await waitFor(() => expect(screen.getByText("推荐方位")).toBeInTheDocument());

    // 「与波1 一致」的字面含义：`adviseObject` 收到的入参里**根本没有** dwellingSectors。
    // 这比只看渲染结果强——同组居所下强弱两版渲染结果相同，光看 UI 分辨不出。
    // （`undefined` 与「键不存在」在 core 里等价——`dwellingSectors ? … : good`，
    //   core 自己的单测也把两者当同一件事，所以断言到 undefined 为止。）
    expect(adviseObjectCalls.inputs).toHaveLength(1);
    expect(adviseObjectCalls.inputs[0]!.dwellingSectors).toBeUndefined();

    expect(readDirections("推荐方位")).toEqual(EXPECTED_PICKS);
    expect(screen.queryByText("关于这套房子")).toBeNull();
    // 冗余守卫：**发到线上那份**载荷（POST body，也就是 LLM 润色的输入）里
    // dwellingNote 仍是 null——渲染与上行用的是同一个 advice 对象，这条守的是后者。
    //
    // ⚠️ 别高估它的判别力（这里原先的注释吹过了）：只有当组件凭空造出一份**异组**的
    //    dwellingSectors 时它才会红。传命卦自身（`fs.personalDirections`）时
    //    `houseGood === good` ⇒ dwellingNote 仍是 null，这条照绿；传空对象 `{}` 则是在
    //    core 里 `dwellingSectors[v.direction].auspicious` 抛 TypeError，也不是靠这条
    //    字段变化被发现的。真正与「同不同组」无关的判别力在上面那句入参断言。
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as { dwellingNote: unknown };
    expect(body.dwellingNote).toBeNull();
  });

  it("交集为空时显示 dwellingNote 说明，而不是给空推荐", async () => {
    render(<ObjectAdvisorForm fs={fs} dwellingSectors={clashSectors} />, { wrapper: Wrapper });
    submitDeskInWood();
    await waitFor(() => expect(screen.getByText("推荐方位")).toBeInTheDocument());

    // ①「不是空推荐」——交集**确实**为空（见上面的夹具自检），所以这里的非空
    //   完全来自 core 的「退回命卦吉方」兜底，不是恒真。
    const picks = readDirections("推荐方位");
    expect(picks).toEqual(EXPECTED_PICKS);
    for (const d of picks) {
      expect(fs.personalDirections[d].auspicious).toBe(true); // 仍是命卦吉方
      expect(clashSectors[d].auspicious).toBe(false); // 但对这套房子并不吉——这正是要说明的事
    }

    // ② 说明文案可见。正文断言用 core 里那句话的字面片段：若组件改成渲染一句自编的
    //    i18n 文案（而不是把 advice.dwellingNote 显示出来），这里立刻红。
    expect(screen.getByText("关于这套房子")).toBeInTheDocument();
    expect(screen.getByText(/吉方与你的命卦吉方不重合/)).toBeInTheDocument();
    expect(screen.getByText(/人比房子要紧/)).toBeInTheDocument();
  });

  /**
   * 提示块必须排在 LLM 润色文案**之前**——这不是排版偏好，是提示词里写死的一句话：
   * `packages/llm/src/fengshui/prompt.ts` 告诉模型这条宅局提示「已原样展示在你这段话
   * 上方」，并据此要求模型的措辞与它一致。两块一旦调换顺序，提示词就在对模型说假话
   * （而模型看不见 DOM，无从察觉）。已实测：把 `dwellingNote` 块移到 `{prose && …}`
   * 下面，五个 app/fengshui 测试文件 104/104 全绿——没有任何断言看顺序。
   *
   * 断言用 `compareDocumentPosition` 而不是比对 `textContent` 里的字符串下标：中文方位名
   * 与文案彼此互为子串，本仓库已因字符串包含匹配出过三次 bug，能不做子串匹配就不做。
   */
  it("宅局提示排在 LLM 润色文案之前（prompt.ts 对模型声称的顺序）", async () => {
    render(<ObjectAdvisorForm fs={fs} dwellingSectors={clashSectors} />, { wrapper: Wrapper });
    submitDeskInWood();
    // 润色文案是异步来的（beforeEach 里的 fetch 桩返回这句），等它到位两块才同时在场。
    await waitFor(() => expect(screen.getByText("放东边靠墙就好。")).toBeInTheDocument());

    const note = screen.getByText(/吉方与你的命卦吉方不重合/);
    const prose = screen.getByText("放东边靠墙就好。");
    const pos = note.compareDocumentPosition(prose);
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING, "润色文案应排在宅局提示之后").toBeTruthy();
    expect(pos & Node.DOCUMENT_POSITION_PRECEDING, "宅局提示不该被排到润色文案之后").toBeFalsy();
  });

  it("英文 locale 下说明卡的小标题走 i18n（正文仍是 core 产出的中文）", async () => {
    render(<ObjectAdvisorForm fs={fs} dwellingSectors={clashSectors} />, {
      wrapper: (p) => <Wrapper {...p} locale="en" />,
    });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "desk" } });
    fireEvent.click(screen.getByText("Find a good spot"));
    await waitFor(() => expect(screen.getByText("About this home")).toBeInTheDocument());
    expect(screen.queryByText("关于这套房子")).toBeNull();
  });
});
