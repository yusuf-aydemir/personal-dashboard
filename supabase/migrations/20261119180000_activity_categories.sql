-- Let the MCP server also change the weekly schedule, the activity categories
-- (Gym, Yemek hazırlama, ...) and the per-day latest bedtimes with the same
-- compare-and-swap write it uses for notes and finance.

create or replace function public.mcp_replace_user_data_section(
  p_user_id uuid,
  p_section text,
  p_expected jsonb,
  p_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_data jsonb;
begin
  if p_user_id is null then
    raise exception 'A user id is required.'
      using errcode = '22023';
  end if;
  if p_section is null
     or p_section not in (
       'notes', 'income', 'fixedExpenses', 'categories', 'expenses',
       'schedule', 'activityCategories', 'bedtimes'
     ) then
    raise exception 'This dashboard section cannot be changed by the MCP server.'
      using errcode = '22023';
  end if;
  if p_value is null or p_value = 'null'::jsonb then
    raise exception 'A section value is required.'
      using errcode = '22023';
  end if;
  if p_section in ('schedule', 'bedtimes')
     and (pg_catalog.jsonb_typeof(p_value) is distinct from 'array'
          or pg_catalog.jsonb_array_length(p_value) <> 7) then
    raise exception 'The weekly schedule and bedtimes must have seven days.'
      using errcode = '22023';
  end if;
  if p_section = 'activityCategories'
     and pg_catalog.jsonb_typeof(p_value) is distinct from 'array' then
    raise exception 'Activity categories must be an array.'
      using errcode = '22023';
  end if;

  select data
  into stored_data
  from public.user_data
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'The user dashboard data has not been initialized.'
      using errcode = 'P0002';
  end if;
  if (stored_data->p_section) is distinct from p_expected then
    return null;
  end if;

  update public.user_data
  set data = stored_data || pg_catalog.jsonb_build_object(p_section, p_value),
      updated_at = pg_catalog.now()
  where user_id = p_user_id
  returning data into stored_data;

  return stored_data;
end;
$$;

revoke all on function public.mcp_replace_user_data_section(uuid, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.mcp_replace_user_data_section(uuid, text, jsonb, jsonb)
  to service_role;
