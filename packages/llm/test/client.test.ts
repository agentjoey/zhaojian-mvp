import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chat, chatStream } from "../src/index";
import type { LlmConfig } from "../src/index";

/**
 * 本地 stub 同时模拟两种线协议，按请求路径分流：
 *  - /v1/messages       → Anthropic 兼容（MiniMax Coding/Token Plan 走这条）
 *  - /chat/completions  → OpenAI 兼容（DeepSeek 等）
 * 验证请求构造、鉴权头、system 提取、两套响应/SSE 解析——无需真实 provider key。
 */
let server: Server;
let host: string;
let last: { path?: string; auth?: string; anthropicVersion?: string; body?: any } = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      last = {
        path: req.url,
        auth: req.headers.authorization,
        anthropicVersion: req.headers["anthropic-version"] as string | undefined,
        body: JSON.parse(raw || "{}"),
      };
      const isAnthropic = req.url?.includes("/v1/messages");
      if (last.body.stream) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        if (isAnthropic) {
          res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "## Overview\n" } })}\n\n`);
          res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "grounded theme" } })}\n\n`);
          res.write(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "## Overview\n" } }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "grounded theme" } }] })}\n\n`);
          res.write("data: [DONE]\n\n");
        }
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          isAnthropic
            ? JSON.stringify({ type: "message", role: "assistant", content: [{ type: "text", text: "hello reading" }], stop_reason: "end_turn" })
            : JSON.stringify({ choices: [{ message: { content: "hello reading" }, finish_reason: "stop" }] }),
        );
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

const anthropicCfg = (): LlmConfig => ({ provider: "minimax", wire: "anthropic", baseUrl: `${host}/anthropic`, model: "MiniMax-M3", apiKey: "sk-cp-test", supportsJsonSchema: false });
const openaiCfg = (): LlmConfig => ({ provider: "deepseek", wire: "openai", baseUrl: `${host}/v1`, model: "deepseek-chat", apiKey: "test-key", supportsJsonSchema: true });

describe("Anthropic 兼容（MiniMax Coding Plan 路径）", () => {
  it("非流式：打 /anthropic/v1/messages，system 提顶层，解析 content[].text", async () => {
    const out = await chat(anthropicCfg(), [
      { role: "system", content: "you are a reader" },
      { role: "user", content: "hi" },
    ]);
    expect(out).toBe("hello reading");
    expect(last.path).toBe("/anthropic/v1/messages");
    expect(last.auth).toBe("Bearer sk-cp-test");
    expect(last.anthropicVersion).toBe("2023-06-01");
    expect(last.body.system).toBe("you are a reader"); // system 提到顶层
    expect(last.body.messages.every((m: any) => m.role !== "system")).toBe(true);
    expect(last.body.max_tokens).toBeGreaterThan(0);
  });

  it("流式：解析 content_block_delta，遇 message_stop 结束", async () => {
    let acc = "";
    for await (const chunk of chatStream(anthropicCfg(), [{ role: "user", content: "hi" }])) acc += chunk;
    expect(acc).toBe("## Overview\ngrounded theme");
  });
});

describe("OpenAI 兼容（DeepSeek 路径）", () => {
  it("非流式：打 /v1/chat/completions，解析 choices[0].message.content", async () => {
    const out = await chat(openaiCfg(), [{ role: "user", content: "hi" }]);
    expect(out).toBe("hello reading");
    expect(last.path).toBe("/v1/chat/completions");
  });
  it("流式：解析 delta.content，遇 [DONE] 结束", async () => {
    let acc = "";
    for await (const chunk of chatStream(openaiCfg(), [{ role: "user", content: "hi" }])) acc += chunk;
    expect(acc).toBe("## Overview\ngrounded theme");
  });
});
