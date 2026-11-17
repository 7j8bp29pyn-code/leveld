-- RLS / integrity tests. Run via scripts/test-db.sh. Any failed assertion raises.
\set ON_ERROR_STOP on
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

insert into auth.users(id,email) values
 ('11111111-1111-1111-1111-111111111111','a@test'),
 ('22222222-2222-2222-2222-222222222222','b@test');

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'profiles auto-created';
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);

insert into public.habits(id,user_id,name) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Pole Dance');
insert into public.habit_entries(user_id,habit_id,local_date,status,habit_name_snapshot)
  values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','2026-11-16','done','Pole Dance');

-- duplicate entry for same day must fail
do $$ begin
  begin
    insert into public.habit_entries(user_id,habit_id,local_date,status,habit_name_snapshot)
      values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','2026-11-16','done','x');
    raise exception 'duplicate allowed';
  exception when unique_violation then null; end;
end $$;

-- rename keeps snapshot
update public.habits set name='Tennis' where id='aaaaaaaa-0000-0000-0000-000000000001';
do $$ begin
  assert (select habit_name_snapshot from public.habit_entries limit 1) = 'Pole Dance', 'snapshot kept';
end $$;

-- user A cannot insert rows for user B
do $$ begin
  begin
    insert into public.habits(user_id,name) values ('22222222-2222-2222-2222-222222222222','evil');
    raise exception 'cross-user insert allowed';
  exception when insufficient_privilege then null; end;
end $$;

-- switch to user B: sees nothing of A, cannot update/delete A's rows
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
do $$ begin
  assert (select count(*) from public.habits) = 0, 'B sees no habits';
  assert (select count(*) from public.habit_entries) = 0, 'B sees no entries';
  assert (select count(*) from public.profiles) = 1, 'B sees only own profile';
end $$;
update public.habits set name='hacked' where id='aaaaaaaa-0000-0000-0000-000000000001';
delete from public.habit_entries;

-- B cannot attach an entry to A's habit even with own user_id
do $$ begin
  begin
    insert into public.habit_entries(user_id,habit_id,local_date,status,habit_name_snapshot)
      values ('22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000001','2026-11-17','done','x');
    raise exception 'foreign habit attach allowed';
  exception when insufficient_privilege then null; end;
end $$;

-- postponed needs a later target date
do $$ begin
  begin
    insert into public.habits(id,user_id,name) values ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Lesen');
    insert into public.habit_entries(user_id,habit_id,local_date,status,habit_name_snapshot)
      values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000001','2026-11-17','postponed','Lesen');
    raise exception 'postponed without target allowed';
  exception when check_violation then null; end;
end $$;

-- account deletion removes all own data
select public.delete_my_account();
reset role;
do $$ begin
  assert (select name from public.habits where id='aaaaaaaa-0000-0000-0000-000000000001') = 'Tennis', 'A unaffected by B';
  assert (select count(*) from public.habit_entries) = 1, 'A entry intact';
  assert not exists (select 1 from auth.users where id='22222222-2222-2222-2222-222222222222'), 'B deleted';
  assert not exists (select 1 from public.profiles where user_id='22222222-2222-2222-2222-222222222222'), 'B profile cascaded';
end $$;
select 'RLS TESTS PASSED' as result;
