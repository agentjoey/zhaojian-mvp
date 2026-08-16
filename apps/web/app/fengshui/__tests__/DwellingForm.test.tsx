import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart } from "@eamvp/core";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
// 上限的单一事实源，与 api/fengshui/reading/route.ts 的 `z.array(...).max()` 同源。
import { MAX_COHABITANTS } from "@/lib/fengshui-limits";
import { zh } from "@/lib/i18n/messages/zh";
import { DwellingForm } from "../DwellingForm";

const createDwelling = vi.fn(async (d: unknown) => ({ id: "d1", ...(d as object) }));
// updateDwelling 提到模块顶层（而非只在 vi.mock 工厂里内联）：Task 9b 的编辑回显测试要
// 直接断言 updateDwelling.mock.calls，工厂内联的 vi.fn 在测试体里无法引用同一个实例。
const updateDwelling = vi.fn<(id: string, patch: unknown) => Promise<void>>(async () => {});
vi.mock("@/lib/dwellings", () => ({
  createDwelling: (d: unknown) => createDwelling(d),
  updateDwelling: (id: string, patch: unknown) => updateDwelling(id, patch),
}));

/**
 * 同住人候选（Task 9b / EP-fs-13/14）：主档案「阿甲」+ 其他档案「阿乙」「阿丙」。
 * getActiveProfileId 固定回主档案 id——用来验证「过滤掉当前活跃档案自己」
 * （他是「我」，不该出现在同住人候选列表里，见 DwellingForm 的同住人区块）。
 */
const birthMain = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const birthB = BirthInputSchema.parse({ date: "1988-03-02", time: "09:00", gender: "female", trueSolarTime: false });
const birthC = BirthInputSchema.parse({ date: "1995-11-20", time: "20:00", gender: "male", trueSolarTime: false });
const PROFILE_MAIN = { id: "p1", nickname: "阿甲", birthInput: birthMain, chart: computeUnifiedChart(birthMain), createdAt: "", reading: null };
const PROFILE_B = { id: "p2", nickname: "阿乙", birthInput: birthB, chart: computeUnifiedChart(birthB), createdAt: "", reading: null };
const PROFILE_C = { id: "p3", nickname: "阿丙", birthInput: birthC, chart: computeUnifiedChart(birthC), createdAt: "", reading: null };
const listProfiles = vi.fn(async () => [PROFILE_MAIN, PROFILE_B, PROFILE_C]);
vi.mock("@/lib/profiles", () => ({
  listProfiles: () => listProfiles(),
  getActiveProfileId: () => "p1",
}));

/**
 * 最终评审 I3：本表单现在会为「合看是不是会员功能」向服务端探测一次
 * （GET /api/fengshui/reading，与 /fengshui、/fengshui/object 同一个端点、同一份
 * 服务端判断）。`@/lib/supabase` 的真实实现在没配 NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY
 * 时会抛错（与 fengshui/__tests__/page.test.tsx、dwellings/__tests__/page.test.tsx
 * 踩过的是同一个坑），必须 mock。会话内容做成共享可变量，好让「探测请求到底带不带
 * Authorization」这条链路可断言——写死 null 就等于零断言。
 */
const supabaseSession = { current: null as { access_token: string } | null };
vi.mock("@/lib/supabase", () => ({
  supabase: () => ({ auth: { getSession: vi.fn(async () => ({ data: { session: supabaseSession.current } })) } }),
}));

/**
 * EP-fs-tg：TG 分流是可变的——文件末尾「TG 会话」describe 把 inTg 翻成 true，
 * 断言候选人走 tgListProfiles 中介、保存走 MainButton。默认 false，
 * 既有用例行为不变（真实模块在 jsdom 下本来也恒 false，mock 只是让它可控）。
 */
const tgEnv = { inTg: false };
const tgListProfiles = vi.fn(async (): Promise<unknown[]> => []);
vi.mock("@/lib/tg/client", () => ({
  hasTgSession: () => tgEnv.inTg,
  isTelegram: () => tgEnv.inTg,
  tgListProfiles: () => tgListProfiles(),
}));

/** 闸门探测响应；route 返回 JSON `{ entitled }`。 */
function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, ...init });
}

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider locale="zh">{children}</I18nProvider>
);
beforeEach(() => {
  createDwelling.mockClear();
  updateDwelling.mockClear();
  // listProfiles 有一条测试用 mockResolvedValueOnce 覆盖默认返回值（只回主档案），
  // 不清空调用记录的话，后续测试里「listProfiles 确实被调用过」这类断言会被前一条
  // 测试的调用记录污染成假阳性——即便本测试的组件压根没发起过请求也会通过。
  listProfiles.mockReset().mockResolvedValue([PROFILE_MAIN, PROFILE_B, PROFILE_C]);
  supabaseSession.current = null;
  tgEnv.inTg = false;
  tgListProfiles.mockReset().mockResolvedValue([]);
  delete (window as any).Telegram;
  // 默认 entitled:true（对应「未开闸」= 默认配置，或「已是会员」）——保证 Task 9b
  // 既有的同住人用例无需逐条改动。非会员分支由本文件末尾的 I3 describe 专门覆盖。
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ entitled: true })));
});

describe("EP-fs-14 居所录入", () => {
  it("八个方位都是可点的按钮，不是下拉框（避免误选，且更易读）", () => {
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    for (const label of ["北", "东北", "东", "东南", "南", "西南", "西", "西北"]) {
      // 锚定完整匹配：单字方位（北/东/南/西）是复合方位（东北/东南/西南/西北）的子串，
      // 不锚定的话 getByRole 会因为一次匹中多个按钮而抛错——即便实现完全正确也会红。
      expect(screen.getByRole("button", { name: new RegExp(`^${label}$`) })).toBeInTheDocument();
    }
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("显示防填反的提示语——「向」是站在屋内面朝大门的方向", () => {
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByText(/站在屋内、面朝大门/)).toBeInTheDocument();
  });

  it("提供「不确定」选项，选它保存出 facing=null（降级 Layer 0，而非逼用户瞎猜）", async () => {
    const onSaved = vi.fn();
    render(<DwellingForm onSaved={onSaved} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: /不确定/ }));
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(createDwelling).toHaveBeenCalled());
    expect(createDwelling.mock.calls[0]![0]).toMatchObject({ facing: null });
    expect(onSaved).toHaveBeenCalled();
  });

  it("选具体方位后保存出对应枚举值", async () => {
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: /^南/ }));
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(createDwelling).toHaveBeenCalled());
    expect(createDwelling.mock.calls[0]![0]).toMatchObject({ facing: "S" });
  });

  it("租/自有可选，默认租住（首发市场租房比例高）", async () => {
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: /^南/ }));
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(createDwelling).toHaveBeenCalled());
    expect(createDwelling.mock.calls[0]![0]).toMatchObject({ tenancy: "rent" });
  });
});

describe("复审必修1：未选朝向时保存被禁用（touchedFacing 的覆盖缺口）", () => {
  // 此前 5 条测试全部先点方位/不确定再点保存，从未验证「什么都不碰直接点保存」这条路径——
  // 那样的话即便 disabled={saving || !touchedFacing} 退化成 disabled={saving}（禁用逻辑
  // 整个失效），5 条测试照样全绿。touchedFacing 存在的意义是区分「用户没选」与「用户主动选
  // 了不确定」——两者的 facing 最终都是 null，保存载荷里完全看不出差别，唯一能守住这个区分的
  // 就是禁用态本身。下面两条分别验证禁用态的「有」与「能解除」，缺一不可（否则要么按钮形同虚设，
  // 要么按钮永久锁死也能"通过"只测其中一半的用例）。

  it("不碰朝向直接点保存：按钮处于 disabled，且不触发 createDwelling", () => {
    const onSaved = vi.fn();
    render(<DwellingForm onSaved={onSaved} />, { wrapper: Wrapper });
    const saveButton = screen.getByText("保存");
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(createDwelling).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("点「不确定」之后保存按钮从禁用变为可用（证明 touchedFacing 真的在区分两种状态，不是永久禁用）", () => {
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    const saveButton = screen.getByText("保存");
    expect(saveButton).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /不确定/ }));
    expect(saveButton).not.toBeDisabled();
  });
});

describe("Task 9b：同住人选择 UI（原计划遗漏，补入后合看才真正可达）", () => {
  it("列出可选的同住人（当前档案之外的其他档案），默认都不勾选", async () => {
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText("同住人")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^阿乙$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^阿丙$/ })).toBeInTheDocument();
    // 主档案自己不该出现在同住人候选里——他是「我」，不是同住人
    expect(screen.queryByRole("button", { name: /^阿甲$/ })).toBeNull();
  });

  it("勾选的同住人进入保存载荷的 memberProfileIds", async () => {
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByRole("button", { name: /^阿乙$/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^阿乙$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^南$/ }));
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(createDwelling).toHaveBeenCalled());
    expect(createDwelling.mock.calls[0]![0]).toMatchObject({ memberProfileIds: ["p2"] });
  });

  // 多选是合看的全部意义所在（「这套房子对你、对他、对他都不一样」），
  // 但上面那几条都只点一个人：勾一个、勾了再取消、一个不勾。若 toggleMember
  // 退化成单选（`prev.includes(id) ? … : [id]`），12 条测试照样全绿。
  it("勾选两位同住人时两个 id 都进载荷（防 toggle 退化成单选）", async () => {
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByRole("button", { name: /^阿乙$/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^阿乙$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^阿丙$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^南$/ }));
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(createDwelling).toHaveBeenCalled());
    // 用集合比对而非数组：顺序是实现细节，不该被测试钉死
    const saved = (createDwelling.mock.calls[0]![0] as { memberProfileIds: string[] }).memberProfileIds;
    expect([...saved].sort()).toEqual(["p2", "p3"]);
  });

  it("多选后取消其中一位，另一位仍保留", async () => {
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByRole("button", { name: /^阿乙$/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^阿乙$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^阿丙$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^阿乙$/ })); // 只取消阿乙
    fireEvent.click(screen.getByRole("button", { name: /^南$/ }));
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(createDwelling).toHaveBeenCalled());
    // 取消一个不能把整个列表清空，也不能误删另一个
    expect(createDwelling.mock.calls[0]![0]).toMatchObject({ memberProfileIds: ["p3"] });
  });

  it("再次点击取消勾选，不残留在载荷里", async () => {
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByRole("button", { name: /^阿乙$/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^阿乙$/ })); // 勾选
    fireEvent.click(screen.getByRole("button", { name: /^阿乙$/ })); // 再点一次取消勾选
    fireEvent.click(screen.getByRole("button", { name: /^南$/ }));
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(createDwelling).toHaveBeenCalled());
    expect(createDwelling.mock.calls[0]![0]).toMatchObject({ memberProfileIds: [] });
  });

  it("编辑既有居所时回显已勾选的同住人", async () => {
    render(
      <DwellingForm
        initial={{ id: "d1", name: "家", kind: "home", tenancy: "rent", facing: "S", memberProfileIds: ["p3"] }}
        onSaved={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /^阿丙$/ })).toBeInTheDocument());
    // 回显必须是「已选中」态而非全部未选——否则一次编辑会静默清空同住人。不碰同住人区块，
    // 只碰一下朝向（本来就已回显为「南」），保存后 memberProfileIds 仍须是初始回显的 ["p3"]。
    fireEvent.click(screen.getByRole("button", { name: /^南$/ }));
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(updateDwelling).toHaveBeenCalled());
    expect(updateDwelling.mock.calls[0]![1]).toMatchObject({ memberProfileIds: ["p3"] });
  });

  it("没有其他档案时不渲染同住人区块（不给一个空壳）", async () => {
    listProfiles.mockResolvedValueOnce([PROFILE_MAIN]); // 系统里只有主档案自己
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    // 先证明 listProfiles 真的被调用且落定过——而不是「组件根本没发起请求，断言碰巧成立」
    // 的假阳性。@testing-library/react 的 waitFor 无论回调多快通过，内部 asyncWrapper 都会
    // 强制走一次真实的宏任务（setTimeout 0）才 resolve，足够把 listProfiles().then() 那个
    // 挂起的微任务、以及随之而来的 setState 落定下来。
    await waitFor(() => expect(listProfiles).toHaveBeenCalled());
    expect(screen.queryByText("同住人")).toBeNull();
  });
});

/** 把在途 promise / effect 排空，让「之后还会不会再冒出点什么」变成确定性的。 */
async function drainEffects(rounds = 3) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

/** 上限文案由 `{max}` 插值而来——从字典取模板再插值，不写死一份会漂移的字面量。 */
const LIMIT_NOTE = zh.fengshui.dwelling.membersLimitNote.replace("{max}", String(MAX_COHABITANTS));
const MEMBER_ONLY_NOTE = zh.fengshui.dwelling.membersMemberOnly;

/**
 * 最终评审 I1：同住人上限此前**只存在于服务端**
 * （`api/fengshui/reading/route.ts` 的 `z.array(...).max(MAX_COHABITANTS)`），
 * 选择器这头一个限制都没有。用户勾 9 位存下 → 此后每次加载 /fengshui 都被 Zod
 * 打成 400 → 「叙述暂时生成不出来」+ 一个永远不可能成功的重试按钮，而失败信息里
 * 没有任何东西指向同住人列表，用户无从自解。
 *
 * 上限的执行点就是候选人按钮的 `disabled`（唯一一处，没有第二份守卫兜着——
 * 摘掉它上限就整个失效，下面第一条当场变红）。
 */
describe("最终评审 I1：同住人选择器必须自己认上限（服务端上限不能只在服务端）", () => {
  /** 比上限多 1 位候选人：恰好能验证「第 上限+1 位勾不下去」。 */
  const MANY = Array.from({ length: MAX_COHABITANTS + 1 }, (_, i) => ({
    ...PROFILE_B, id: `m${i}`, nickname: `候选${i}`,
  }));

  /** 候选人昵称 `候选0`…`候选8` 互不为前缀，仍一律锚定完整匹配（方位名嵌套的老坑）。 */
  const chip = (i: number) => screen.getByRole("button", { name: new RegExp(`^候选${i}$`) });

  async function renderWithManyCandidates() {
    listProfiles.mockResolvedValue([PROFILE_MAIN, ...MANY]);
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(chip(0)).toBeInTheDocument());
  }

  function selectUpToLimit() {
    for (let i = 0; i < MAX_COHABITANTS; i++) fireEvent.click(chip(i));
  }

  it("勾满上限后，第 上限+1 位候选人被禁用，点了也进不了保存载荷", async () => {
    await renderWithManyCandidates();
    selectUpToLimit();

    const overflow = chip(MAX_COHABITANTS);
    expect(overflow).toBeDisabled();
    fireEvent.click(overflow); // 点了也没用

    fireEvent.click(screen.getByRole("button", { name: /^南$/ }));
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(createDwelling).toHaveBeenCalled());
    const saved = (createDwelling.mock.calls[0]![0] as { memberProfileIds: string[] }).memberProfileIds;
    expect(saved).toHaveLength(MAX_COHABITANTS);
    expect(saved).not.toContain(`m${MAX_COHABITANTS}`);
  });

  it("勾满上限时给出明确说明——用户当场就知道为什么点不动，而不是在另一个页面上撞 400", async () => {
    await renderWithManyCandidates();
    selectUpToLimit();
    expect(screen.getByText(LIMIT_NOTE)).toBeInTheDocument();
  });

  it("未达上限时既不禁用也不提示（对照组：这不是一个永远开着的闸门）", async () => {
    await renderWithManyCandidates();
    for (let i = 0; i < MAX_COHABITANTS - 1; i++) fireEvent.click(chip(i)); // 差一位到上限
    expect(chip(MAX_COHABITANTS)).not.toBeDisabled();
    expect(screen.queryAllByText(LIMIT_NOTE)).toHaveLength(0);
  });

  it("勾满之后仍能取消已选的人——上限不能把用户锁死在当前这组人上", async () => {
    await renderWithManyCandidates();
    selectUpToLimit();
    // 已选中的按钮永远可点，否则「换一个人」就成了死局
    expect(chip(0)).not.toBeDisabled();
    fireEvent.click(chip(0));
    // 让出一个名额后，原先被禁用的那位立刻可选
    expect(chip(MAX_COHABITANTS)).not.toBeDisabled();
    expect(screen.queryAllByText(LIMIT_NOTE)).toHaveLength(0);
  });

  it("编辑一个超限的历史居所时，回显被截断到上限——编辑是用户修正这份坏数据的唯一入口", async () => {
    // 上限是后加的：此前存下来的居所可能带着 9 个 id。原样回显再存回去，等于把那份
    // 「每次加载都 400」的坏数据又续了一次命。
    listProfiles.mockResolvedValue([PROFILE_MAIN, ...MANY]);
    render(
      <DwellingForm
        initial={{
          id: "d1", name: "家", kind: "home", tenancy: "rent", facing: "S",
          memberProfileIds: MANY.map((p) => p.id),
        }}
        onSaved={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(chip(0)).toBeInTheDocument());
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(updateDwelling).toHaveBeenCalled());
    const patch = updateDwelling.mock.calls[0]![1] as { memberProfileIds: string[] };
    expect(patch.memberProfileIds).toHaveLength(MAX_COHABITANTS);
  });
});

/**
 * 最终评审 I3：合看（同住人对照）是会员功能——`/fengshui` 的消费端早就有闸门
 * （`effectiveCohabitantInputs = entitled ? cohabitantInputs : undefined`），而这个
 * **产生**同住人名单的选择器却对非会员完全开放。于是 `BILLING_ENABLED=1` 时：
 * 免费用户勾选同住人 → id 被写进 `member_profile_ids` → 然后什么都不会出现。
 * 没有付费墙，没有提示，没有任何东西解释这份名单为什么不起作用。
 *
 * ⚠️ 「不知道」不等于「不是会员」：探测在途 / 探测失败 / 200 但读不出布尔，一律
 * **不挡**（下面有专门的对照条目）。`BILLING_ENABLED` 未设置是默认配置，此时服务端
 * 对任何人都放行，把一次网络抖动渲染成「这是会员功能」就是向有权限的用户推销
 * ——与 Task 10 修复单 Critical 1 是同一条规矩。
 */
describe("最终评审 I3：非会员必须在选择器处就知道合看是会员功能", () => {
  async function renderBlocked() {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ entitled: false })));
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText(MEMBER_ONLY_NOTE)).toBeInTheDocument());
  }

  it("服务端明确答 entitled:false：给出会员说明，且候选人全部禁用", async () => {
    await renderBlocked();
    expect(screen.getByRole("button", { name: /^阿乙$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^阿丙$/ })).toBeDisabled();
  });

  it("非会员点候选人不产生任何选择——不会存下一份永远不会被渲染的名单", async () => {
    await renderBlocked();
    fireEvent.click(screen.getByRole("button", { name: /^阿乙$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^南$/ }));
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(createDwelling).toHaveBeenCalled());
    expect(createDwelling.mock.calls[0]![0]).toMatchObject({ memberProfileIds: [] });
  });

  it("会员（entitled:true）：没有会员说明，候选人可正常勾选——对照组，证明说明不是恒常显示", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ entitled: true }));
    vi.stubGlobal("fetch", fetchSpy);
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await drainEffects(); // 探测已落定，不是「早了一拍还没来得及挡」

    expect(screen.queryAllByText(MEMBER_ONLY_NOTE)).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^阿乙$/ })).not.toBeDisabled();
  });

  it("探测失败（网络异常）：按「资格未知」处理——不挡、也不推销", async () => {
    const fetchSpy = vi.fn(async () => { throw new Error("network down"); });
    vi.stubGlobal("fetch", fetchSpy);
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await drainEffects();

    expect(screen.queryAllByText(MEMBER_ONLY_NOTE)).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^阿乙$/ })).not.toBeDisabled();
  });

  it("探测返回 200 但 body 读不出 entitled 布尔值（广告拦截器/离线占位页）：同样按未知处理，不 Boolean() 成 false", async () => {
    const fetchSpy = vi.fn(async () => new Response("<html>offline</html>", { headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", fetchSpy);
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await drainEffects();

    expect(screen.queryAllByText(MEMBER_ONLY_NOTE)).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^阿乙$/ })).not.toBeDisabled();
  });

  it("没有候选人时根本不发起闸门探测——探测结果影响不到任何东西，不该白发一次网络往返", async () => {
    listProfiles.mockResolvedValue([PROFILE_MAIN]); // 只有主档案自己 → 选择器不渲染
    const fetchSpy = vi.fn(async () => jsonResponse({ entitled: false }));
    vi.stubGlobal("fetch", fetchSpy);
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(listProfiles).toHaveBeenCalled());
    await drainEffects();

    expect(screen.queryByText("同住人")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("探测请求带上 Supabase 会话 token——否则 BILLING_ENABLED=1 时每个邮箱/匿名会员都会被误判成非会员", async () => {
    supabaseSession.current = { access_token: "tok-xyz" };
    const fetchSpy = vi.fn(async () => jsonResponse({ entitled: true }));
    vi.stubGlobal("fetch", fetchSpy);
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/fengshui/reading");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-xyz");
  });

  it("没有会话时不伪造 Authorization 头（对照组）", async () => {
    supabaseSession.current = null;
    const fetchSpy = vi.fn(async () => jsonResponse({ entitled: true }));
    vi.stubGlobal("fetch", fetchSpy);
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

/**
 * EP-fs-tg：TG 会话下的 DwellingForm。两个实质断言点：
 *  1. 同住人候选必须走 tgListProfiles() 中介——真实模块在 TG 里走 listProfiles()
 *     （匿名 Supabase + RLS）只会拿到空列表，选择器永远不渲染，合看无从选起。
 *     TG 的「当前档案」约定为列表首条（profiles/page.tsx 同一约定），候选人要排除它。
 *  2. 保存由 TG MainButton 承担，页内按钮不渲染。
 *
 * 变异验证（实跑过）：把 DwellingForm 候选人 effect 里的 `hasTgSession()` 改成恒
 * false，第 1 条变红（走了 listProfiles、候选人里有「阿甲」）；把 `inTg` 改成恒
 * false，第 2/3 条变红。
 */
describe("EP-fs-tg TG 会话：候选走中介 + MainButton 保存", () => {
  let mainButtonClick: (() => void) | null;
  let mb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    tgEnv.inTg = true;
    mainButtonClick = null;
    mb = {
      setText: vi.fn(), enable: vi.fn(), disable: vi.fn(), show: vi.fn(), hide: vi.fn(),
      onClick: vi.fn((cb: () => void) => { mainButtonClick = cb; }),
      offClick: vi.fn(),
    };
    (window as any).Telegram = {
      WebApp: {
        initData: "x",
        MainButton: mb,
        HapticFeedback: { impactOccurred: vi.fn(), notificationOccurred: vi.fn() },
      },
    };
  });

  it("同住人候选走 tgListProfiles 中介，排除列表首条（当前档案），不碰 listProfiles", async () => {
    tgListProfiles.mockResolvedValue([PROFILE_MAIN, PROFILE_B]);
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByRole("button", { name: "阿乙" })).toBeInTheDocument());
    // 首条=当前档案「阿甲」，不该出现在候选里
    expect(screen.queryByRole("button", { name: "阿甲" })).toBeNull();
    expect(tgListProfiles).toHaveBeenCalled();
    expect(listProfiles).not.toHaveBeenCalled();
  });

  it("页内保存按钮隐藏，MainButton 接管（setText=保存，未选朝向时禁用）", async () => {
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(mb.setText).toHaveBeenCalledWith("保存"));
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    expect(mb.disable).toHaveBeenCalled(); // touchedFacing=false → enabled:false
  });

  it("MainButton 点击触发保存（选朝向 → enable → 点击 → createDwelling 收到朝向）", async () => {
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(mb.setText).toHaveBeenCalledWith("保存"));
    fireEvent.click(screen.getByRole("button", { name: new RegExp("^南$") }));
    await waitFor(() => expect(mb.enable).toHaveBeenCalled());
    expect(mainButtonClick).not.toBeNull();
    await act(async () => {
      mainButtonClick!();
    });
    await waitFor(() =>
      expect(createDwelling).toHaveBeenCalledWith(expect.objectContaining({ facing: "S" })),
    );
  });

  it("TG 的 kind/tenancy 选择器真的接线：点「办公」「自有」→ 保存收到 office/own（复审必修 B）", async () => {
    // M1 把 TG 下这两个选择器换成了共享原生分段组件——「某个宿主渲染哪个组件」
    // 是最高回归风险位置。本条的变异对照（复审实跑过）：把 TG 两个选择器的
    // onChange 双双改成空函数，本条变红。
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    await waitFor(() => expect(mb.setText).toHaveBeenCalledWith("保存"));
    // 组模式的按钮带 aria-pressed；「办公」精确匹配（不与「住宅」混淆——中文
    // 这里虽不互为子串，但沿用本文件的精确匹配纪律）。
    const officeBtn = screen.getByRole("button", { name: new RegExp("^办公$") });
    expect(officeBtn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(officeBtn);
    fireEvent.click(screen.getByRole("button", { name: new RegExp("^自有$") }));
    expect(officeBtn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: new RegExp("^南$") }));
    await waitFor(() => expect(mb.enable).toHaveBeenCalled());
    await act(async () => {
      mainButtonClick!();
    });
    await waitFor(() =>
      expect(createDwelling).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "office", tenancy: "own", facing: "S" }),
      ),
    );
  });

  it("web 分支（对照组）：页内保存按钮在，MainButton 不被触碰", () => {
    tgEnv.inTg = false;
    render(<DwellingForm onSaved={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(mb.setText).not.toHaveBeenCalled();
  });
});
