import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuickPrompts } from "../QuickPrompts";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider locale="zh">{children}</I18nProvider>;
}

describe("QuickPrompts", () => {
  it("renders prompts and calls onSelect when clicked", () => {
    const onSelect = vi.fn();
    render(<QuickPrompts onSelect={onSelect} />, { wrapper: Wrapper });
    const first = screen.getByText("事业方向");
    expect(first).toBeInTheDocument();
    fireEvent.click(first);
    expect(onSelect).toHaveBeenCalledWith("事业方向");
  });
});
