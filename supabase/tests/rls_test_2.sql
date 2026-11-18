-- Tests for migration 2 (levels, check-ins, cycles, day schedules). Runs after rls_test.sql.
\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
insert into auth.users(id,email) values ('33333333-3333-3333-3333-333333333333','c@test'),('44444444-4444-4444-4444-444444444444','d@test');

-- existing rows from before the update are still valid and got defaults
do $$ begin
  assert (select kind from public.habits where id='aaaaaaaa-0000-0000-0000-000000000001') = 'habit', 'habit kind default';
  assert (select communication_style from public.profiles where user_id='11111111-1111-1111-1111-111111111111') = 'supportive', 'style default';
  assert (select training_level from public.profiles where user_id='11111111-1111-1111-1111-111111111111') is null, 'level not asked yet';
  assert (select status from public.habit_entries limit 1) = 'done', 'old entry intact';
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
insert into public.habits(id,user_id,name,kind) values ('cccccccc-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','Krafttraining','training');
insert into public.habit_entries(user_id,habit_id,local_date,status,habit_name_snapshot,rpe)
  values ('33333333-3333-3333-3333-333333333333','cccccccc-0000-0000-0000-000000000001','2026-11-17','adapted','Krafttraining',6),
         ('33333333-3333-3333-3333-333333333333','cccccccc-0000-0000-0000-000000000001','2026-11-18','health_pause','Krafttraining',null);
insert into public.daily_checkins(user_id,local_date,readiness,symptoms) values ('33333333-3333-3333-3333-333333333333','2026-11-18','sick','{fever}');
insert into public.training_cycles(user_id,name,phase,start_date,end_date) values ('33333333-3333-3333-3333-333333333333','Block 1','load','2026-11-01','2026-11-28');
insert into public.day_schedules(user_id,local_date,shift,anchors) values ('33333333-3333-3333-3333-333333333333','2026-11-18','night','{"wake":"14:00","firstMeal":"15:00","workEnd":"06:30","bedtime":"08:00"}');

do $$ begin
  begin
    insert into public.daily_checkins(user_id,local_date,readiness) values ('33333333-3333-3333-3333-333333333333','2026-11-18','fit');
    raise exception 'duplicate check-in allowed';
  exception when unique_violation then null; end;
  begin
    insert into public.daily_checkins(user_id,local_date,readiness,symptoms) values ('33333333-3333-3333-3333-333333333333','2026-11-19','fit','{diagnosis_x}');
    raise exception 'unknown symptom allowed';
  exception when check_violation then null; end;
  begin
    insert into public.habit_entries(user_id,habit_id,local_date,status,habit_name_snapshot,rpe)
      values ('33333333-3333-3333-3333-333333333333','cccccccc-0000-0000-0000-000000000001','2026-11-19','done','x',11);
    raise exception 'rpe 11 allowed';
  exception when check_violation then null; end;
end $$;

-- other user sees none of the health data
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444', false);
do $$ begin
  assert (select count(*) from public.daily_checkins) = 0, 'check-ins isolated';
  assert (select count(*) from public.training_cycles) = 0, 'cycles isolated';
  assert (select count(*) from public.day_schedules) = 0, 'schedules isolated';
  begin
    insert into public.daily_checkins(user_id,local_date,readiness) values ('33333333-3333-3333-3333-333333333333','2026-11-20','fit');
    raise exception 'cross-user check-in insert allowed';
  exception when insufficient_privilege then null; end;
end $$;
delete from public.daily_checkins; -- affects nothing of user C

-- user C deletes own health data
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
do $$ begin assert (select count(*) from public.daily_checkins) = 1, 'C data survived D delete'; end $$;
delete from public.daily_checkins;
do $$ begin assert (select count(*) from public.daily_checkins) = 0, 'own health data deleted'; end $$;
select public.delete_my_account();
reset role;
do $$ begin
  assert not exists (select 1 from public.training_cycles where user_id='33333333-3333-3333-3333-333333333333'), 'cycles cascade on account delete';
end $$;
select 'MIGRATION 2 TESTS PASSED' as result;
