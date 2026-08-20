import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * consume_llm_credit / consume_llm_credit_account 都是 security definer 函数：
 * 必须回收公开 EXECUTE，否则持公开 anon key 的任何人可经 PostgREST 拿任意
 * tg_user_id / user uuid 循环调 RPC，烧干该用户的月度免费 LLM 额度
 * （EP-account2-fix，与 0012 的 merge_anon_profiles 同类洞）。测试直接读
 * 迁移文件断言 revoke 存在，不连库（与 merge-anon-profiles-revoke.test.ts
 * 同一模式）。
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  __dirname,
  "../../../../supabase/migrations/0015_revoke_llm_credit_rpc.sql",
);

describe("EP-account2-fix：两个 LLM 额度 RPC 必须 revoke 公开 EXECUTE", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("0015 含 consume_llm_credit(bigint) 的 revoke", () => {
    expect(sql).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.consume_llm_credit\(bigint\)[^;]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,
    );
  });

  it("0015 含 consume_llm_credit_account(uuid, int) 的 revoke", () => {
    expect(sql).toMatch(
      /revoke\s+execute\s+on\s+function\s+public\.consume_llm_credit_account\(uuid\s*,\s*int\)[^;]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,
    );
  });
});
