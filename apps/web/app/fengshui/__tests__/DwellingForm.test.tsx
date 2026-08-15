import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart } from "@eamvp/core";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
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

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider locale="zh">{children}</I18nProvider>
);
beforeEach(() => {
  createDwelling.mockClear();
  updateDwelling.mockClear();
  // listProfiles 有一条测试用 mockResolvedValueOnce 覆盖默认返回值（只回主档案），
  // 不清空调用记录的话，后续测试里「listProfiles 确实被调用过」这类断言会被前一条
  // 测试的调用记录污染成假阳性——即便本测试的组件压根没发起过请求也会通过。
  listProfiles.mockClear();
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
