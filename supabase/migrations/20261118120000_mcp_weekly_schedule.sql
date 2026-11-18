create or replace function public.save_user_data_with_schedule(
  p_data jsonb,
  p_base_schedule jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  saved_data jsonb;
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

  insert into public.user_data (user_id, data, updated_at)
  values (current_user_id, p_data, pg_catalog.now())
  on conflict (user_id) do update
  set data = pg_catalog.jsonb_set(
        excluded.data,
        '{schedule}',
        case
          when public.user_data.data->'schedule' is null
            or excluded.data->'schedule' is distinct from p_base_schedule
            then excluded.data->'schedule'
          else public.user_data.data->'schedule'
        end,
        true
      ),
      updated_at = pg_catalog.now()
  returning data into saved_data;

  return saved_data;
end;
$$;

revoke all on function public.save_user_data_with_schedule(jsonb, jsonb) from public, anon;
grant execute on function public.save_user_data_with_schedule(jsonb, jsonb) to authenticated;

create or replace function public.apply_mcp_weekly_schedule_changes(
  p_user_id uuid,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_schedule jsonb;
  change_item jsonb;
  day_index integer;
  start_hour integer;
  end_hour integer;
  hour_value integer;
  status_value text;
  slot_value jsonb;
  day_value jsonb;
  existing_slot jsonb;
begin
  if p_user_id is null then
    raise exception 'A user id is required.'
      using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_changes) is distinct from 'array' then
    raise exception 'Schedule changes must be an array.'
      using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_changes) < 1
     or pg_catalog.jsonb_array_length(p_changes) > 50 then
    raise exception 'Provide between 1 and 50 schedule changes.'
      using errcode = '22023';
  end if;

  select data->'schedule'
  into current_schedule
  from public.user_data
  where user_id = p_user_id
  for update;

  if not found or pg_catalog.jsonb_typeof(current_schedule) is distinct from 'array' then
    raise exception 'The user weekly schedule has not been initialized.'
      using errcode = 'P0002';
  end if;
  if pg_catalog.jsonb_array_length(current_schedule) <> 7 then
    raise exception 'The stored weekly schedule has an invalid shape.'
      using errcode = '22023';
  end if;

  for day_value in
    select value from pg_catalog.jsonb_array_elements(current_schedule)
  loop
    if pg_catalog.jsonb_typeof(day_value) is distinct from 'array' then
      raise exception 'The stored weekly schedule has an invalid shape.'
        using errcode = '22023';
    end if;
    if pg_catalog.jsonb_array_length(day_value) <> 18 then
      raise exception 'The stored weekly schedule has an invalid shape.'
        using errcode = '22023';
    end if;

    for existing_slot in
      select value from pg_catalog.jsonb_array_elements(day_value)
    loop
      if existing_slot is distinct from 'null'::jsonb
         and existing_slot is distinct from '"free"'::jsonb
         and existing_slot is distinct from '"busy"'::jsonb then
        raise exception 'The stored weekly schedule has an invalid status.'
          using errcode = '22023';
      end if;
    end loop;
  end loop;

  for change_item in
    select value from pg_catalog.jsonb_array_elements(p_changes)
  loop
    if pg_catalog.jsonb_typeof(change_item) is distinct from 'object'
       or pg_catalog.jsonb_typeof(change_item->'dayIndex') is distinct from 'number'
       or coalesce((change_item->>'dayIndex') !~ '^[0-6]$', true)
       or pg_catalog.jsonb_typeof(change_item->'startHour') is distinct from 'number'
       or coalesce((change_item->>'startHour') !~ '^(6|[7-9]|1[0-9]|2[0-3])$', true)
       or pg_catalog.jsonb_typeof(change_item->'endHour') is distinct from 'number'
       or coalesce((change_item->>'endHour') !~ '^([7-9]|1[0-9]|2[0-4])$', true)
       or pg_catalog.jsonb_typeof(change_item->'status') is distinct from 'string'
       or change_item->>'status' not in ('free', 'busy', 'unplanned') then
      raise exception 'A weekly schedule change has invalid fields.'
        using errcode = '22023';
    end if;

    day_index := (change_item->>'dayIndex')::integer;
    start_hour := (change_item->>'startHour')::integer;
    end_hour := (change_item->>'endHour')::integer;
    status_value := change_item->>'status';
    if start_hour >= end_hour then
      raise exception 'The end hour must be after the start hour.'
        using errcode = '22023';
    end if;

    slot_value := case status_value
      when 'free' then '"free"'::jsonb
      when 'busy' then '"busy"'::jsonb
      else 'null'::jsonb
    end;

    hour_value := start_hour;
    while hour_value < end_hour loop
      current_schedule := pg_catalog.jsonb_set(
        current_schedule,
        array[day_index::text, (hour_value - 6)::text],
        slot_value,
        false
      );
      hour_value := hour_value + 1;
    end loop;
  end loop;

  update public.user_data
  set data = pg_catalog.jsonb_set(data, '{schedule}', current_schedule, true),
      updated_at = pg_catalog.now()
  where user_id = p_user_id;

  return current_schedule;
end;
$$;

revoke all on function public.apply_mcp_weekly_schedule_changes(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_mcp_weekly_schedule_changes(uuid, jsonb) to service_role;
