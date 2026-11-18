-- LEVELD – Update 3: upload of existing training plans (photo / PDF).
-- Files live in a PRIVATE storage bucket; every user can only access files under "<user_id>/…".
-- Additive & idempotent: safe to run more than once.

create table if not exists public.training_plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  storage_path text not null unique,
  mime_type    text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/heic','image/webp')),
  size_bytes   integer not null check (size_bytes between 1 and 10485760),
  note         text not null default '' check (char_length(note) <= 2000),
  created_at   timestamptz not null default now(),
  -- the path must be inside the owner's folder
  check (split_part(storage_path, '/', 1) = user_id::text)
);

alter table public.training_plans enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'training_plans' and policyname = 'training_plans_owner') then
    create policy training_plans_owner on public.training_plans for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
grant select, insert, update, delete on public.training_plans to authenticated;

-- Private bucket, max 10 MB, only PDFs and images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('training-plans', 'training-plans', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/heic','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies: own folder only (read, upload, delete)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'training_plans_read_own') then
    create policy training_plans_read_own on storage.objects for select to authenticated
      using (bucket_id = 'training-plans' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'training_plans_insert_own') then
    create policy training_plans_insert_own on storage.objects for insert to authenticated
      with check (bucket_id = 'training-plans' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'training_plans_delete_own') then
    create policy training_plans_delete_own on storage.objects for delete to authenticated
      using (bucket_id = 'training-plans' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
