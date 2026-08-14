import { describe, it, expect } from "vitest";
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
