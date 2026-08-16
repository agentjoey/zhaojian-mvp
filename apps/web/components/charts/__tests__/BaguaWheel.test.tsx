import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  BirthInputSchema,
  computeUnifiedChart,
  computeFengshui,
  DIRECTIONS,
  DIRECTION_LABEL,
  type Direction,
} from "@eamvp/core";
import { BaguaWheel } from "../BaguaWheel";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const fs = computeFengshui({ birth, chart: computeUnifiedChart(birth) });

/** 定位某方位扇区的 <g aria-label> 容器（复用 EP-fs-07 约定的无障碍标签格式）。 */
function sectorGroup(direction: Direction) {
  const v = fs.personalDirections[direction];
  return screen.getByLabelText(`${DIRECTION_LABEL[direction]}：${v.star}（${v.auspicious ? "吉" : "凶"}）`);
}

describe("EP-fs-07 BaguaWheel", () => {
  it("渲染八个方位中文名", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    for (const label of ["北", "东北", "东", "东南", "南", "西南", "西", "西北"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("渲染八个星名", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    for (const s of ["生气", "天医", "延年", "伏位", "绝命", "五鬼", "六煞", "祸害"]) {
      expect(screen.getByText(s)).toBeInTheDocument();
    }
  });

  it("中心显示命卦", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    expect(screen.getByText("坎1")).toBeInTheDocument();
  });

  it("每个扇区带无障碍标签", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    const e = fs.personalDirections.E;
    expect(screen.getByLabelText(`东：${e.star}（${e.auspicious ? "吉" : "凶"}）`)).toBeInTheDocument();
  });

  // ── 吉凶着色必须真的被验证，而不只是「渲染出来了」──────────────────
  // 八宅恒定四吉四凶各半（rank 1–4）：吉方一色系、凶方另一色系，且两色系互不相同；
  // 同一色系内 4 个 rank 的着色（用 fillOpacity 分级）必须互不相同，深浅才有意义。
  it("吉方与凶方扇区填色使用互不相同的颜色", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    const auspiciousFills = new Set(
      DIRECTIONS.filter((d) => fs.personalDirections[d].auspicious).map(
        (d) => sectorGroup(d).querySelector("path")?.getAttribute("fill"),
      ),
    );
    const inauspiciousFills = new Set(
      DIRECTIONS.filter((d) => !fs.personalDirections[d].auspicious).map(
        (d) => sectorGroup(d).querySelector("path")?.getAttribute("fill"),
      ),
    );
    expect(auspiciousFills.size).toBe(1);
    expect(inauspiciousFills.size).toBe(1);
    for (const fill of auspiciousFills) {
      expect(inauspiciousFills.has(fill)).toBe(false);
    }
  });

  it("同一吉凶组内四个 rank 的填色深浅互不相同", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    const opacityOf = (d: Direction) => sectorGroup(d).querySelector("path")?.getAttribute("fill-opacity");

    const auspiciousDirs = DIRECTIONS.filter((d) => fs.personalDirections[d].auspicious);
    const inauspiciousDirs = DIRECTIONS.filter((d) => !fs.personalDirections[d].auspicious);
    expect(auspiciousDirs).toHaveLength(4);
    expect(inauspiciousDirs).toHaveLength(4);

    expect(new Set(auspiciousDirs.map(opacityOf)).size).toBe(4);
    expect(new Set(inauspiciousDirs.map(opacityOf)).size).toBe(4);

    // rank 越小（越吉/越凶）应当越深，即 opacity 数值越大。
    const byRank = (dirs: Direction[]) =>
      [...dirs].sort((a, b) => fs.personalDirections[a].rank - fs.personalDirections[b].rank).map(opacityOf);
    const auspiciousByRank = byRank(auspiciousDirs).map(Number);
    const inauspiciousByRank = byRank(inauspiciousDirs).map(Number);
    for (let i = 1; i < auspiciousByRank.length; i++) {
      expect(auspiciousByRank[i]).toBeLessThan(auspiciousByRank[i - 1]!);
    }
    for (let i = 1; i < inauspiciousByRank.length; i++) {
      expect(inauspiciousByRank[i]).toBeLessThan(inauspiciousByRank[i - 1]!);
    }
  });
});

/**
 * 2026-08 设计评审后续（feat/fengshui-ui）：星名 pill（P0 对比度）、剪影模式（创意 C）、
 * 可点扇区（创意 A）、错峰入场（创意 B）。
 */
describe("BaguaWheel — 评审后续", () => {
  it("星名垫 paper 底 pill（critique P0：星名压混色扇区底实测 1.48–3.39:1 不可读）", async () => {
    const { render: render2, screen: screen2 } = await import("@testing-library/react");
    render2(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    const star = screen2.getByText("生气");
    const g = star.closest("g")!;
    const pill = g.querySelector("rect");
    expect(pill).not.toBeNull();
    expect(pill).toHaveAttribute("fill", "var(--color-paper)");
    // pill 必须真的垫在星名底下：几何中心与星名位置重合
    const starY = Number(star.getAttribute("y"));
    const pillY = Number(pill!.getAttribute("y")) + Number(pill!.getAttribute("height")) / 2;
    expect(Math.abs(starY - pillY)).toBeLessThanOrEqual(1);
  });

  it("剪影模式：八个扇区结构在，但无方位名、无星名、无吉凶着色（付费内容零泄漏）", () => {
    const { container } = render(<BaguaWheel silhouette verdicts={null} centerLabel="" />);
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(8);
    // 所有扇区同一中性色——吉凶信息不在
    expect(new Set([...paths].map((p) => p.getAttribute("fill"))).size).toBe(1);
    expect(screen.queryByText("生气")).toBeNull();
    expect(screen.queryByText("北")).toBeNull();
    // 整体对辅助技术隐藏（它是装饰性占位）
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("盘即导航：点击与键盘都触发 onSelectDirection，选中扇区 aria-pressed + 描边", async () => {
    const { fireEvent } = await import("@testing-library/react");
    const onSel = vi.fn();
    render(
      <BaguaWheel
        verdicts={fs.personalDirections}
        centerLabel="坎1"
        onSelectDirection={onSel}
        selectedDirection="S"
      />,
    );
    fireEvent.click(sectorGroup("S"));
    expect(onSel).toHaveBeenCalledWith("S");
    expect(sectorGroup("S")).toHaveAttribute("aria-pressed", "true");
    expect(sectorGroup("S").querySelector("path")).toHaveAttribute("stroke", "var(--color-cinnabar)");
    // 未选中的扇区不描边
    expect(sectorGroup("N")).toHaveAttribute("aria-pressed", "false");
    expect(sectorGroup("N").querySelector("path")).toHaveAttribute("stroke", "var(--color-line)");
    // 键盘可达（Enter / Space）
    fireEvent.keyDown(sectorGroup("N"), { key: "Enter" });
    expect(onSel).toHaveBeenCalledWith("N");
  });

  it("staggerIn：最吉扇区（生气）先落（delay 0），其余按 rank 错峰递增", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" staggerIn />);
    const sheng = DIRECTIONS.find((d) => fs.personalDirections[d].star === "生气")!;
    expect(sectorGroup(sheng).style.animationDelay).toBe("0ms");
    // 所有扇区 delay 互不相同（错峰的意义）
    const delays = DIRECTIONS.map((d) => sectorGroup(d).style.animationDelay);
    expect(new Set(delays).size).toBe(8);
    // 凶方最重的（绝命）排在吉方之后
    const jue = DIRECTIONS.find((d) => fs.personalDirections[d].star === "绝命")!;
    expect(parseInt(sectorGroup(jue).style.animationDelay)).toBeGreaterThan(
      parseInt(sectorGroup(sheng).style.animationDelay),
    );
  });

  it("默认（不传 onSelectDirection）扇区不带 button 语义——向后兼容既有调用方", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    expect(sectorGroup("N")).not.toHaveAttribute("role");
    expect(sectorGroup("N")).not.toHaveAttribute("aria-pressed");
  });
});
