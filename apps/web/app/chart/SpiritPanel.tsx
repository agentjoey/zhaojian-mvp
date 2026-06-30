"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deriveSpirit, formatQuestionnaire } from "@eamvp/core";
import type { Profile } from "@/lib/profiles";
import { getSpiritMemory, saveSpiritMemory, getQuestionnaire } from "@/lib/profiles";
import { listMessages, appendMessage, type SpiritMessage } from "@/lib/spirit";
import { hasTgSession, isTelegram, tgListMessages, tgSpiritStream } from "@/lib/tg/client";
import { useTgMainButton, haptics } from "@/lib/tg/ui";
import { Card } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { SpiritPortrait } from "./SpiritPortrait";
import { spiritMemoryAction } from "@/app/actions";

export function SpiritPanel({ profile }: { profile: Profile }) {
  const spirit = deriveSpirit(profile.chart);
  const [messages, setMessages] = useState<SpiritMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memory, setMemory] = useState<string | null>(null);
  const [questionnaire, setQuestionnaire] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  useTgMainButton({
    text: streaming ? "本命之灵书写中…" : "发送",
    onClick: () => handleSubmit(),
    enabled: !streaming && !!input.trim(),
    visible: isTelegram() && !streaming ? true : isTelegram(),
  });

  const sendToSpirit = useCallback(
    async (historyForApi: { role: "user" | "spirit"; content: string }[]): Promise<string> => {
      const res = await fetch("/api/spirit/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chart: profile.chart, messages: historyForApi, memory, questionnaire }),
      });
      if (!res.ok || !res.body) {
        throw new Error(await res.text() || "本命之灵暂时无法回应");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += dec.decode(value, { stream: true });
      }
      return full;
    },
    [profile.chart, memory, questionnaire],
  );

  // 初始化：读取历史。开场白是「临时的」——每次按当前语言重新生成、不持久化，
  // 故避免被旧语言冻结（旧版曾把开场白存库，这里剥离首条 spirit 消息以兼容）。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (hasTgSession()) {
          const ms = await tgListMessages();
          if (cancelled) return;
          // 真实对话从首条「用户消息」起算；开场白（首条 spirit 消息）一律丢弃
          const convo = ms[0]?.role === "spirit" ? ms.slice(1) : ms;
          setMessages(convo);
        } else {
          const [mem, ms, qa] = await Promise.all([
            getSpiritMemory(profile.id),
            listMessages(profile.id),
            getQuestionnaire(profile.id),
          ]);
          if (cancelled) return;
          setMemory(mem);
          setQuestionnaire(qa ? formatQuestionnaire(qa) : undefined);
          // 真实对话从首条「用户消息」起算；开场白（首条 spirit 消息）一律丢弃、按当前语言重生成
          const convo = ms[0]?.role === "spirit" ? ms.slice(1) : ms;
          if (convo.length > 0) {
            setMessages(convo);
          } else {
            const greeting = await sendToSpirit([]);
            if (cancelled) return;
            // 不持久化：仅作当次展示，确保始终是当前语言
            setMessages([{ id: `intro-${Date.now()}`, role: "spirit", content: greeting, createdAt: new Date().toISOString() }]);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [profile.id, sendToSpirit]);

  // 新消息到达时滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;

    setError(null);
    const userMsg: SpiritMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    try { haptics.light(); } catch {}

    if (!hasTgSession()) {
      try {
        await appendMessage(profile.id, "user", text);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
    }

    setStreaming(true);
    const historyForApi = nextMessages.map((m) => ({ role: m.role, content: m.content }));

    if (hasTgSession()) {
      const tempId = `spirit-${Date.now()}`;
      setMessages((prev) => [...prev, { id: tempId, role: "spirit", content: "", createdAt: new Date().toISOString() }]);
      try {
        let full = "";
        await tgSpiritStream(historyForApi, (chunk) => {
          full += chunk;
          setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, content: full } : m)));
        });
        try { haptics.success(); } catch {}
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { id: `spirit-${Date.now()}`, role: "spirit", content: full, createdAt: new Date().toISOString() } : m)),
        );
      } catch (e) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        if (e instanceof Error && e.message === "quota") {
          setError("免费畅聊额度已用完");
        } else {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setStreaming(false);
      }
      return;
    }

    try {
      let full = "";
      const res = await fetch("/api/spirit/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chart: profile.chart, messages: historyForApi, memory, questionnaire }),
      });
      if (!res.ok || !res.body) {
        throw new Error(await res.text() || "本命之灵暂时无法回应");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();

      // 临时 spirit 气泡，边流边更新
      const tempId = `spirit-${Date.now()}`;
      setMessages((prev) => [...prev, { id: tempId, role: "spirit", content: "", createdAt: new Date().toISOString() }]);

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += dec.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, content: full } : m)),
        );
      }
      try { haptics.success(); } catch {}

      await appendMessage(profile.id, "spirit", full);
      const fullHistory = [...historyForApi, { role: "spirit" as const, content: full }];
      spiritMemoryAction(fullHistory, memory ?? undefined)
        .then((m) => { if (m) { setMemory(m); void saveSpiritMemory(profile.id, m); } })
        .catch(() => {});
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { id: `spirit-${Date.now()}`, role: "spirit", content: full, createdAt: new Date().toISOString() } : m)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming(false);
    }
  }

  const cinnabar = "var(--color-cinnabar)";

  return (
    <Card className="flex flex-col" topAccent={spirit.dominantElement}>
      {/* 形象 hero */}
      <SpiritPortrait element={spirit.dominantElement} archetype={spirit.archetype} />

      {/* Messages */}
      <div
        ref={scrollRef}
        className="mb-4 flex max-h-[420px] min-h-[180px] flex-col gap-3 overflow-y-auto pr-1"
      >
        {messages.length === 0 && isTelegram() && (
          <div className="flex justify-start">
            <div
              className="max-w-[82%] rounded-[var(--radius-card)] px-4 py-3 text-[14px] leading-relaxed bg-[var(--color-paper)] text-ink-2"
              style={{ border: "1px solid var(--color-line)" }}
            >
              与本命之灵说点什么吧…
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[82%] rounded-[var(--radius-card)] px-4 py-3 text-[14px] leading-relaxed ${
                m.role === "user"
                  ? "text-white"
                  : "bg-[var(--color-paper)] text-ink-2"
              }`}
              style={
                m.role === "user"
                  ? { background: cinnabar }
                  : { border: "1px solid var(--color-line)" }
              }
            >
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap">{m.content}</p>
              ) : m.content ? (
                <div className="reading-prose"><Markdown text={m.content} /></div>
              ) : streaming ? (
                <span className="inline-block animate-pulse text-cinnabar">▋</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-3 px-3 py-2 text-[12px]"
          style={{
            borderRadius: "var(--radius-card)",
            background: "var(--color-error-bg)",
            color: "var(--color-seal)",
            border: "1px solid var(--color-error-line)",
          }}
        >
          {error}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="与本命之灵对话…"
          rows={1}
          disabled={streaming}
          className="flex-1 resize-none rounded-[var(--radius-button)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-[var(--color-cinnabar)] focus:outline-none disabled:opacity-60"
          style={{ minHeight: 44, maxHeight: 120 }}
        />
        {!isTelegram() && (
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="inline-flex h-[44px] shrink-0 items-center justify-center px-4 text-[14px] font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: cinnabar, borderRadius: "var(--radius-button)" }}
          >
            发送
          </button>
        )}
      </form>
    </Card>
  );
}
