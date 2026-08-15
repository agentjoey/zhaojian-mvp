-- EP-fs-11 风水波2 Layer 1：居所 + 报告持久化
-- 波1 无迁移；本迁移只新增表，不改动 profiles / entitlements / spirit_messages 等既有表。

create table if not exists public.dwellings (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references auth.users(id) on delete cascade,
  name text not null,                              -- 「家」「办公室」
  kind text not null default 'home',               -- home | office
  tenancy text not null default 'rent',            -- rent | own（驱动 Remedy 折叠）
  facing text,                                     -- 八方位枚举 N/NE/E/SE/S/SW/W/NW；null = 不确定 → 降级 Layer 0
  facing_degrees numeric,                          -- Layer 2 玄空飞星用罗盘度数，波2 留空
  built_year int,                                  -- Layer 2 元运用，波2 留空
  layout jsonb,                                    -- Layer 2 房间标注，波2 留空
  member_profile_ids uuid[] not null default '{}', -- 合看的档案 id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.dwellings enable row level security;
create policy own_all on public.dwellings for all
  using (auth.uid() = uid) with check (auth.uid() = uid);
create index if not exists dwellings_uid_idx on public.dwellings(uid);

-- 报告持久化。与三段式解读不同：命盘冻结所以解读永久有效，
-- 而居所可变（改朝向 / 增减同住人 / 切语言）→ 必须带失效机制。
create table if not exists public.fengshui_reports (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references auth.users(id) on delete cascade,
  dwelling_id uuid references public.dwellings(id) on delete cascade,  -- null = Layer 0 报告
  profile_id uuid not null,                        -- 视角所有者（主档案）；合看成员在 fingerprint 内
  layer int not null,
  locale text not null,
  input_fingerprint text not null,
  sections jsonb not null,                         -- { situation, youAndSpace, actions }
  created_at timestamptz not null default now()
);
alter table public.fengshui_reports enable row level security;
create policy own_all on public.fengshui_reports for all
  using (auth.uid() = uid) with check (auth.uid() = uid);
-- 命中查询：同一 uid + 指纹只保留一条有效记录
create unique index if not exists fengshui_reports_fp_idx
  on public.fengshui_reports(uid, input_fingerprint);
