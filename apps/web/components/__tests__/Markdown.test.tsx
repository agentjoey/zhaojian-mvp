import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Markdown } from "../Markdown";

/**
 * Markdown.tsx 此前没有测试。Task 14 复审「顺带修」指出一个既有缺陷：`inline()`
 * 按“该次调用”的局部下标生成 key（每次都从 0 计数），而段落分支把 `inline()`
 * flatMap 到块内每一行——同一段落块只要有 ≥2 行、且每行都不含 `**加粗**`，
 * flatMap 拼出来的兄弟节点里就会出现重复的 `key={0}`。这不是假设性场景：
 * 「境」页的三分节叙述（如 "形势\n甲" 这种多行段落）每次渲染都会真实触发。
 *
 * React 的重复 key 警告通过 `console.error` 打出（不是 `console.warn`），且在
 * DOM 结构本身而非「值是否恰好还凑巧对」这种脆弱信号上更可靠——所以下面直接
 * spy `console.error` 断言「不产生这条警告」，而不是间接断言渲染出的文本顺序
 * （重复 key 是否导致可见的文本错乱，取决于 React reconciler 的内部实现细节，
 * 不是这个 bug 该被断言的稳定层面）。
 */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Markdown", () => {
  it("同一段落块内多行纯文本（均不含加粗）不产生重复 key 警告", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<Markdown text={"第一行\n第二行\n第三行"} />);

    const duplicateKeyWarning = errorSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === "string" && /same key/i.test(arg)),
    );
    expect(duplicateKeyWarning).toBe(false);
  });

  it("正常渲染多行段落与加粗片段", () => {
    const { getByText } = render(<Markdown text={"第一行\n**重点**在第二行"} />);
    expect(getByText("第一行")).toBeInTheDocument();
    expect(getByText("重点")).toBeInTheDocument();
  });

  it("无序列表、有序列表、引用块仍按原样渲染（回归：本次改动不应影响这些分支）", () => {
    const { getByText } = render(
      <Markdown text={"- 条目一\n- 条目二\n\n1. 步骤一\n2. 步骤二\n\n> 引用内容"} />,
    );
    expect(getByText("条目一")).toBeInTheDocument();
    expect(getByText("条目二")).toBeInTheDocument();
    expect(getByText("步骤一")).toBeInTheDocument();
    expect(getByText("步骤二")).toBeInTheDocument();
    expect(getByText("引用内容")).toBeInTheDocument();
  });
});
