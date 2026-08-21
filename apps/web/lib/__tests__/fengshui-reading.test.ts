import { describe, it, expect, vi, beforeEach } from "vitest";
import { BirthInputSchema } from "@eamvp/core";

// EP-fs-debt：corrections 到 route 边界即丢弃、无日志——degraded 布尔量传到页面触发
// 降级 UI，但被纠正的具体内容完全没地方看，这个失败模式会自我掩盖。这里守
// generateFengshuiSections 在 degraded 时把 corrections 打进日志。
const generateFengshuiReadingMock = vi.fn(async (..._a: unknown[]) => ({
  sections: { situation: "s", personal: "p", actions: "a" },
  corrections: [] as unknown[],
  degraded: false,
}));
vi.mock("@eamvp/llm", () => ({
  generateFengshuiReading: (...a: unknown[]) => generateFengshuiReadingMock(...a),
}));

const { generateFengshuiSections } = await import("../fengshui-reading");

const birth = BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 });

describe("generateFengshuiSections：corrections 日志（EP-fs-debt）", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("degraded=false（无 corrections）→ 不打日志", async () => {
    generateFengshuiReadingMock.mockResolvedValueOnce({
      sections: { situation: "s", personal: "p", actions: "a" },
      corrections: [],
      degraded: false,
    });
    await generateFengshuiSections(birth, "zh");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("degraded=true → console.warn 打出实际的 corrections 内容（不是只打个布尔量）", async () => {
    const corrections = [{ direction: "N", label: "北", wrote: "五鬼", correct: "生气" }];
    generateFengshuiReadingMock.mockResolvedValueOnce({
      sections: { situation: "s", personal: "p", actions: "a" },
      corrections,
      degraded: true,
    });
    const r = await generateFengshuiSections(birth, "zh");
    expect(r.degraded).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("fengshui"), corrections);
  });

  it("返回值仍然只有 sections/degraded——corrections 不流向调用方（不落库/不进响应体，只进日志）", async () => {
    generateFengshuiReadingMock.mockResolvedValueOnce({
      sections: { situation: "s", personal: "p", actions: "a" },
      corrections: [{ direction: "N", label: "北", wrote: "五鬼", correct: "生气" }],
      degraded: true,
    });
    const r = await generateFengshuiSections(birth, "zh");
    expect(Object.keys(r).sort()).toEqual(["degraded", "sections"]);
  });
});
