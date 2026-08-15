import { z } from "zod";
import { isLlmConfigured, resolveLlmConfig } from "@eamvp/llm";
import { readSession, TG_COOKIE } from "@/lib/tg/session";
import { supabaseAdmin } from "@/lib/tg/admin";
import { localeFromRequest } from "@/lib/i18n/server";
import { MAX_COHABITANTS } from "@/lib/fengshui-limits";
import {
  ReadingRequestSchema,
  generateFengshuiSections,
  isFengshuiEntitledForUid,
  wantsLayer1,
} from "@/lib/fengshui-reading";
import type { Dwelling } from "@/lib/dwellings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TG 风水中介端点（EP-fs-tg）。风水的居所 CRUD 与报告持久化在 TG 会话下原本走不通
 * ——`lib/dwellings.ts` / `lib/fengshui-report.ts` 直连 Supabase 匿名客户端，TG 用户
 * 的身份链路是 `initData → zj_tg cookie session → service_role 后端中介`（spec §1/§2）。
 * 本端点就是那个中介：从 TG session 解 uid，用 service_role 客户端读写
 * dwellings / fengshui_reports，**所有查询都显式带 `.eq("uid", s.uid)`**——
 * service_role 绕过 RLS，归属校验只能在这里做，客户端传来的 uid/档案 id/居所 id
 * 一律不可信。
 *
 * 鉴权/session 手法照抄 `app/api/fengshui/reading/route.ts` 的 `resolveUserId`
 * （直接读 `req.headers` 的 cookie，而非 `next/headers` 的 `cookies()`）——后者依赖
 * Next 请求分发的 AsyncLocalStorage 上下文，本路由的测试直接 import 处理函数、拿
 * 手搓 Request 调用，没有那层上下文（见 reading/route.ts 的注释，此处同理）。
 *
 * 错误码与既有 api/tg/* 一致：未登录 401、入参非法 400、LLM 未配置 503、
 * 生成失败 500、会员闸门 402。
 *
 * 形态：单 route。GET 读（居所列表 / 按指纹读报告），POST 带 `action` 写
 * （居所增删改、报告保存、报告生成）。报告生成的校验/闸门/生成逻辑与 web 路由
 * 共用 `lib/fengshui-reading.ts` 一份实现，不复制。
 */

function sess(req: Request): { uid: string; tgId: number } | null {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const token = cookieHeader
    .split("; ")
    .find((c) => c.startsWith(`${TG_COOKIE}=`))
    ?.slice(TG_COOKIE.length + 1);
  return readSession(token);
}

/** DB 行 → 领域对象。与 lib/dwellings.ts 的 toDwelling 同一套收敛规则（脏值归并）。 */
type DwellingRow = {
  id: string; name: string; kind: string; tenancy: string;
  facing: string | null; member_profile_ids: string[] | null;
};
const toDwelling = (r: DwellingRow): Dwelling => ({
  id: r.id, name: r.name,
  kind: r.kind === "office" ? "office" : "home",
  tenancy: r.tenancy === "own" ? "own" : "rent",
  facing: (r.facing as Dwelling["facing"]) ?? null,
  memberProfileIds: r.member_profile_ids ?? [],
});

const DirectionSchema = z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);

const DwellingInputSchema = z.object({
  name: z.string().trim().min(1).max(50),
  kind: z.enum(["home", "office"]),
  tenancy: z.enum(["rent", "own"]),
  facing: DirectionSchema.nullable(),
  memberProfileIds: z.array(z.string()).max(MAX_COHABITANTS),
});

const ReportSaveSchema = z.object({
  fingerprint: z.string().min(1),
  profileId: z.string().min(1),
  dwellingId: z.string().nullable(),
  layer: z.union([z.literal(0), z.literal(1)]),
  locale: z.enum(["zh", "en"]),
  sections: z.object({
    situation: z.string(),
    youAndSpace: z.string(),
    actions: z.string(),
  }),
});

/** 客户端传来的档案 id 集合里，真正属于当前用户的那些（归属校验的唯一事实源）。 */
async function ownedProfileIds(uid: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabaseAdmin()
    .from("profiles").select("id").eq("user_id", uid).in("id", ids);
  if (error) throw error;
  return (data ?? []).map((r) => (r as { id: string }).id);
}

async function ownsProfile(uid: string, profileId: string): Promise<boolean> {
  return (await ownedProfileIds(uid, [profileId])).length === 1;
}

/**
 * GET /api/tg/fengshui
 *   无参数           → `{ dwellings }`（当前用户的全部居所，按创建时间升序）
 *   ?fingerprint=xx  → `{ sections }`（命中缓存的报告分节；未命中为 null）
 */
export async function GET(req: Request): Promise<Response> {
  const s = sess(req);
  if (!s) return new Response("未登录", { status: 401 });

  const fingerprint = new URL(req.url).searchParams.get("fingerprint");
  if (fingerprint) {
    const { data, error } = await supabaseAdmin()
      .from("fengshui_reports").select("sections")
      .eq("uid", s.uid).eq("input_fingerprint", fingerprint).maybeSingle();
    if (error) return new Response(`报告读取失败：${error.message}`, { status: 500 });
    return Response.json({ sections: data?.sections ?? null });
  }

  const { data, error } = await supabaseAdmin()
    .from("dwellings").select("*").eq("uid", s.uid).order("created_at", { ascending: true });
  if (error) return new Response(`居所读取失败：${error.message}`, { status: 500 });
  return Response.json({ dwellings: ((data ?? []) as DwellingRow[]).map(toDwelling) });
}

/**
 * POST /api/tg/fengshui —— body 带 `action`：
 *   dwellings.create  { dwelling: {...} }            → `{ dwelling }`
 *   dwellings.update  { id, patch: {...} }           → `{ ok: true }`（不存在/非本人 → 400）
 *   dwellings.delete  { id }                         → `{ ok: true }`
 *   report.save       { fingerprint, profileId, … }  → `{ ok: true }`（档案/居所非本人 → 400）
 *   reading           { …BirthInput, dwelling?, cohabitants? } → `{ sections, degraded }`
 *                     （与 /api/fengshui/reading 同一契约：503/400/402/500）
 */
export async function POST(req: Request): Promise<Response> {
  const s = sess(req);
  if (!s) return new Response("未登录", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";
  const sb = supabaseAdmin();

  switch (action) {
    case "dwellings.create": {
      const parsed = DwellingInputSchema.safeParse(body?.dwelling);
      if (!parsed.success) {
        return new Response(parsed.error.issues.map((i) => i.message).join("; "), { status: 400 });
      }
      // 同住人档案 id 归属校验：客户端传什么都不信，只接受确属当前用户的档案。
      const owned = await ownedProfileIds(s.uid, parsed.data.memberProfileIds);
      if (owned.length !== parsed.data.memberProfileIds.length) {
        return new Response("同住人档案不存在或不属于当前用户", { status: 400 });
      }
      const d = parsed.data;
      const { data, error } = await sb.from("dwellings").insert({
        uid: s.uid, name: d.name, kind: d.kind, tenancy: d.tenancy,
        facing: d.facing, member_profile_ids: d.memberProfileIds,
      }).select("*").single();
      if (error) return new Response(`居所保存失败：${error.message}`, { status: 500 });
      return Response.json({ dwelling: toDwelling(data as DwellingRow) });
    }

    case "dwellings.update": {
      const id = typeof body?.id === "string" ? body.id : "";
      if (!id) return new Response("缺少 id", { status: 400 });
      const parsed = DwellingInputSchema.partial().safeParse(body?.patch ?? {});
      if (!parsed.success) {
        return new Response(parsed.error.issues.map((i) => i.message).join("; "), { status: 400 });
      }
      const p = parsed.data;
      if (p.memberProfileIds) {
        const owned = await ownedProfileIds(s.uid, p.memberProfileIds);
        if (owned.length !== p.memberProfileIds.length) {
          return new Response("同住人档案不存在或不属于当前用户", { status: 400 });
        }
      }
      const { data, error } = await sb.from("dwellings").update({
        ...(p.name !== undefined && { name: p.name }),
        ...(p.kind !== undefined && { kind: p.kind }),
        ...(p.tenancy !== undefined && { tenancy: p.tenancy }),
        ...(p.facing !== undefined && { facing: p.facing }),
        ...(p.memberProfileIds !== undefined && { member_profile_ids: p.memberProfileIds }),
        updated_at: new Date().toISOString(),
      }).eq("id", id).eq("uid", s.uid).select("id");
      if (error) return new Response(`居所更新失败：${error.message}`, { status: 500 });
      if (!data || data.length === 0) return new Response("居所不存在或不属于当前用户", { status: 400 });
      return Response.json({ ok: true });
    }

    case "dwellings.delete": {
      const id = typeof body?.id === "string" ? body.id : "";
      if (!id) return new Response("缺少 id", { status: 400 });
      const { error } = await sb.from("dwellings").delete().eq("id", id).eq("uid", s.uid);
      if (error) return new Response(`居所删除失败：${error.message}`, { status: 500 });
      return Response.json({ ok: true });
    }

    case "report.save": {
      const parsed = ReportSaveSchema.safeParse(body);
      if (!parsed.success) {
        return new Response(parsed.error.issues.map((i) => i.message).join("; "), { status: 400 });
      }
      const r = parsed.data;
      if (!(await ownsProfile(s.uid, r.profileId))) {
        return new Response("档案不存在或不属于当前用户", { status: 400 });
      }
      if (r.dwellingId) {
        const { data: owned, error: e1 } = await sb
          .from("dwellings").select("id").eq("id", r.dwellingId).eq("uid", s.uid);
        if (e1) return new Response(`居所校验失败：${e1.message}`, { status: 500 });
        if (!owned || owned.length === 0) return new Response("居所不存在或不属于当前用户", { status: 400 });
      }
      const { error } = await sb.from("fengshui_reports").upsert({
        uid: s.uid, input_fingerprint: r.fingerprint, profile_id: r.profileId,
        dwelling_id: r.dwellingId, layer: r.layer, locale: r.locale, sections: r.sections,
      }, { onConflict: "uid,input_fingerprint" });
      if (error) return new Response(`报告保存失败：${error.message}`, { status: 500 });
      return Response.json({ ok: true });
    }

    case "reading": {
      // 与 /api/fengshui/reading 同一契约与顺序：先 503（LLM 未配置），再 400（入参），
      // 再 402（Layer 1 会员闸门），最后生成（500）。uid 来自 TG session，不信任 body。
      const cfg = resolveLlmConfig();
      if (!isLlmConfigured(cfg)) {
        return new Response("LLM 未配置：请在环境变量设置 LLM_API_KEY（默认 provider=minimax, model=MiniMax-M3）。", {
          status: 503,
        });
      }
      const { action: _drop, ...rest } = body as Record<string, unknown>;
      const parsed = ReadingRequestSchema.safeParse(rest);
      if (!parsed.success) {
        return new Response(parsed.error.issues.map((i) => i.message).join("; "), { status: 400 });
      }
      if (wantsLayer1(parsed.data) && !(await isFengshuiEntitledForUid(s.uid))) {
        return new Response(JSON.stringify({ error: "paywall" }), {
          status: 402,
          headers: { "content-type": "application/json" },
        });
      }
      try {
        const r = await generateFengshuiSections(parsed.data, localeFromRequest(req));
        return Response.json({ sections: r.sections, degraded: r.degraded });
      } catch (e) {
        return new Response(`风水报告生成失败：${e instanceof Error ? e.message : String(e)}`, { status: 500 });
      }
    }

    default:
      return new Response(`未知 action：${action || "(缺失)"}`, { status: 400 });
  }
}
