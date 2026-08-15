import { adviseObjectText, resolveLlmConfig, isLlmConfigured } from "@eamvp/llm";
import { OBJECT_CATEGORIES, type ObjectAdvice } from "@eamvp/core";
import { localeFromRequest } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 运行期外形校验：`ObjectAdvice`（packages/core/src/fengshui/object-advisor.ts）本身
 * 只是个 TS 类型，没有配套 Zod schema——类型只在编译期把关，挡不住网络另一端真正传来的
 * 任意 JSON。这里只做「像不像一份 ObjectAdvice」的结构检查（不复刻其全部嵌套字段），
 * 因为本路由从不读取 category 以外的字段值做判断分支，只原样转给 adviseObjectText
 * 拼 prompt；category 是唯一被拿来做枚举校验有意义的字段（用于防御性拒绝明显不是
 * adviseObject() 产出的请求体），其余字段只要求「类型对」。
 */
function isObjectAdvice(body: unknown): body is ObjectAdvice {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.category === "string" &&
    (OBJECT_CATEGORIES as readonly string[]).includes(b.category) &&
    typeof b.categoryLabel === "string" &&
    (b.elementOfObject === null || typeof b.elementOfObject === "string") &&
    Array.isArray(b.recommendedDirections) &&
    Array.isArray(b.avoid) &&
    Array.isArray(b.categoryRules) &&
    typeof b.personalFit === "string"
  );
}

/**
 * POST /api/fengshui/object —— 把已算好的 ObjectAdvice 润色成 2–3 句。
 * 建议本身（推荐方位 / 不宜方位 / 品类规则 / 与命主的关系）完全由客户端调用 core 的
 * `adviseObject`（纯函数）确定性算出；本接口只负责说人话，失败不影响页面可用性——
 * 调用方（ObjectAdvisorForm）在非 2xx 或网络错误时静默降级，确定性结果照常展示。
 *
 * 错误路径与 /api/fengshui/reading 对齐：LLM 未配置 503、入参非法 400、生成抛错 500。
 */
export async function POST(req: Request): Promise<Response> {
  const cfg = resolveLlmConfig();
  if (!isLlmConfigured(cfg)) {
    return new Response("LLM 未配置：请在环境变量设置 LLM_API_KEY（默认 provider=minimax, model=MiniMax-M3）。", {
      status: 503,
    });
  }

  const body = await req.json().catch(() => null);
  if (!isObjectAdvice(body)) {
    return new Response("入参非法：请求体应为 adviseObject() 产出的 ObjectAdvice。", { status: 400 });
  }

  try {
    const text = await adviseObjectText(body, { language: localeFromRequest(req) });
    return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch (e) {
    return new Response(`生成失败：${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
