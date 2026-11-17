create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

revoke all on public.user_data from anon;
grant select, insert, update on public.user_data to authenticated;

drop policy if exists "Users can view their own data" on public.user_data;
create policy "Users can view their own data"
on public.user_data for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their own data" on public.user_data;
create policy "Users can add their own data"
on public.user_data for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own data" on public.user_data;
create policy "Users can update their own data"
on public.user_data for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
