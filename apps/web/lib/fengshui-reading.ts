import { z } from "zod";
import { computeUnifiedChart, computeFengshui, BirthInputSchema } from "@eamvp/core";
import { generateFengshuiReading } from "@eamvp/llm";
import { getEntitlement, isMember } from "@/lib/entitlements";
// 同住人上限的**单一事实源**（最终评审 I1），与 DwellingForm 的选择器同源。
import { MAX_COHABITANTS } from "@/lib/fengshui-limits";
import type { Locale } from "@/lib/i18n/locale";
import type { FengshuiSections } from "@/lib/fengshui-report";

/**
 * 风水报告生成的**服务端共享逻辑**（EP-fs-tg）。原本是
 * `app/api/fengshui/reading/route.ts` 的私有实现；TG 中介端点
 *（`app/api/tg/fengshui/route.ts` 的 `reading` action）需要走**同一条**校验/闸门/
 * 生成路径，遂抽到这里——两份各自实现必然在日后改一处漏改另一处时悄悄分叉
 * （本项目在闸门规则上立下的规矩：同一条规则只写一份）。
 *
 * 本模块只被服务端路由 import，不进浏览器模块图（依赖 entitlements → service-role）。
 */

/**
 * 居所/合看成员校验（Task 9，EP-fs-15）。用 `.extend()` 而不是套一层
 * `{ birth, dwelling, cohabitants }`——请求体本体仍然就是 `BirthInput`，
 * `dwelling`/`cohabitants` 是两个新增的可选字段。这样波1 已有的调用方式
 * （body 就是 BirthInput 本身）在两个新字段缺省时保持逐字节兼容。
 *
 * 方位枚举直接字面量列出（而非从 core 的 `DIRECTIONS` 常量派生）：`DIRECTIONS`
 * 是 `as const` 的只读元组，`z.enum` 的类型签名要求可写元组，两者对不上时容易
 * 引出与本路由无关的类型体操；核心真值仍是 core 的 `DIRECTIONS`，这里只是照抄
 * 其字面量集合做输入校验，不是重新定义方位。
 */
const DirectionSchema = z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);

const DwellingBodySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["home", "office"]),
  tenancy: z.enum(["rent", "own"]),
  facing: DirectionSchema,
});

const CohabitantBodySchema = z.object({
  profileId: z.string(),
  name: z.string(),
  birth: BirthInputSchema,
});

export const ReadingRequestSchema = BirthInputSchema.extend({
  dwelling: DwellingBodySchema.optional(),
  cohabitants: z.array(CohabitantBodySchema).max(MAX_COHABITANTS).optional(),
});

export type ReadingRequest = z.infer<typeof ReadingRequestSchema>;

/**
 * 会员闸门（Task 10，EP-fs-17）。spec §11 边界：Layer 0（本命方位、物件顾问弱版）
 * 永远免费；住宅实盘（dwelling）+ 分级化解、多住客合看（cohabitants）、多套居所是
 * 会员功能。`BILLING_ENABLED` 关闭时（pre-prod 默认态）永远放行——与
 * `lib/entitlements.ts` 的 `consumeLlm()` 同一手法，避免闸门判断在两处各写一份、
 * 其中一处忘了同步。未能解析出 uid（未登录/身份不明）与非会员同等对待：都视为不满足。
 *
 * 入参是**已解析出的 uid** 而不是 Request：web 路由从 TG cookie / Bearer 解 uid，
 * TG 中介路由从 TG session 解 uid——两条入口的 uid 来源不同，闸门规则只有一条。
 */
export async function isFengshuiEntitledForUid(uid: string | undefined): Promise<boolean> {
  if (process.env.BILLING_ENABLED !== "1") return true;
  if (!uid) return false;
  return isMember(await getEntitlement(uid));
}

/** 请求体里是否含 Layer 1（会员）内容——web 与 TG 两条路由共用同一个判据。 */
export function wantsLayer1(r: ReadingRequest): boolean {
  return !!r.dwelling || !!(r.cohabitants && r.cohabitants.length > 0);
}

/**
 * 确定性排盘 + 风水派生 → 三分节报告。
 * 同住人只传各自的 `birth`（不传 `chart`）——服务端用 `computeUnifiedChart` 现算，
 * 与主档案一致，避免信任客户端传来的、可能与当前引擎版本不一致的冻结命盘 JSON。
 */
export async function generateFengshuiSections(
  parsed: ReadingRequest,
  language: Locale,
): Promise<{ sections: FengshuiSections; degraded: boolean }> {
  const { dwelling, cohabitants, ...birth } = parsed;
  const chart = computeUnifiedChart(birth);
  const fs = computeFengshui({
    birth,
    chart,
    dwelling,
    cohabitants: cohabitants?.map((c) => ({
      profileId: c.profileId, name: c.name, birth: c.birth, chart: computeUnifiedChart(c.birth),
    })),
  });
  const r = await generateFengshuiReading(fs, { language, nickname: birth.nickname });
  // EP-fs-debt：corrections 此前到这里就丢了、连日志都没有——`degraded` 布尔量传到
  // 页面触发降级 UI，但被纠正的具体内容（模型把哪个方位说成了哪颗星、正确是哪颗）
  // 完全没地方看，这个失败模式会自我掩盖。两条路由（web/TG）共用这个函数，日志加
  // 这一处即可覆盖两边。
  if (r.degraded) {
    console.warn("[fengshui] direction corrections applied:", r.corrections);
  }
  return { sections: r.sections, degraded: r.degraded };
}
