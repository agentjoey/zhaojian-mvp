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
 *
 * 注意：key 必须是真实表名。0010 迁移的文件名取自 RPC 函数词根
 * llm_credit_account，文件里真实的表是 llm_usage——清单按表名登记，
 * 不按迁移文件名登记。
 */
const TABLE_TO_MIGRATION_FILE: Record<string, string> = {
  spirit_messages: "0002_spirit_messages.sql",
  tg_users: "0005_tg_users.sql",
  entitlements: "0009_entitlements.sql",
  llm_usage: "0010_llm_credit_account.sql",
  dwellings: "0011_dwellings.sql",
  fengshui_reports: "0011_dwellings.sql",
  profiles: "0013_profiles_cascade.sql",
  user_consents: "0014_user_consents.sql",
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "../../../../supabase/migrations");

/**
 * 在迁移 SQL 里定位该表的建表/改表语句（create table / alter table 到下一个
 * 分号为止），断言其中存在指向 auth.users 且紧邻 on delete cascade 的外键。
 * 表级断言而非文件级：同一文件里第二张表丢 cascade 也能检出来；
 * 表名只出现在注释里不算数（必须落在 create/alter 语句中）。
 * cascade 必须与 references auth.users 同处一个外键子句——同表上指向
 * 其他表的 cascade（如 fengshui_reports.dwelling_id → dwellings）不算。
 */
function tableHasAuthUsersCascade(sql: string, table: string): boolean {
  const stmtStart = new RegExp(
    `(?:create table|alter table)[^;]*?\\b${table}\\b`,
    "gi",
  );
  let match: RegExpExecArray | null;
  while ((match = stmtStart.exec(sql)) !== null) {
    const end = sql.indexOf(";", match.index);
    const stmt = sql.slice(match.index, end === -1 ? undefined : end);
    if (
      /references\s+auth\.users\s*\([^)]*\)\s*on\s+delete\s+cascade/i.test(stmt)
    ) {
      return true;
    }
  }
  return false;
}

describe("EP-account2-07：注销级联清单完整性（读迁移文件，不连库）", () => {
  it.each(Object.entries(TABLE_TO_MIGRATION_FILE))(
    "%s（%s）的建表/改表语句含 references auth.users + on delete cascade",
    (table, file) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      expect(tableHasAuthUsersCascade(sql, table)).toBe(true);
    },
  );
});
