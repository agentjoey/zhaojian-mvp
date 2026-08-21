import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Group, Cell, Segmented } from "../native";

describe("Group（EP-tg-parity：去卡片框，改细线容器）", () => {
  it("外层容器只有 borderTop 细线，不带卡片边框/阴影/圆角/背景", () => {
    const { container } = render(
      <Group>
        <div>A</div>
        <div>B</div>
      </Group>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.borderTop).toBe("1px solid var(--color-line)");
    expect(root.style.border).toBe("");
    expect(root.style.boxShadow).toBe("");
    expect(root.style.borderRadius).toBe("");
    expect(root.style.background).toBe("");
  });
});

describe("Cell（EP-tg-parity：色块图标改素色字符）", () => {
  it("icon 用 accent 着色的裸字符渲染，无背景色块，字号 18px 宋体", () => {
    render(<Cell icon="运" title="运势日历" accent="var(--color-cinnabar)" />);
    const icon = screen.getByText("运");
    expect(icon.style.color).toBe("var(--color-cinnabar)");
    expect(icon.style.background).toBe("");
    expect(icon.className).toContain("text-[18px]");
    expect(icon.className).toContain("font-serif");
  });

  it("无 accent 时 icon 颜色默认走 --color-cinnabar（与现状一致）", () => {
    render(<Cell icon="盘" title="命盘" />);
    expect(screen.getByText("盘").style.color).toBe("var(--color-cinnabar)");
  });

  it("标题/副标题/chevron 渲染不变（只有 onClick 存在时才出现 chevron）", () => {
    const { rerender } = render(<Cell icon="起" title="起盘建档" subtitle="录入生辰重新排盘" />);
    expect(screen.getByText("起盘建档")).toBeInTheDocument();
    expect(screen.getByText("录入生辰重新排盘")).toBeInTheDocument();
    expect(screen.queryByText("›")).toBeNull();
    rerender(<Cell icon="起" title="起盘建档" onClick={() => {}} />);
    expect(screen.getByText("›")).toBeInTheDocument();
  });
});

describe("Segmented（EP-tg-parity：组模式贴齐 OptionButtons，tab 模式贴齐 fengshui 页现有 tab 行）", () => {
  it("组模式（无 idBase）：激活态朱红描边+朱红字，未激活态灰线描边+墨字，背景透明", () => {
    render(
      <Segmented
        options={[{ value: "a" as const, label: "住宅" }, { value: "b" as const, label: "办公" }]}
        value="a"
        onChange={vi.fn()}
        ariaLabel="用途"
      />,
    );
    const active = screen.getByRole("button", { name: "住宅" });
    const inactive = screen.getByRole("button", { name: "办公" });
    expect(active.style.borderColor).toBe("var(--color-cinnabar)");
    expect(active.style.color).toBe("var(--color-cinnabar)");
    expect(active.style.background).toBe("");
    expect(inactive.style.borderColor).toBe("var(--color-line)");
    expect(inactive.style.color).toBe("var(--color-ink)");
    expect(inactive.style.background).toBe("");
    expect(active).toHaveAttribute("aria-pressed", "true");
    expect(inactive).toHaveAttribute("aria-pressed", "false");
  });

  it("tab 模式（有 idBase）：激活态朱红字+朱红底线，未激活态墨灰字+透明底线，背景透明", () => {
    render(
      <Segmented
        options={[{ value: "a" as const, label: "盘" }, { value: "b" as const, label: "化解" }]}
        value="a"
        onChange={vi.fn()}
        idBase="fs"
        ariaLabel="风水"
      />,
    );
    const active = screen.getByRole("tab", { name: "盘" });
    const inactive = screen.getByRole("tab", { name: "化解" });
    expect(active.style.color).toBe("var(--color-cinnabar)");
    expect(active.style.borderBottom).toBe("2px solid var(--color-cinnabar)");
    expect(active.style.background).toBe("");
    expect(inactive.style.color).toBe("var(--color-ink-2)");
    expect(inactive.style.borderBottom).toBe("2px solid transparent");
  });

  it("ARIA 契约回归网：tablist/tab/aria-selected/aria-controls 不受视觉改动影响", () => {
    render(
      <Segmented
        options={[{ value: "a" as const, label: "盘" }, { value: "b" as const, label: "化解" }]}
        value="a"
        onChange={vi.fn()}
        idBase="fs"
        ariaLabel="风水"
      />,
    );
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("aria-controls", "fs-panel-a");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");
  });
});
