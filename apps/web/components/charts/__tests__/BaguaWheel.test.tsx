import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

/** 定位某方位卦字的 <g aria-label> 容器（沿用 EP-fs-07 约定的无障碍标签格式）。 */
function sectorGroup(direction: Direction) {
  const v = fs.personalDirections[direction];
  return screen.getByLabelText(`${DIRECTION_LABEL[direction]}：${v.star}（${v.auspicious ? "吉" : "凶"}）`);
}

/** 取卦字 <text> 元素（组内唯一渲染卦字的文本节点，按内容精确匹配）。 */
function guaText(direction: Direction, gua: string) {
  return within(sectorGroup(direction)).getByText(gua);
}

/**
 * 后天八卦定位（与 core 的 DIRECTION_GUA 一致，但这里**写死字面量**——
 * 测试若从 core  import 期望值，组件里把乾坤对调这类错位就自洽不可见了。
 * 本文件夹具：1990-06-15 男 = 坎1，四吉 = 东南（生气）/东（天医）/南（延年）/北（伏位），
 * 四凶 = 西南（绝命）/东北（五鬼）/西北（六煞）/西（祸害）。
 */
const EXPECTED_GUA: Record<Direction, string> = {
  N: "坎", NE: "艮", E: "震", SE: "巽", S: "离", SW: "坤", W: "兑", NW: "乾",
};
const AUSPICIOUS_DIRS: Direction[] = ["SE", "E", "S", "N"];
const INAUSPICIOUS_DIRS: Direction[] = ["SW", "NE", "NW", "W"];

describe("EP-east-ui-r2 BaguaWheel（S5 细环卦字版）", () => {
  it("前提校验：夹具的四吉四凶分布未漂移（漂移了就该光明正大失败，而不是悄悄失去判别力）", () => {
    expect(fs.personalDirections.SE.star).toBe("生气");
    for (const d of AUSPICIOUS_DIRS) expect(fs.personalDirections[d].auspicious).toBe(true);
    for (const d of INAUSPICIOUS_DIRS) expect(fs.personalDirections[d].auspicious).toBe(false);
  });

  it("八方正位各置一卦字，且卦字-方位对应后天八卦（上=北坎 … 上左=西北乾）", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    for (const d of DIRECTIONS) {
      // 卦字必须落在**自己方位**的组里——乾坤对调（变异②）这里当场变红
      expect(guaText(d, EXPECTED_GUA[d])).toBeInTheDocument();
    }
  });

  it("卦字着色：四凶 muted 400；四吉 ink 600，其中生气方朱砂（变异①：吉凶互换必红）", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    for (const d of INAUSPICIOUS_DIRS) {
      const el = guaText(d, EXPECTED_GUA[d]);
      expect(el.getAttribute("style")).toContain("fill: var(--color-muted)");
      expect(el.getAttribute("style")).toContain("font-weight: 400");
    }
    for (const d of AUSPICIOUS_DIRS) {
      const el = guaText(d, EXPECTED_GUA[d]);
      expect(el.getAttribute("style")).toContain("font-weight: 600");
      if (d === "SE") {
        // 生气方：朱砂（四吉中最吉者单独标出）
        expect(el.getAttribute("style")).toContain("fill: var(--color-cinnabar)");
      } else {
        expect(el.getAttribute("style")).toContain("fill: var(--color-ink)");
      }
    }
  });

  it("星名小字只标四吉（生气朱砂、天医/延年/伏位 muted）；四凶不出星名文字", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    // 四吉：星名落在各自方位的组内
    expect(within(sectorGroup("SE")).getByText("生气").getAttribute("style")).toContain(
      "fill: var(--color-cinnabar)",
    );
    for (const [d, star] of [["E", "天医"], ["S", "延年"], ["N", "伏位"]] as const) {
      expect(within(sectorGroup(d)).getByText(star).getAttribute("style")).toContain("fill: var(--color-muted)");
    }
    // 四凶星名不作为文字出现（吉凶由卦字色/字重承担，不靠小字）
    for (const star of ["绝命", "五鬼", "六煞", "祸害"]) {
      expect(screen.queryByText(star)).toBeNull();
    }
  });

  it("中心显示命卦", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    expect(screen.getByText("坎1")).toBeInTheDocument();
  });

  it("双细环：外环 line-strong、内环 line，无任何扇区填充路径", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    const svg = screen.getByRole("img", { name: "八方吉凶盘" });
    const circles = [...svg.querySelectorAll("circle")];
    expect(circles.some((c) => c.getAttribute("stroke") === "var(--color-line-strong)")).toBe(true);
    expect(circles.some((c) => c.getAttribute("stroke") === "var(--color-line)")).toBe(true);
    // 旧皮肤的扇区 <path> 必须一个不剩
    expect(svg.querySelectorAll("path")).toHaveLength(0);
  });

  it("每个方位组带无障碍标签（可访问名称保持方位名格式）", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    const e = fs.personalDirections.E;
    expect(screen.getByLabelText(`东：${e.star}（${e.auspicious ? "吉" : "凶"}）`)).toBeInTheDocument();
  });
});

/**
 * 交互与剪影：四个 prop（onSelectDirection/selectedDirection/staggerIn/silhouette）
 * 的 API 与语义在 EP-east-ui-r2 中不变，点击目标从扇区变为卦字所在的 <g>。
 */
describe("BaguaWheel — 交互与剪影", () => {
  it("剪影模式：双环结构 + 八个卦字墨色占位块，无卦字、无星名、无方位名（付费内容零泄漏）", () => {
    render(<BaguaWheel silhouette verdicts={null} centerLabel="" />);
    // data-testid 定位（评审 Minor）：querySelector('svg[aria-hidden="true"]') 取第一个匹配，
    // 将来付费墙区域上方加任何装饰性图标都会让断言集体指向错误元素。
    const silhouette = screen.getByTestId("bagua-silhouette");
    // 「看得见形状」：八个占位块，同一中性墨色——吉凶信息不在
    const blocks = silhouette.querySelectorAll("rect");
    expect(blocks).toHaveLength(8);
    expect(new Set([...blocks].map((b) => b.getAttribute("fill"))).size).toBe(1);
    // 「看不清内容」：无卦字、无星名、无方位名
    for (const t of ["乾", "坎", "生气", "绝命", "北", "南"]) {
      expect(silhouette.textContent).not.toContain(t);
    }
    // 旧皮肤的扇区路径也不复存在
    expect(silhouette.querySelectorAll("path")).toHaveLength(0);
    // 整体对辅助技术隐藏（它是装饰性占位）
    expect(silhouette).toHaveAttribute("aria-hidden", "true");
  });

  it("盘即导航：点击与键盘都触发 onSelectDirection；选中卦字变朱砂 + 2px 朱砂短划线（变异③：删选中态必红）", async () => {
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
    // 选中态：卦字（南=离，延年方）变朱砂
    expect(guaText("S", "离").getAttribute("style")).toContain("fill: var(--color-cinnabar)");
    // …且组内出现 2px 朱砂短划线
    const dash = sectorGroup("S").querySelector("line");
    expect(dash).not.toBeNull();
    expect(dash).toHaveAttribute("stroke", "var(--color-cinnabar)");
    expect(dash).toHaveAttribute("stroke-width", "2");
    // 未选中的方位：卦字保持本色（北=坎，伏位方 ink），无短划线
    expect(sectorGroup("N")).toHaveAttribute("aria-pressed", "false");
    expect(guaText("N", "坎").getAttribute("style")).toContain("fill: var(--color-ink)");
    expect(sectorGroup("N").querySelector("line")).toBeNull();
    // 键盘可达（Enter / Space）
    fireEvent.keyDown(sectorGroup("N"), { key: "Enter" });
    expect(onSel).toHaveBeenCalledWith("N");
  });

  it("可交互时 svg 是 role=group 而非 role=img（评审 I2：img 是 children-presentational，会吞掉方位按钮）", () => {
    render(
      <BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" onSelectDirection={() => {}} />,
    );
    // svg 本身的角色：group，aria-label 保留
    expect(screen.getByRole("group", { name: "八方吉凶盘" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    // 方位按钮暴露可访问名称（屏幕阅读器/键盘用户真正依赖的东西）
    const e = fs.personalDirections.E;
    expect(
      screen.getByRole("button", { name: `东：${e.star}（${e.auspicious ? "吉" : "凶"}）` }),
    ).toBeInTheDocument();
    // 可交互卦字组挂 zj-wheel-focus 类——globals.css 的 :focus-visible 描边规则挂在它上面
    expect(sectorGroup("E")).toHaveClass("zj-wheel-focus");
  });

  it("staggerIn：八个卦字的完整错峰 delay 序列（逐方位写死，组内顺序反转/打乱必红）", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" staggerIn />);
    // 期望序列逐方位写死（fixture：1990-06-15 男 = 坎1）——吉组按 rank 1→4：
    // 生气0/天医90/延年180/伏位270；凶组接在吉组后按 rank 1→4：
    // 绝命360/五鬼450/六煞540/祸害630。写死才能抓住「组内顺序反转/打乱」类变异，
    // 此前的「生气=0、8 个互不相同、绝命>生气」三条被任何「生气排第一的分组」共同满足。
    const expectedDelay: Record<Direction, string> = {
      N: "270ms", // 伏位（吉 r4）
      NE: "450ms", // 五鬼（凶 r2）
      E: "90ms", // 天医（吉 r2）
      SE: "0ms", // 生气（吉 r1）
      S: "180ms", // 延年（吉 r3）
      SW: "360ms", // 绝命（凶 r1）
      W: "630ms", // 祸害（凶 r4）
      NW: "540ms", // 六煞（凶 r3）
    };
    for (const d of DIRECTIONS) {
      expect(sectorGroup(d).style.animationDelay).toBe(expectedDelay[d]);
    }
  });

  it("默认（不传 onSelectDirection）方位组不带 button 语义、svg 保持 role=img——向后兼容既有调用方", () => {
    render(<BaguaWheel verdicts={fs.personalDirections} centerLabel="坎1" />);
    expect(sectorGroup("N")).not.toHaveAttribute("role");
    expect(sectorGroup("N")).not.toHaveAttribute("aria-pressed");
    // 非交互态是纯展示图：role=img（此时 children-presentational 无所谓，没有交互后代）。
    // 变异 D（方位交互无条件生效）会让这条变红：svg 变成 group、方位组变成 button。
    expect(screen.getByRole("img", { name: "八方吉凶盘" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
