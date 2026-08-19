import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 用户数据表清单——注销账号时必须级联清理的表（EP-account2-07，spec §6①）。
 * 每张表映射到"定义它的 cascade 约束"所在的迁移文件；测试直接读文件断言，
 * 不连库（这个仓库很多迁移只 apply 在生产、CI 环境里没有可连的库）。
 *
 * ⚠️ 这份清单需要人工维护：新增一张挂 auth.users 外键的用户数据表时，
 * 必须在这里加一行，这条测试才知道要检查它。这是清单类测试的天然限制——
 * 它防的是"清单里的表忘了配 cascade"，不是"忘了把新表加进清单"（后者要靠
 * code review）。
 */
const TABLE_TO_MIGRATION_FILE: Record<string, string> = {
  spirit_messages: "0002_spirit_messages.sql",
  tg_users: "0005_tg_users.sql",
  entitlements: "0009_entitlements.sql",
  llm_credit_account: "0010_llm_credit_account.sql",
  dwellings: "0011_dwellings.sql",
  fengshui_reports: "0011_dwellings.sql",
  profiles: "0013_profiles_cascade.sql",
  user_consents: "0014_user_consents.sql",
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "../../../../supabase/migrations");

describe("EP-account2-07：注销级联清单完整性（读迁移文件，不连库）", () => {
  it.each(Object.entries(TABLE_TO_MIGRATION_FILE))(
    "%s（%s）里同时出现 auth.users 与 on delete cascade",
    (_table, file) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      expect(sql).toMatch(/auth\.users/i);
      expect(sql).toMatch(/on delete cascade/i);
    },
  );
});
