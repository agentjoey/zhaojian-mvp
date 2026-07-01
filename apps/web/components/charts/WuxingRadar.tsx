"use client";

import { WUXING_LABEL_TO_KEY } from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";

// 五行雷达：固定五轴，从正上方开始顺时针 —— 木(上)、火、土、金、水。
// 第 i 轴相对竖直方向顺时针 i*72°，屏幕角度 = -90 + i*72。
const AXES: { labelKey: string; key: string; countKey: string }[] = [
  { labelKey: "chart.elementWood", key: WUXING_LABEL_TO_KEY["木"], countKey: "木" }, // wood
  { labelKey: "chart.elementFire", key: WUXING_LABEL_TO_KEY["火"], countKey: "火" }, // fire
  { labelKey: "chart.elementEarth", key: WUXING_LABEL_TO_KEY["土"], countKey: "土" }, // earth
  { labelKey: "chart.elementMetal", key: WUXING_LABEL_TO_KEY["金"], countKey: "金" }, // metal
  { labelKey: "chart.elementWater", key: WUXING_LABEL_TO_KEY["水"], countKey: "水" }, // water
];

const CX = 160;
const CY = 160;
const R = 120;

// 第 i 轴在半径 radius 处的屏幕坐标。
function vertex(i: number, radius: number): { x: number; y: number } {
  const rad = ((-90 + i * 72) * Math.PI) / 180;
  return {
    x: CX + radius * Math.cos(rad),
    y: CY + radius * Math.sin(rad),
  };
}

function pentagonPoints(radius: number): string {
  return AXES.map((_, i) => {
    const { x, y } = vertex(i, radius);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

export function WuxingRadar({ counts }: { counts: Record<string, number> }) {
  const t = useT();

  // 取值，保证五轴都有数（缺失按 0）。
  const values = AXES.map(({ countKey }) => counts[countKey] ?? 0);

  // 比例尺：至少为 3，避免数据撑满或被裁切。
  const maxScale = Math.max(3, ...Object.values(counts));

  // 数据多边形顶点。
  const dataVertices = AXES.map((_, i) => {
    const radius = (values[i] / maxScale) * R;
    return vertex(i, radius);
  });
  const dataPoints = dataVertices
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");

  // 找出计数最低的元素，给出温和的喜用提示。
  const minCount = Math.min(...values);
  const lowest = AXES.filter((_, i) => values[i] === minCount).map((a) => t(a.labelKey));
  const lowestStr = lowest.join(t("common.listSeparator"));
  const caption =
    minCount === 0
      ? t("chart.missingCaption", { elements: lowestStr })
      : t("chart.weakCaption", { elements: lowestStr });

  return (
    <div className="w-full" style={{ maxWidth: 320 }}>
      <svg
        viewBox="0 0 320 320"
        width="100%"
        role="img"
        aria-label={t("chart.radarAria")}
        style={{ display: "block" }}
      >
        {/* 三层同心五边形网格：1/3、2/3、3/3 */}
        {[1 / 3, 2 / 3, 1].map((frac) => (
          <polygon
            key={frac}
            points={pentagonPoints(R * frac)}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth={1}
          />
        ))}

        {/* 五条轴线 */}
        {AXES.map((_, i) => {
          const { x, y } = vertex(i, R);
          return (
            <line
              key={`spoke-${i}`}
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              stroke="var(--color-line)"
              strokeWidth={1}
            />
          );
        })}

        {/* 数据多边形 */}
        <polygon
          points={dataPoints}
          fill="rgba(203,70,54,.12)"
          stroke="var(--color-cinnabar)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {/* 数据顶点小圆点，按元素着色 */}
        {dataVertices.map((p, i) => (
          <circle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            r={3}
            fill={`var(--color-${AXES[i].key})`}
          />
        ))}

        {/* 轴标签：顶点外侧 R+18，元素字 + 下方小号计数 */}
        {AXES.map((axis, i) => {
          const { x, y } = vertex(i, R + 18);
          return (
            <g key={`label-${i}`}>
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={15}
                fill={`var(--color-${axis.key})`}
              >
                {t(axis.labelKey)}
              </text>
              <text
                x={x}
                y={y + 14}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                className="font-latin"
                fill="var(--color-muted)"
              >
                {values[i]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* 提示文案 */}
      <p className="text-muted mt-2 text-[12px]">{caption}</p>
    </div>
  );
}
