/**
 * Provider 配置 —— 解读层 provider 无关，支持两种线协议(wire)：
 *  - 'anthropic'  : Anthropic Messages 格式 /v1/messages（MiniMax **Coding/Token Plan** 走这条）
 *  - 'openai'     : OpenAI Chat Completions 格式 /chat/completions（DeepSeek 等）
 * 切换模型 = 改 env（LLM_PROVIDER / LLM_MODEL / LLM_BASE_URL / LLM_API_KEY [/ LLM_WIRE]），无需改代码。
 *
 * 已核实（platform.minimax.io 官方文档）：
 *  - MiniMax-M3 **Coding/Token Plan** = Anthropic 兼容：base `https://api.minimax.io/anthropic`，
 *    端点 `POST /v1/messages`，鉴权 `Authorization: Bearer <sk-cp…>` 或 `x-api-key`，
 *    body 顶层 `system` + `messages` + 必填 `max_tokens`，stream=Anthropic SSE(content_block_delta…message_stop)。
 *    模型 `MiniMax-M3`，1M 上下文。（中国区 base 用 `https://api.minimaxi.com/anthropic`）
 *  - DeepSeek = OpenAI 兼容：base `https://api.deepseek.com/v1`，model `deepseek-chat`/`deepseek-reasoner`。
 */

export type LlmWire = "anthropic" | "openai";
export type LlmProvider = "minimax" | "deepseek" | "openai-compatible" | "anthropic-compatible";

export type LlmConfig = {
  provider: LlmProvider;
  wire: LlmWire;
  baseUrl: string; // anthropic: 含 /anthropic，调用拼 /v1/messages；openai: 含 /v1，拼 /chat/completions
  model: string;
  apiKey: string;
  supportsJsonSchema: boolean;
  /** MiniMax 思考开关（anthropic 线）：'adaptive'=开，'disabled'=关。M3 默认关；M2.x 恒开（设了也无效）。*/
  thinking?: "adaptive" | "disabled";
};

type Preset = Omit<LlmConfig, "apiKey" | "provider">;

const PRESETS: Record<LlmProvider, Preset> = {
  // 默认即 Coding/Token Plan 走法（Anthropic 兼容）
  minimax: { wire: "anthropic", baseUrl: "https://api.minimax.io/anthropic", model: "MiniMax-M3", supportsJsonSchema: false },
  deepseek: { wire: "openai", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", supportsJsonSchema: true },
  "openai-compatible": { wire: "openai", baseUrl: "", model: "", supportsJsonSchema: false },
  "anthropic-compatible": { wire: "anthropic", baseUrl: "", model: "", supportsJsonSchema: false },
};

export function resolveLlmConfig(env: Record<string, string | undefined> = process.env): LlmConfig {
  const provider = (env.LLM_PROVIDER as LlmProvider) ?? "minimax";
  const preset = PRESETS[provider] ?? PRESETS["openai-compatible"];
  const wire = (env.LLM_WIRE as LlmWire) ?? preset.wire;
  // anthropic wire 兼容读取生态既有的 ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN
  const baseUrl =
    env.LLM_BASE_URL ?? (wire === "anthropic" ? env.ANTHROPIC_BASE_URL : undefined) ?? preset.baseUrl;
  const apiKey = env.LLM_API_KEY ?? env.ANTHROPIC_AUTH_TOKEN ?? env.ANTHROPIC_API_KEY ?? "";
  const thinking = env.LLM_THINKING === "adaptive" || env.LLM_THINKING === "disabled" ? env.LLM_THINKING : undefined;
  return { provider, wire, baseUrl, model: env.LLM_MODEL ?? preset.model, apiKey, supportsJsonSchema: preset.supportsJsonSchema, thinking };
}

export function isLlmConfigured(cfg: LlmConfig): boolean {
  return Boolean(cfg.apiKey && cfg.baseUrl && cfg.model);
}
