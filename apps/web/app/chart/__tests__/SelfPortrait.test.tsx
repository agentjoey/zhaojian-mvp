import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { computeUnifiedChart, BirthInputSchema, deriveSelfPortrait, deriveSpirit } from "@eamvp/core";
import { SelfPortrait, PortraitDimensions } from "../SelfPortrait";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

const mockChart = computeUnifiedChart(
  BirthInputSchema.parse({
    date: "1991-03-15",
    time: "14:30",
    gender: "male",
    latitude: 31.23,
    longitude: 121.47,
  }),
);

function Wrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider locale="zh">{children}</I18nProvider>;
}

describe("SelfPortrait", () => {
  it("renders compact card by default", () => {
    render(<SelfPortrait chart={mockChart} />, { wrapper: Wrapper });
    expect(screen.getByText("自我画像 · Self-Portrait")).toBeInTheDocument();
    expect(screen.queryByText("本命之灵的观察")).not.toBeInTheDocument();
  });

  it("renders full page with note and CTA", () => {
    const onTalk = vi.fn();
    render(<SelfPortrait chart={mockChart} fullPage onTalk={onTalk} />, { wrapper: Wrapper });
    expect(screen.getByText("本命之灵的观察")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /和本命之灵聊聊这个/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /和本命之灵聊聊这个/ }));
    expect(onTalk).toHaveBeenCalledTimes(1);
  });

  it("uses spirit.coreTension for hero subtitle and portrait.note for observation card in fullPage mode", () => {
    const { container } = render(<SelfPortrait chart={mockChart} fullPage />, { wrapper: Wrapper });
    const note = deriveSelfPortrait(mockChart, { memoryPresent: false }).note;
    const coreTension = deriveSpirit(mockChart).coreTension;
    const matches = container.querySelectorAll("p");
    const noteOccurrences = Array.from(matches).filter((p) => p.textContent === note).length;
    expect(noteOccurrences).toBe(1);
    if (coreTension) {
      expect(Array.from(matches).some((p) => p.textContent === coreTension)).toBe(true);
    }
  });
});

describe("PortraitDimensions", () => {
  it("renders dimension bars with per-dimension element colors", () => {
    const dimensions = [
      { key: "grounding", label: "沉稳", value: 7 },
      { key: "drive", label: "行动", value: 8 },
      { key: "reflection", label: "内省", value: 5 },
      { key: "connection", label: "联结", value: 6 },
      { key: "openness", label: "开阔", value: 4 },
    ];
    const { container } = render(<PortraitDimensions dimensions={dimensions} />);
    const bars = container.querySelectorAll(".h-full.rounded-full");
    expect(bars.length).toBe(5);
    expect((bars[0] as HTMLElement).style.width).toBe("70%");
    expect((bars[0] as HTMLElement).style.background).toBe("var(--color-earth)");
    expect((bars[1] as HTMLElement).style.background).toBe("var(--color-fire)");
    expect((bars[2] as HTMLElement).style.background).toBe("var(--color-water)");
    expect((bars[3] as HTMLElement).style.background).toBe("var(--color-wood)");
    expect((bars[4] as HTMLElement).style.background).toBe("var(--color-metal)");
  });
});
