alter table public.runs add column budget_usd numeric default null;
comment on column public.runs.budget_usd is 'Optional per-run spend cap in USD, enforced by the llm-proxy edge function. NULL = unlimited.';
