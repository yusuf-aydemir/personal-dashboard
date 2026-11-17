create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 1 and 120),
  company text not null check (char_length(company) between 1 and 100),
  url text not null default '' check (char_length(url) <= 2000),
  location text not null default '' check (char_length(location) <= 100),
  status text not null default 'saved'
    check (status in ('saved', 'applied', 'interview', 'offer', 'rejected')),
  notes text not null default '' check (char_length(notes) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_user_id_updated_at_idx
on public.jobs (user_id, updated_at desc);

alter table public.jobs enable row level security;

revoke all on public.jobs from anon;
grant select, insert, update, delete on public.jobs to authenticated;

drop policy if exists "Users can view their own jobs" on public.jobs;
create policy "Users can view their own jobs"
on public.jobs for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their own jobs" on public.jobs;
create policy "Users can add their own jobs"
on public.jobs for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own jobs" on public.jobs;
create policy "Users can update their own jobs"
on public.jobs for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own jobs" on public.jobs;
create policy "Users can delete their own jobs"
on public.jobs for delete
to authenticated
using ((select auth.uid()) = user_id);
