-- LEVELD – Update 4: one-off to-dos and the "gym" communication style.
-- Additive & idempotent: safe to run more than once.

create table if not exists public.todos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  due_date    date,
  done_at     timestamptz,
  note        text not null default '' check (char_length(note) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists todos_user_idx on public.todos(user_id, done_at);

alter table public.todos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'todos' and policyname = 'todos_owner') then
    create policy todos_owner on public.todos for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'todos_updated_at') then
    create trigger todos_updated_at before update on public.todos for each row execute function public.set_updated_at();
  end if;
end $$;
grant select, insert, update, delete on public.todos to authenticated;

-- new communication style "gym"
alter table public.profiles drop constraint if exists profiles_communication_style_check;
alter table public.profiles add constraint profiles_communication_style_check
  check (communication_style in ('supportive','humorous','factual','gym'));
