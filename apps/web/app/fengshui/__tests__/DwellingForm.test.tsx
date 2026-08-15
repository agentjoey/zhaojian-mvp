import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { DwellingForm } from "../DwellingForm";

const createDwelling = vi.fn(async (d: unknown) => ({ id: "d1", ...(d as object) }));
vi.mock("@/lib/dwellings", () => ({
  createDwelling: (d: unknown) => createDwelling(d),
  updateDwelling: vi.fn(async () => {}),
}));

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider locale="zh">{children}</I18nProvider>
);
beforeEach(() => createDwelling.mockClear());

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
