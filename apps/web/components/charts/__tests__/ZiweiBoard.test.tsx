import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ZiweiChart, Palace } from "@eamvp/core";
import { ZiweiBoard } from "../ZiweiBoard";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

/**
 * EP-east-ui-r2：ZiweiBoard 细线格版（去 12 张小卡 / 去中心深墨块）。
 * 核心不变量：
 *  - 十二宫全数渲染、宫名在各宫内精确匹配（防「命宫」撞上中心格「命宫」标签的子串陷阱）；
 *  - 身宫朱砂小字「身」只出现在身宫；
 *  - 中心 2×2 合并格承载命主/身宫/五行局与生年四化，无深墨底；
 *  - 宫位按 branch 落位（非数组顺序）。
 */

function makePalace(name: string, branch: string, overrides: Partial<Palace> = {}): Palace {
  return {
    name,
    branch,
    isBodyPalace: false,
    majorStars: [],
    minorStars: [],
    adjectiveStars: [],
    ...overrides,
  };
}

// 数组顺序故意打乱，验证按 branch 落位而非按数组顺序。
const palaces: Palace[] = [
  makePalace("夫妻", "未"),
  makePalace("命宫", "巳", {
    majorStars: [{ name: "紫微", brightness: "庙" }, { name: "天府" }],
    minorStars: [{ name: "左辅" }],
  }),
  makePalace("兄弟", "午"),
  makePalace("子女", "申"),
  makePalace("财帛", "酉", { majorStars: [{ name: "武曲", mutagen: "忌" }] }),
  makePalace("疾厄", "戌"),
  makePalace("迁移", "亥", { isBodyPalace: true }),
  makePalace("交友", "子"),
  makePalace("官禄", "丑"),
  makePalace("田宅", "寅"),
  makePalace("福德", "卯"),
  makePalace("父母", "辰"),
];

const ziwei: ZiweiChart = {
  school: "zhongzhou",
  soulPalaceBranch: "巳",
  bodyPalaceBranch: "亥",
  fiveElementBureau: "水二局",
  palaces,
  birthMutagens: { 禄: "天同", 权: "天机", 科: "文昌", 忌: "廉贞" },
};

function renderBoard(chart: ZiweiChart = ziwei) {
  return render(
    <I18nProvider locale="zh">
      <ZiweiBoard ziwei={chart} />
    </I18nProvider>,
  );
}

describe("EP-east-ui-r2 ZiweiBoard", () => {
  it("十二宫全数渲染，宫名在各宫内精确匹配", () => {
    renderBoard();
    expect(palaces).toHaveLength(12);
    for (const p of palaces) {
      const cell = screen.getByTestId(`ziwei-palace-${p.branch}`);
      // 精确匹配：getByText 默认全串匹配，「命宫」只在巳宫断言语境内查找，
      // 不会被中心格的「命宫」标签或兄弟宫等干扰。
      expect(within(cell).getByText(p.name)).toBeInTheDocument();
      // 地支小标在各自宫内
      expect(within(cell).getByText(p.branch)).toBeInTheDocument();
    }
  });

  it("宫位按 branch 落位：巳宫在 (1,1)、亥宫在 (4,4)，与数组顺序无关", () => {
    renderBoard();
    const si = screen.getByTestId("ziwei-palace-巳");
    expect(si.style.gridRow).toBe("1");
    expect(si.style.gridColumn).toBe("1");
    const hai = screen.getByTestId("ziwei-palace-亥");
    expect(hai.style.gridRow).toBe("4");
    expect(hai.style.gridColumn).toBe("4");
  });

  it("身宫朱砂小字「身」只出现在身宫，旧 inset 描边已废", () => {
    renderBoard();
    const bodyCell = screen.getByTestId("ziwei-palace-亥");
    const mark = within(bodyCell).getByText("身");
    expect(mark.style.color).toBe("var(--color-cinnabar)");
    // 其余十一宫均无「身」标记（宫名 fixture 均不含「身」字，精确匹配安全）
    for (const p of palaces.filter((x) => !x.isBodyPalace)) {
      expect(within(screen.getByTestId(`ziwei-palace-${p.branch}`)).queryByText("身")).toBeNull();
    }
    // 旧身宫 inset 描边不再出现
    expect(bodyCell.style.boxShadow).toBe("");
  });

  it("中心 2×2 合并格：命主/身宫/五行局 + 生年四化，无深墨锚点块", () => {
    const { container } = renderBoard();
    const center = screen.getByTestId("ziwei-center");
    expect(center.style.gridRow).toBe("2 / span 2");
    expect(center.style.gridColumn).toBe("2 / span 2");
    expect(within(center).getByText("水二局")).toBeInTheDocument();
    expect(within(center).getByText("五行局")).toBeInTheDocument();
    // 生年四化星名完整
    for (const star of ["天同", "天机", "文昌", "廉贞"]) {
      expect(within(center).getByText(star)).toBeInTheDocument();
    }
    // 旧深墨锚点块令牌不再出现
    expect(container.innerHTML).not.toContain("var(--color-panel-strong)");
  });

  it("四化小签 MutagenTag 保留：化忌星所在宫渲染「忌」签", () => {
    renderBoard();
    const you = screen.getByTestId("ziwei-palace-酉");
    expect(within(you).getByText("忌")).toBeInTheDocument();
    expect(within(you).getByText("武曲")).toBeInTheDocument();
    // 无四化的宫不渲染签（兄弟宫星为空）
    expect(within(screen.getByTestId("ziwei-palace-午")).queryByText("忌")).toBeNull();
  });

  it("细线格：容器画上/左边线，宫格补右/下边线，无卡片圆角与 surface 底色", () => {
    renderBoard();
    const grid = screen.getByTestId("ziwei-grid");
    expect(grid.style.borderTop).toBe("1px solid var(--color-line)");
    expect(grid.style.borderLeft).toBe("1px solid var(--color-line)");
    expect(grid.style.gap).toBe("");
    const cell = screen.getByTestId("ziwei-palace-巳");
    expect(cell.style.borderRight).toBe("1px solid var(--color-line)");
    expect(cell.style.borderBottom).toBe("1px solid var(--color-line)");
    expect(cell.style.borderRadius).toBe("");
  });
});
