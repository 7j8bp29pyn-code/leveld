-- LEVELD – Update 2: training level, daily readiness check-in, recovery statuses,
-- training cycles and shift work / day rhythm.
-- Additive only: no existing column is removed, existing data stays valid.
-- Idempotent: safe to run more than once.

-- ---------------------------------------------------------------------------
-- Profile: long-term training level (self-assessment) & preferences
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists training_level text check (training_level in ('beginner','occasional','regular','structured')),
  add column if not exists training_goals text[] not null default '{}',
  add column if not exists start_preference text check (start_preference in ('existing_plan','generate_plan','habits_only')),
  add column if not exists training_days smallint[] not null default '{}',
  add column if not exists training_settings text[] not null default '{}',
  -- voluntary, sensitive free text
  add column if not exists training_limitations text not null default '' check (char_length(training_limitations) <= 1000),
  add column if not exists communication_style text not null default 'supportive' check (communication_style in ('supportive','humorous','factual')),
  add column if not exists features jsonb not null default '{"detailedLogging":false,"rpe":false,"cycles":false,"checkin":false}'::jsonb,
  -- consent to process health data (daily check-in); null = no consent
  add column if not exists health_consent_at timestamptz,
  add column if not exists day_rhythm text not null default 'standard' check (day_rhythm in ('standard','early','late','night','rotating','custom')),
  add column if not exists day_anchors jsonb not null default '{"wake":"07:00","firstMeal":"08:00","workEnd":"17:00","bedtime":"23:00"}'::jsonb,
  add column if not exists day_start_hour smallint not null default 3 check (day_start_hour between 0 and 14);

-- ---------------------------------------------------------------------------
-- Habits: kind + relative reminders
-- ---------------------------------------------------------------------------
alter table public.habits
  add column if not exists kind text not null default 'habit' check (kind in ('habit','training','recovery')),
  add column if not exists reminder_anchor text check (reminder_anchor in ('wake','first_meal','work_end','bedtime')),
  add column if not exists reminder_offset_min smallint not null default 0 check (reminder_offset_min between -240 and 240);

-- ---------------------------------------------------------------------------
-- Entries: recovery-aware statuses + subjective exertion
-- ---------------------------------------------------------------------------
alter table public.habit_entries drop constraint if exists habit_entries_status_check;
alter table public.habit_entries add constraint habit_entries_status_check
  check (status in ('done','adapted','recovery','health_pause','skipped','paused','postponed'));
alter table public.habit_entries
  add column if not exists rpe smallint check (rpe between 1 and 10);

-- ---------------------------------------------------------------------------
-- Daily check-in (current form) – sensitive health data, separate table
-- ---------------------------------------------------------------------------
create table if not exists public.daily_checkins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  local_date    date not null,
  readiness     text not null check (readiness in ('fit','tired','exhausted','sick')),
  sleep_hours   numeric(4,1) check (sleep_hours between 0 and 24),
  sleep_quality smallint check (sleep_quality between 1 and 5),
  stress        smallint check (stress between 1 and 5),
  soreness      smallint check (soreness between 0 and 3),
  symptoms      text[] not null default '{}' check (symptoms <@ array['sore_throat','fever','cough','other_symptoms','pain_injury']),
  red_flags     text[] not null default '{}' check (red_flags <@ array['chest_pain','breathlessness','circulation']),
  note          text not null default '' check (char_length(note) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, local_date)
);

-- ---------------------------------------------------------------------------
-- Training cycles (manually configured – never generated unchecked by AI)
-- ---------------------------------------------------------------------------
create table if not exists public.training_cycles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 80),
  goal              text not null default '' check (char_length(goal) <= 500),
  phase             text not null check (phase in ('build','load','deload','maintain')),
  start_date        date not null,
  end_date          date not null,
  sessions_per_week smallint check (sessions_per_week between 0 and 14),
  rest_weekdays     smallint[] not null default '{}' check (rest_weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]),
  notes             text not null default '' check (char_length(notes) <= 2000),
  confirmed_by      text not null default 'user' check (confirmed_by in ('user','coach')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- Per-day schedule for rotating / irregular shifts
-- ---------------------------------------------------------------------------
create table if not exists public.day_schedules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  local_date  date not null,
  shift       text not null check (shift in ('early','late','night','off','custom')),
  anchors     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, local_date)
);

-- RLS + updated_at for the new tables
do $$
declare t text;
begin
  foreach t in array array['daily_checkins','training_cycles','day_schedules']
  loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_owner') then
      execute format($p$create policy %I on public.%I for all to authenticated
                       using (user_id = auth.uid()) with check (user_id = auth.uid())$p$, t || '_owner', t);
    end if;
    if not exists (select 1 from pg_trigger where tgname = t || '_updated_at') then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    end if;
  end loop;
end $$;

-- Supabase exposes new tables to the API roles via default privileges; make it explicit.
grant select, insert, update, delete on public.daily_checkins, public.training_cycles, public.day_schedules to authenticated;
