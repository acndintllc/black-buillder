create or replace function public.increment_run_cost(p_run_id uuid, p_amount numeric)
returns void
language sql
security definer
set search_path = public
as $$
  update public.runs
  set cost_usd = coalesce(cost_usd, 0) + p_amount
  where id = p_run_id;
$$;

revoke all on function public.increment_run_cost(uuid, numeric) from public;
grant execute on function public.increment_run_cost(uuid, numeric) to service_role;
