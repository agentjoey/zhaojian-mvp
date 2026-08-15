import { describe, it, expect, vi } from "vitest";

/**
 * `toDwelling` 是 DB 行 → 领域对象的映射，含两个判别三元与两个 `??` 兜底。
 * 它本身不发网络请求，但被包在会发请求的模块里，所以先 mock 掉 supabase 依赖，
 * 再通过 `listDwellings` 走一遍真实映射——这样测的是映射逻辑，不是 Supabase。
 *
 * 为什么值得单独测：DB 的 kind/tenancy/facing 都是无约束的 text 列（无 CHECK），
 * 脏值、历史值、null 都可能出现；而 Task 9 起页面会直接依赖这里的收敛结果，
 * 映射错一处就是「租房用户拿到需自有的化解」这类静默错误。
 */

const rows: unknown[] = [];
vi.mock("@/lib/supabase", () => ({
  ensureSession: vi.fn(async () => "u1"),
  supabase: () => ({
    from: () => ({
      select: () => ({ order: async () => ({ data: rows, error: null }) }),
    }),
  }),
}));

const { listDwellings } = await import("../dwellings");

function setRows(...rs: unknown[]) {
  rows.length = 0;
  rows.push(...rs);
}

const base = {
  id: "d1", name: "家", kind: "home", tenancy: "rent",
  facing: "S", member_profile_ids: ["p2"],
};

describe("toDwelling 映射（经 listDwellings）", () => {
  it("正常行原样收敛", async () => {
    setRows(base);
    expect(await listDwellings()).toEqual([{
      id: "d1", name: "家", kind: "home", tenancy: "rent",
      facing: "S", memberProfileIds: ["p2"],
    }]);
  });

  it("kind 只认 office，其余一律收敛为 home（含脏值与空串）", async () => {
    setRows({ ...base, kind: "office" }, { ...base, kind: "shop" }, { ...base, kind: "" });
    const got = await listDwellings();
    expect(got.map((d) => d.kind)).toEqual(["office", "home", "home"]);
  });

  it("tenancy 只认 own，其余一律收敛为 rent——默认租住是刻意的保守选择", async () => {
    setRows({ ...base, tenancy: "own" }, { ...base, tenancy: "lease" }, { ...base, tenancy: "" });
    const got = await listDwellings();
    expect(got.map((d) => d.tenancy)).toEqual(["own", "rent", "rent"]);
    // 保守方向很重要：误判成 own 会把「需自有」的化解推给租客（做不了的建议）；
    // 误判成 rent 只是把可做的建议排后面，代价小得多。
  });

  it("facing 为 null（用户选「不确定」）如实保留，不被兜底成某个方位", async () => {
    setRows({ ...base, facing: null });
    expect((await listDwellings())[0]!.facing).toBeNull();
  });

  it("member_profile_ids 为 null 时兜底成空数组，不让调用方处理 null", async () => {
    setRows({ ...base, member_profile_ids: null });
    expect((await listDwellings())[0]!.memberProfileIds).toEqual([]);
  });
});
