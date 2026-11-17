-- LEVELD – initial schema
-- All user data lives in schema "public" and is isolated per user via Row Level Security.
-- Every table carries user_id (FK auth.users) and a policy "user_id = auth.uid()".
-- Phase-2+ tables are created now so the model is stable; the app uses them later.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  display_name          text not null default '' check (char_length(display_name) <= 80),
  goals                 text[] not null default '{}',
  habit_backlog         text[] not null default '{}',   -- activity ideas saved "for later" (guided mode)
  mode                  text not null default 'guided' check (mode in ('guided','custom')),
  locale                text not null default 'de' check (locale in ('de','en','pl','ru')),
  timezone              text not null default 'Europe/Berlin',
  default_reminder_time time,
  phase_threshold       numeric(3,2) not null default 0.80 check (phase_threshold between 0.5 and 1.0),
  phase_window_days     int not null default 14 check (phase_window_days between 7 and 90),
  onboarding_completed  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Habits / activities (fully user defined)
-- ---------------------------------------------------------------------------
create table public.habits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  category        text not null default 'general' check (char_length(category) <= 40),
  icon            text not null default 'circle' check (char_length(icon) <= 40),
  description     text not null default '' check (char_length(description) <= 1000),
  goal            text not null default '' check (char_length(goal) <= 500),
  schedule_type   text not null default 'daily' check (schedule_type in ('daily','weekdays','times_per_week')),
  weekdays        smallint[] not null default '{1,2,3,4,5,6,7}',   -- ISO 1=Mon..7=Sun
  times_per_week  smallint check (times_per_week between 1 and 7),
  reminder_time   time,
  reminder_enabled boolean not null default false,
  start_date      date not null default current_date,
  phase           smallint not null default 1 check (phase between 1 and 5),
  status          text not null default 'active' check (status in ('active','paused','archived')),
  -- [{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" | null }] – paused days are never counted as failure
  pause_periods   jsonb not null default '[]'::jsonb,
  sort_order      int not null default 0,
  phase_suggestion_dismissed_until date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint weekdays_valid check (weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]),
  constraint tpw_required check (schedule_type <> 'times_per_week' or times_per_week is not null)
);
create index habits_user_idx on public.habits(user_id, status);

-- Configurable tracking fields per habit ("Habit Depth").
-- min_phase: from which development phase the field is shown in the entry form.
create table public.field_definitions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  habit_id    uuid not null references public.habits(id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_]{1,40}$'),
  label       text not null check (char_length(label) between 1 and 60),
  type        text not null check (type in ('number','duration_min','text','boolean','time','rating_1_5')),
  unit        text not null default '' check (char_length(unit) <= 20),
  min_phase   smallint not null default 2 check (min_phase between 1 and 5),
  sort_order  int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (habit_id, key)
);

-- One entry per habit and local day -> no duplicates (unique constraint).
-- habit_name_snapshot keeps history readable after a rename.
-- field_values: { field_key: value } – unit/label snapshot is stored in field_snapshot.
create table public.habit_entries (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  habit_id            uuid not null references public.habits(id) on delete cascade,
  local_date          date not null,
  status              text not null check (status in ('done','skipped','paused','postponed')),
  postponed_to        date,
  field_values        jsonb not null default '{}'::jsonb,
  field_snapshot      jsonb not null default '[]'::jsonb,
  habit_name_snapshot text not null,
  note                text not null default '' check (char_length(note) <= 2000),
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (habit_id, local_date),
  constraint postponed_needs_target check (status <> 'postponed' or (postponed_to is not null and postponed_to > local_date))
);
create index habit_entries_user_date_idx on public.habit_entries(user_id, local_date);

create table public.habit_phase_changes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  habit_id    uuid not null references public.habits(id) on delete cascade,
  from_phase  smallint not null,
  to_phase    smallint not null check (to_phase between 1 and 5),
  reason      text not null default 'user' check (reason in ('user','suggestion_accepted')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Phase 2: training, measurements, intake, nutrition, steps, reminders
-- ---------------------------------------------------------------------------
create table public.exercises (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  kind       text not null default 'strength' check (kind in ('strength','endurance','skill','other')),
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workouts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  habit_id         uuid references public.habits(id) on delete set null,
  habit_entry_id   uuid references public.habit_entries(id) on delete set null,
  started_at       timestamptz not null,
  duration_min     numeric check (duration_min >= 0),
  note             text not null default '',
  source           text not null default 'manual' check (source in ('manual','ai_import')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.workout_sets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  workout_id    uuid not null references public.workouts(id) on delete cascade,
  exercise_id   uuid references public.exercises(id) on delete set null,
  exercise_name_snapshot text not null,
  set_index     smallint not null,
  reps          int check (reps >= 0),
  weight        numeric check (weight >= 0),
  weight_unit   text check (weight_unit in ('kg','lb')),
  distance_m    numeric check (distance_m >= 0),
  duration_s    numeric check (duration_s >= 0),
  extra         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create table public.metric_definitions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_]{1,40}$'),
  label       text not null,
  unit        text not null default '',
  enabled     boolean not null default true,
  sensitive   boolean not null default true,
  frequency   text not null default 'daily',
  created_at  timestamptz not null default now(),
  unique (user_id, key)
);

create table public.measurements (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  metric_id     uuid not null references public.metric_definitions(id) on delete cascade,
  measured_at   timestamptz not null,
  value         numeric not null,
  unit          text not null,             -- unit at time of measurement
  source        text not null default 'manual' check (source in ('manual','apple_health','health_connect')),
  external_id   text,                      -- dedup key for imports
  note          text not null default '',
  created_at    timestamptz not null default now(),
  unique (user_id, source, external_id)
);

create table public.daily_steps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  local_date  date not null,
  steps       int not null check (steps >= 0),
  source      text not null default 'manual' check (source in ('manual','apple_health','health_connect')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, local_date, source)      -- one value per day and source; app picks one source per day -> no double counting
);

create table public.medications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('supplement','medication')),
  dose        numeric,
  dose_unit   text not null default '',
  note        text not null default '',
  start_date  date,
  end_date    date,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.intake_schedules (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  medication_id  uuid not null references public.medications(id) on delete cascade,
  time_of_day    time not null,
  weekdays       smallint[] not null default '{1,2,3,4,5,6,7}',
  reminder_enabled boolean not null default false,
  created_at     timestamptz not null default now()
);

create table public.intake_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  medication_id  uuid not null references public.medications(id) on delete cascade,
  schedule_id    uuid references public.intake_schedules(id) on delete set null,
  planned_for    timestamptz,
  taken_at       timestamptz,
  status         text not null check (status in ('taken','skipped','postponed')),
  dose_snapshot  text not null default '',
  note           text not null default '',
  created_at     timestamptz not null default now(),
  unique (schedule_id, planned_for)
);

create table public.meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  eaten_at    timestamptz not null,
  meal_type   text not null default 'other' check (meal_type in ('breakfast','lunch','dinner','snack','other')),
  note        text not null default '',
  source      text not null default 'manual' check (source in ('manual','ai_text','ai_photo')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.meal_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  meal_id      uuid not null references public.meals(id) on delete cascade,
  food_name    text not null,
  amount       numeric,
  amount_unit  text,
  kcal         numeric,
  protein_g    numeric,
  carbs_g      numeric,
  fat_g        numeric,
  estimated    boolean not null default false,  -- true when AI estimated values
  created_at   timestamptz not null default now()
);

create table public.reminders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  target_type  text not null check (target_type in ('habit','medication','meal','custom')),
  target_id    uuid,
  time_of_day  time not null,
  weekdays     smallint[] not null default '{1,2,3,4,5,6,7}',
  enabled      boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  range_start  date not null,
  range_end    date not null,
  config       jsonb not null,       -- selected categories/metrics/charts, ai summary yes/no
  format       text not null check (format in ('pdf','csv','xlsx')),
  storage_path text,                 -- private bucket path; never shared automatically
  created_at   timestamptz not null default now(),
  check (range_end >= range_start)
);

-- Consent per AI feature (data minimisation: AI only sees data the user granted)
create table public.ai_consents (
  user_id     uuid not null references auth.users(id) on delete cascade,
  feature     text not null check (feature in ('nl_entry','summaries','plan_import','meal_estimate','suggestions')),
  data_scopes text[] not null default '{}',
  granted_at  timestamptz not null default now(),
  primary key (user_id, feature)
);

-- ---------------------------------------------------------------------------
-- Integrity: child rows must belong to same user as parent habit
-- ---------------------------------------------------------------------------
create or replace function public.assert_habit_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.habits h where h.id = new.habit_id and h.user_id = new.user_id) then
    raise exception 'habit % does not belong to user', new.habit_id using errcode = '42501';
  end if;
  return new;
end $$;

create trigger field_definitions_owner before insert or update on public.field_definitions
  for each row execute function public.assert_habit_owner();
create trigger habit_entries_owner before insert or update on public.habit_entries
  for each row execute function public.assert_habit_owner();
create trigger habit_phase_changes_owner before insert or update on public.habit_phase_changes
  for each row execute function public.assert_habit_owner();

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles','habits','field_definitions','habit_entries','exercises','workouts',
                           'daily_steps','medications','meals']
  loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security: every table, owner-only
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','habits','field_definitions','habit_entries','habit_phase_changes',
                           'exercises','workouts','workout_sets','metric_definitions','measurements',
                           'daily_steps','medications','intake_schedules','intake_logs','meals','meal_items',
                           'reminders','reports','ai_consents']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I_owner on public.%I for all to authenticated
                     using (user_id = auth.uid()) with check (user_id = auth.uid())$p$, t, t);
  end loop;
end $$;

-- Auto-create profile on sign-up
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- GDPR: user can delete their account incl. all data (cascade from auth.users)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
