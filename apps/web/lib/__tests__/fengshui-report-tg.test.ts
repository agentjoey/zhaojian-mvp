import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FengshuiSections } from "../fengshui-report";

/**
 * EP-fs-tg：lib/fengshui-report.ts 的 TG 分流（读/写/生成三条路）。
 * 双向断言：TG 会话走中介、非 TG 走原路径。报告持久化在 TG 内原本整条不工作
 * （spec §2 的 ❌ 行），本文件守的就是「现在走了哪条路」。
 *
 * 变异验证（实跑过）：把 read/save/requestFengshuiReading 里的 `hasTgSession()`
 * 分支改成恒 false，本文件 TG describe 的 3 条全部变红。
 */

const { tg } = vi.hoisted(() => ({
  tg: { inSession: false },
}));

const SECTIONS: FengshuiSections = { situation: "S", youAndSpace: "Y", actions: "A" };

const tgRead = vi.fn(async (_fp: string): Promise<FengshuiSections | null> => null);
const tgSave = vi.fn(async (_args: unknown) => {});
const tgReading = vi.fn(async (_body: unknown) => ({ sections: SECTIONS, degraded: false }));
vi.mock("@/lib/tg/fengshui", () => ({
  tgReadFengshuiReport: (fp: string) => tgRead(fp),
  tgSaveFengshuiReport: (args: unknown) => tgSave(args),
  tgFengshuiReading: (body: unknown) => tgReading(body),
}));

vi.mock("@/lib/tg/client", () => ({
  hasTgSession: () => tg.inSession,
}));

const { webTouched } = vi.hoisted(() => ({ webTouched: { count: 0 } }));
vi.mock("@/lib/supabase", () => ({
  ensureSession: vi.fn(async () => {
    webTouched.count++;
    return "u-web";
  }),
  supabase: () => ({
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ error: null }),
    }),
  }),
}));

const { readFengshuiReport, saveFengshuiReport, requestFengshuiReading } = await import("../fengshui-report");

const SAVE_ARGS = {
  fingerprint: "fsabc", profileId: "p1", dwellingId: null,
  layer: 0 as const, locale: "zh", sections: SECTIONS,
};

beforeEach(() => {
  tg.inSession = false;
  webTouched.count = 0;
  tgRead.mockClear();
  tgSave.mockClear();
  tgReading.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ sections: SECTIONS, degraded: false }), {
      headers: { "content-type": "application/json" },
    }),
  ));
});

describe("EP-fs-tg 报告分流：TG 会话 → 走 /api/tg/fengshui 中介", () => {
  beforeEach(() => {
    tg.inSession = true;
  });

  it("readFengshuiReport 走中介（带指纹），不碰 web 直连", async () => {
    tgRead.mockResolvedValueOnce(SECTIONS);
    const got = await readFengshuiReport("fsabc");
    expect(tgRead).toHaveBeenCalledWith("fsabc");
    expect(webTouched.count).toBe(0);
    expect(got).toEqual(SECTIONS);
  });

  it("saveFengshuiReport 走中介，参数原样透传", async () => {
    await saveFengshuiReport(SAVE_ARGS);
    expect(tgSave).toHaveBeenCalledWith(SAVE_ARGS);
    expect(webTouched.count).toBe(0);
  });

  it("requestFengshuiReading 走中介 reading action，不发 web fetch", async () => {
    const body = { date: "1990-06-15", time: "14:30", gender: "male" };
    const got = await requestFengshuiReading(body, "zh");
    expect(tgReading).toHaveBeenCalledWith(body);
    expect(fetch).not.toHaveBeenCalled();
    expect(got).toEqual({ sections: SECTIONS, degraded: false });
  });
});

describe("EP-fs-tg 报告分流：非 TG → 原路径不变", () => {
  it("read/save 走 supabase 直连，不碰中介", async () => {
    await readFengshuiReport("fsabc");
    await saveFengshuiReport(SAVE_ARGS);
    expect(webTouched.count).toBeGreaterThan(0);
    expect(tgRead).not.toHaveBeenCalled();
    expect(tgSave).not.toHaveBeenCalled();
  });

  it("requestFengshuiReading 打 /api/fengshui/reading，带 locale 头", async () => {
    const body = { date: "1990-06-15" };
    const got = await requestFengshuiReading(body, "en");
    expect(tgReading).not.toHaveBeenCalled();
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("/api/fengshui/reading");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ "x-zj-locale": "en" });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(body);
    expect(got).toEqual({ sections: SECTIONS, degraded: false });
  });

  it("requestFengshuiReading web 路径非 2xx → 抛响应正文（与此前内联实现同语义）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("生成失败", { status: 500 })));
    await expect(requestFengshuiReading({}, "zh")).rejects.toThrow("生成失败");
  });
});
