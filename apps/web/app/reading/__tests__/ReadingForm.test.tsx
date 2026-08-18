import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { ReadingForm } from "../ReadingForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider locale="zh">{children}</I18nProvider>
);

function render_() {
  return render(<ReadingForm />, { wrapper: Wrapper });
}

beforeEach(() => {
  delete window.Telegram;
});

/**
 * 对照设计稿（frontend-harness 审查，2026-08-18）：ReadingForm 是全站唯一
 * 还留着方框输入的页面，这次改成「细线下划」的纯文字字段 + 文字型性别切换——
 * 此前这个文件零测试覆盖，真实行为改动交独立评审前必须补上。
 */
describe("ReadingForm：对照设计稿", () => {
  it("字段是细线下划，不是方框——无背景色、无边框圆角，只有底部一条线", () => {
    render_();
    const nickname = screen.getByPlaceholderText(/称呼|昵称|nickname/i) as HTMLInputElement;
    expect(nickname.style.background).not.toBe("var(--color-surface)");
    expect(nickname.style.borderRadius).toBe("");
    expect(nickname.style.borderBottom).toBe("1px solid var(--color-line)");
    // 反向锁定：不再是旧的四边框方框（border: 1px solid var(--color-line) 全边）
    expect(nickname.style.border).toBe("");
  });

  it("性别切换是文字下划选中，不是实心药丸按钮", () => {
    render_();
    const maleBtn = screen.getByText("乾 · 男");
    const femaleBtn = screen.getByText("坤 · 女");
    // 未选中：无背景色差异，只用文字色 + 透明底线区分
    expect(maleBtn.style.background).toBe("");
    expect(femaleBtn.style.background).toBe("");
    expect(maleBtn.style.borderBottom).toBe("2px solid transparent");
    expect(femaleBtn.style.borderBottom).toBe("2px solid transparent");

    fireEvent.click(maleBtn);
    expect(maleBtn.style.color).toBe("var(--color-cinnabar)");
    expect(maleBtn.style.borderBottom).toBe("2px solid var(--color-cinnabar)");
    expect(maleBtn.style.fontWeight).toBe("600");
    // 另一个仍未选中
    expect(femaleBtn.style.color).toBe("var(--color-muted)");
    expect(femaleBtn.style.borderBottom).toBe("2px solid transparent");

    // 隐藏字段同步写入表单值（提交时靠它，不是靠按钮本身）
    const hidden = document.querySelector('input[name="gender"]') as HTMLInputElement;
    expect(hidden.value).toBe("male");

    fireEvent.click(femaleBtn);
    expect(hidden.value).toBe("female");
    expect(maleBtn.style.color).toBe("var(--color-muted)");
    expect(femaleBtn.style.color).toBe("var(--color-cinnabar)");
  });

  it("填了时辰后，时辰名（如「未时」）显示在时间输入前面；勾选「时辰不确定」后隐藏", () => {
    render_();
    const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement;
    expect(screen.queryByText(/时$/)).toBeNull();

    fireEvent.change(timeInput, { target: { value: "14:30" } });
    expect(screen.getByText("未时")).toBeInTheDocument();
    // 时辰名节点先于时间输入出现（对齐设计稿「未时 · [时间]」的顺序）
    const hint = screen.getByText("未时");
    expect(hint.compareDocumentPosition(timeInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const unknownCheckbox = screen.getByRole("checkbox", { name: /不知道出生时辰/ });
    fireEvent.click(unknownCheckbox);
    expect(screen.queryByText("未时")).toBeNull();
    expect(timeInput).toBeDisabled();
  });
});
