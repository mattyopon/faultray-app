-- ============================================================
-- Fix #24: profiles.plan / teams.plan CHECK に 'starter' を追加
--
-- 背景:
--   src/lib/types.ts:36 と src/app/api/stripe/webhook/route.ts:8 で
--   PlanTier = "free" | "starter" | "pro" | "business" と定義されているが、
--   001_initial_schema.sql の CHECK 制約には 'starter' が含まれていなかった。
--
--   結果: Stripe Starter price を契約したユーザーの webhook で
--         profiles.plan='starter' を書き込もうとすると Postgres CHECK 違反となり
--         updateUserPlan が例外を投げる → サイレントに plan 更新に失敗する。
--
-- 実装:
--   001_initial_schema.sql の CHECK はインライン無名制約のため
--   Postgres が自動生成した名前 (通常 <table>_<column>_check) で削除する。
--   環境差異に備えて DO block 内で pg_constraint から実名を取得して DROP する。
-- ============================================================

-- profiles.plan ───────────────────────────────────────────────
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%plan%in%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'starter', 'pro', 'business'));

-- teams.plan ──────────────────────────────────────────────────
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.teams'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%plan%in%'
  loop
    execute format('alter table public.teams drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.teams
  add constraint teams_plan_check
  check (plan in ('free', 'starter', 'pro', 'business'));
