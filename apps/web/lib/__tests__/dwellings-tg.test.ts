import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Dwelling } from "../dwellings";

/**
 * EP-fs-tg：lib/dwellings.ts 的 TG 分流。断言方向是**双向**的——
 * TG 会话时必须走中介（web 直连在 TG 内拿不到正确 uid，是本任务修的实质缺口），
 * 非 TG 时必须走原路径（非 TG 行为零变化是验收红线）。
 *
 * 变异验证（实跑过）：把 listDwellings 等四个函数里的 `hasTgSession()` 分支改成
 * 恒 false，本文件「TG 会话」describe 的 4 条全部变红；web describe 不受影响。
 */

const { tg } = vi.hoisted(() => ({
  tg: { inSession: false },
}));

const tgListDwellings = vi.fn(async (): Promise<Dwelling[]> => []);
const tgCreateDwelling = vi.fn(async (d: Omit<Dwelling, "id">): Promise<Dwelling> => ({ id: "d-new", ...d }));
const tgUpdateDwelling = vi.fn(async (_id: string, _patch: unknown) => {});
const tgDeleteDwelling = vi.fn(async (_id: string) => {});
vi.mock("@/lib/tg/fengshui", () => ({
  tgListDwellings: () => tgListDwellings(),
  tgCreateDwelling: (d: Omit<Dwelling, "id">) => tgCreateDwelling(d),
  tgUpdateDwelling: (id: string, patch: unknown) => tgUpdateDwelling(id, patch),
  tgDeleteDwelling: (id: string) => tgDeleteDwelling(id),
}));

vi.mock("@/lib/tg/client", () => ({
  hasTgSession: () => tg.inSession,
}));

/** web 路径探针：只要直连 supabase 被走到就记下来。 */
const { webTouched } = vi.hoisted(() => ({ webTouched: { count: 0 } }));
vi.mock("@/lib/supabase", () => ({
  ensureSession: vi.fn(async () => {
    webTouched.count++;
    return "u-web";
  }),
  supabase: () => ({
    from: () => ({
      select: () => ({ order: async () => ({ data: [], error: null }) }),
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: {
              id: "d-web", name: "家", kind: "home", tenancy: "rent",
              facing: "S", member_profile_ids: [],
            },
            error: null,
          }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

const { listDwellings, createDwelling, updateDwelling, deleteDwelling } = await import("../dwellings");

const SAMPLE: Omit<Dwelling, "id"> = {
  name: "家", kind: "home", tenancy: "rent", facing: "S", memberProfileIds: [],
};

beforeEach(() => {
  tg.inSession = false;
  webTouched.count = 0;
  tgListDwellings.mockClear();
  tgCreateDwelling.mockClear();
  tgUpdateDwelling.mockClear();
  tgDeleteDwelling.mockClear();
});

describe("EP-fs-tg 居所数据层分流：TG 会话 → 走 /api/tg/fengshui 中介", () => {
  beforeEach(() => {
    tg.inSession = true;
  });

  it("listDwellings 走中介，不碰 web 直连", async () => {
    tgListDwellings.mockResolvedValueOnce([{ id: "d1", ...SAMPLE }]);
    const got = await listDwellings();
    expect(tgListDwellings).toHaveBeenCalledTimes(1);
    expect(webTouched.count).toBe(0);
    expect(got).toEqual([{ id: "d1", ...SAMPLE }]);
  });

  it("createDwelling 走中介", async () => {
    const got = await createDwelling(SAMPLE);
    expect(tgCreateDwelling).toHaveBeenCalledWith(SAMPLE);
    expect(webTouched.count).toBe(0);
    expect(got.id).toBe("d-new");
  });

  it("updateDwelling 走中介，id 与 patch 原样透传", async () => {
    await updateDwelling("d1", { facing: "N" });
    expect(tgUpdateDwelling).toHaveBeenCalledWith("d1", { facing: "N" });
    expect(webTouched.count).toBe(0);
  });

  it("deleteDwelling 走中介", async () => {
    await deleteDwelling("d1");
    expect(tgDeleteDwelling).toHaveBeenCalledWith("d1");
    expect(webTouched.count).toBe(0);
  });
});

describe("EP-fs-tg 居所数据层分流：非 TG → 原路径不变", () => {
  it("listDwellings 走 supabase 直连，不碰中介", async () => {
    await listDwellings();
    expect(webTouched.count).toBeGreaterThan(0);
    expect(tgListDwellings).not.toHaveBeenCalled();
  });

  it("create/update/delete 均不碰中介", async () => {
    await createDwelling(SAMPLE);
    await updateDwelling("d1", { name: "x" });
    await deleteDwelling("d1");
    expect(tgCreateDwelling).not.toHaveBeenCalled();
    expect(tgUpdateDwelling).not.toHaveBeenCalled();
    expect(tgDeleteDwelling).not.toHaveBeenCalled();
  });
});
