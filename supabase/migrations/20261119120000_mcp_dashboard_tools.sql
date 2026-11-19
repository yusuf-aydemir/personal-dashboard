-- Section-level merge for the web app and compare-and-swap writes for the MCP server.
--
-- The web app sends its whole dashboard object plus the copy it last synced
-- (p_base). A section the device did not change since that sync keeps the
-- value already stored in the cloud, so edits made from Claude (or another
-- device) in the meantime are not overwritten.

create or replace function public.save_user_data_merged(
  p_data jsonb,
  p_base jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  stored_data jsonb;
  merged_data jsonb;
  section_key text;
  section_value jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;
  if pg_catalog.jsonb_typeof(p_data) is distinct from 'object'
     or pg_catalog.jsonb_typeof(p_data->'schedule') is distinct from 'array' then
    raise exception 'Dashboard data must include a weekly schedule.'
      using errcode = '22023';
  end if;
  if p_base is not null and pg_catalog.jsonb_typeof(p_base) is distinct from 'object' then
    raise exception 'The base dashboard data must be an object.'
      using errcode = '22023';
  end if;

  select data
  into stored_data
  from public.user_data
  where user_id = current_user_id
  for update;

  if not found then
    insert into public.user_data (user_id, data, updated_at)
    values (current_user_id, p_data, pg_catalog.now())
    returning data into merged_data;
    return merged_data;
  end if;

  merged_data := stored_data;
  for section_key, section_value in
    select key, value from pg_catalog.jsonb_each(p_data)
  loop
    if p_base is null
       or not (stored_data ? section_key)
       or section_value is distinct from (p_base->section_key) then
      merged_data := merged_data || pg_catalog.jsonb_build_object(section_key, section_value);
    end if;
  end loop;

  update public.user_data
  set data = merged_data,
      updated_at = pg_catalog.now()
  where user_id = current_user_id;

  return merged_data;
end;
$$;

revoke all on function public.save_user_data_merged(jsonb, jsonb) from public, anon;
grant execute on function public.save_user_data_merged(jsonb, jsonb) to authenticated;

-- Replace one dashboard section only if it still equals what the MCP server
-- read. Returns null when someone else changed it first, so the caller can
-- re-read and retry.
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
     or p_section not in ('notes', 'income', 'fixedExpenses', 'categories', 'expenses') then
    raise exception 'This dashboard section cannot be changed by the MCP server.'
      using errcode = '22023';
  end if;
  if p_value is null or p_value = 'null'::jsonb then
    raise exception 'A section value is required.'
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
