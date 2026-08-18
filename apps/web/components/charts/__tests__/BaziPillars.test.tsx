import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { BaziChart } from "@eamvp/core";
import { BaziPillars } from "../BaziPillars";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

/**
 * EP-east-ui-r2：BaziPillars 文字四柱版（去卡片 / 去彩色圆徽 / 去日柱深墨块）。
 * 核心不变量：
 *  - 四柱干支一字不丢，十神/藏干完整保留；
 *  - 朱砂「主」方章有且仅有一枚，且落在日柱列；
 *  - 五行计数 chip 为 1px line 细边、无底色填充。
 */

const bazi: BaziChart = {
  pillars: {
    year: { stem: "庚", branch: "午", element: "金", tenGodStem: "正官", hiddenStems: ["丁", "己"] },
    month: { stem: "壬", branch: "申", element: "水", tenGodStem: "食神", hiddenStems: ["庚", "壬", "戊"] },
    day: { stem: "丙", branch: "戌", element: "火", hiddenStems: ["戊", "辛", "丁"] },
    hour: { stem: "己", branch: "丑", element: "土", tenGodStem: "伤官", hiddenStems: ["己", "癸", "辛"] },
  },
  dayMaster: "丙",
  dayMasterElement: "火",
  dayMasterStrength: "balanced",
  fiveElementCounts: { 木: 0, 火: 2, 土: 3, 金: 2, 水: 1 },
  luckPillars: [],
};

function renderPillars(chart: BaziChart = bazi) {
  return render(
    <I18nProvider locale="zh">
      <BaziPillars bazi={chart} />
    </I18nProvider>,
  );
}

describe("EP-east-ui-r2 BaziPillars", () => {
  it("四柱干支全部渲染：每列天干地支一字不丢", () => {
    renderPillars();
    const cols: [string, string, string][] = [
      ["year", "庚", "午"],
      ["month", "壬", "申"],
      ["day", "丙", "戌"],
      ["hour", "己", "丑"],
    ];
    for (const [key, stem, branch] of cols) {
      const col = screen.getByTestId(`pillar-col-${key}`);
      // 干支各以独立大字节点出现（宋体 + 30px 以上字号）
      const stemEl = within(col).getByText(stem);
      const branchEl = within(col).getByText(branch);
      expect(stemEl.style.fontFamily).toContain("var(--font-serif)");
      expect(branchEl.style.fontFamily).toContain("var(--font-serif)");
    }
  });

  it("十神与藏干完整保留（日柱十神为「日主」）", () => {
    renderPillars();
    expect(within(screen.getByTestId("pillar-col-year")).getByText("正官")).toBeInTheDocument();
    expect(within(screen.getByTestId("pillar-col-month")).getByText("食神")).toBeInTheDocument();
    expect(within(screen.getByTestId("pillar-col-hour")).getByText("伤官")).toBeInTheDocument();
    // 日柱列十神位显示「日主」
    expect(within(screen.getByTestId("pillar-col-day")).getByText("日主")).toBeInTheDocument();
    // 藏干逐柱精确匹配
    expect(within(screen.getByTestId("pillar-col-hour")).getByText("己 癸 辛")).toBeInTheDocument();
    expect(within(screen.getByTestId("pillar-col-day")).getByText("戊 辛 丁")).toBeInTheDocument();
  });

  it("朱砂「主」方章有且仅有一枚，且只出现在日柱列", () => {
    renderPillars();
    const seals = screen.getAllByTestId("bazi-day-seal");
    expect(seals).toHaveLength(1);
    // 位于日柱列内
    const dayCol = screen.getByTestId("pillar-col-day");
    expect(dayCol.contains(seals[0]!)).toBe(true);
    // 其余三列均无方章
    for (const key of ["year", "month", "hour"]) {
      expect(within(screen.getByTestId(`pillar-col-${key}`)).queryByTestId("bazi-day-seal")).toBeNull();
    }
    // 方章样式：朱砂底、纸色字、印章圆角
    expect(seals[0]).toHaveStyle({
      background: "var(--color-cinnabar)",
      color: "var(--color-paper)",
      borderRadius: "var(--radius-seal)",
    });
  });

  it("整组四柱上下各一条 1px var(--color-line) 细线；不再有卡片容器", () => {
    renderPillars();
    const grid = screen.getByTestId("bazi-pillars-grid");
    expect(grid.style.borderTop).toBe("1px solid var(--color-line)");
    expect(grid.style.borderBottom).toBe("1px solid var(--color-line)");
    // 旧深墨锚点块与旧圆徽底色的令牌不再出现
    const { container } = renderPillars();
    expect(container.innerHTML).not.toContain("var(--color-panel-strong)");
  });

  it("五行计数 chip：细边（1px line）、无底色填充、计数正确", () => {
    renderPillars();
    const earth = screen.getByTestId("wuxing-chip-earth");
    expect(earth.style.border).toBe("1px solid var(--color-line)");
    expect(earth.style.background).toBe("transparent");
    expect(within(earth).getByText("土")).toBeInTheDocument();
    expect(within(earth).getByText("3")).toBeInTheDocument();
    // 五个 chip 全数渲染
    for (const el of ["wood", "fire", "earth", "metal", "water"]) {
      expect(screen.getByTestId(`wuxing-chip-${el}`)).toBeInTheDocument();
    }
  });
});
