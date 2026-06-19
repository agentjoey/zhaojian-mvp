import type { LlmConfig } from "./provider";
import { withRetry, isRetryableError } from "./retry";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatOptions = { temperature?: number; maxTokens?: number; signal?: AbortSignal };

const ANTHROPIC_VERSION = "2023-06-01";

function endpoint(cfg: LlmConfig): string {
  const base = cfg.baseUrl.replace(/\/$/, "");
  return cfg.wire === "anthropic" ? `${base}/v1/messages` : `${base}/chat/completions`;
}

function headers(cfg: LlmConfig): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` };
  if (cfg.wire === "anthropic") h["anthropic-version"] = ANTHROPIC_VERSION;
  return h;
}

/** Anthropic 把 system 提到顶层，messages 仅 user/assistant。 */
function splitForAnthropic(messages: ChatMessage[]): { system: string; messages: { role: "user" | "assistant"; content: string }[] } {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  return { system, messages: rest };
}

function body(cfg: LlmConfig, messages: ChatMessage[], opts: ChatOptions, stream: boolean): string {
  const temperature = opts.temperature ?? 0.6;
  const max_tokens = opts.maxTokens ?? 4096;
  if (cfg.wire === "anthropic") {
    const { system, messages: msgs } = splitForAnthropic(messages);
    const body: Record<string, unknown> = { model: cfg.model, system, messages: msgs, max_tokens, temperature, stream };
    if (cfg.thinking) body.thinking = { type: cfg.thinking };
    return JSON.stringify(body);
  }
  return JSON.stringify({ model: cfg.model, messages, temperature, max_tokens, stream });
}

const TIMEOUT_MS = 60_000;

async function post(cfg: LlmConfig, messages: ChatMessage[], opts: ChatOptions, stream: boolean): Promise<Response> {
  const payload = body(cfg, messages, opts, stream);
  return withRetry(
    async () => {
      // 超时仅对非流式生效（流式 abort 会中断 body 读取）
      const signals = [opts.signal, stream ? undefined : AbortSignal.timeout(TIMEOUT_MS)].filter(Boolean) as AbortSignal[];
      const signal = signals.length ? AbortSignal.any(signals) : undefined;
      const res = await fetch(endpoint(cfg), { method: "POST", headers: headers(cfg), signal, body: payload });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw Object.assign(new Error(`LLM ${cfg.provider}/${cfg.wire} HTTP ${res.status}: ${text}`), { status: res.status });
      }
      return res;
    },
    // 调用方主动取消则不重试；否则按 5xx/429/网络错误重试
    { retryable: (e) => !opts.signal?.aborted && isRetryableError(e) },
  );
}

// ── 非流式 ───────────────────────────────────────────────
export async function chat(cfg: LlmConfig, messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const res = await post(cfg, messages, opts, false);
  const data = (await res.json()) as Record<string, unknown>;
  if (cfg.wire === "anthropic") {
    const err = data.error as { message?: string } | undefined;
    if (err) throw new Error(`LLM ${cfg.provider} error: ${err.message}`);
    const content = (data.content as { type?: string; text?: string }[] | undefined) ?? [];
    const text = content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    if (!text) throw new Error(`LLM ${cfg.provider}: empty response`);
    return text;
  }
  const base = data.base_resp as { status_code?: number; status_msg?: string } | undefined;
  if (base?.status_code) throw new Error(`LLM ${cfg.provider} error ${base.status_code}: ${base.status_msg}`);
  const choices = data.choices as { message?: { content?: string } }[] | undefined;
  const content = choices?.[0]?.message?.content;
  if (!content) throw new Error(`LLM ${cfg.provider}: empty response`);
  return content;
}

// ── 流式 ─────────────────────────────────────────────────
export async function* chatStream(cfg: LlmConfig, messages: ChatMessage[], opts: ChatOptions = {}): AsyncGenerator<string, void, unknown> {
  const res = await post(cfg, messages, opts, true);
  if (!res.body) throw new Error(`LLM ${cfg.provider}: no response body`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue; // 忽略 anthropic 的 `event:` 行
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return; // openai 终止
      try {
        const json = JSON.parse(payload) as Record<string, any>;
        if (cfg.wire === "anthropic") {
          if (json.type === "message_stop") return;
          if (json.type === "content_block_delta" && json.delta?.type === "text_delta" && json.delta.text) {
            yield json.delta.text as string;
          }
        } else {
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta as string;
        }
      } catch {
        // 跨块截断的 JSON 留待下轮
      }
    }
  }
}
