-- EP-tg-P2 · 原子消费一次 LLM 额度：未超则 llm_uses+1 返回 true，超则返回 false（不增）
create or replace function public.consume_llm_credit(p_tg_user_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int; v_quota int;
begin
  select llm_uses, free_llm_quota into v_used, v_quota
    from public.tg_users where tg_user_id = p_tg_user_id for update;
  if v_used is null then return false; end if;       -- 无此用户
  if v_used >= v_quota then return false; end if;     -- 额度耗尽
  update public.tg_users set llm_uses = llm_uses + 1 where tg_user_id = p_tg_user_id;
  return true;
end;
$$;
