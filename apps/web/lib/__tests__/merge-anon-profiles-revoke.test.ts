import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * merge_anon_profiles 是 security definer 函数：必须回收公开 EXECUTE，
 * 否则持公开 anon key 的任何人可经 PostgREST 用任意 (anon_id, target_id)
 * 直接调 RPC，把别人的档案和对话记录转到自己名下（EP-account2-06，
 * 见 0012 迁移文件内注释）。测试直接读迁移文件断言 revoke 存在，不连库
 * （与 user-data-cascade.test.ts 同一模式）。
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  __dirname,
  "../../../../supabase/migrations/0012_merge_anon_profiles_rpc.sql",
);

describe("EP-account2-06：merge_anon_profiles 必须 revoke 公开 EXECUTE", () => {
  it("0012 迁移含 revoke execute ... from public, anon, authenticated", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.merge_anon_profiles/i,
    );
    expect(sql).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.merge_anon_profiles[^;]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,
    );
  });
});
