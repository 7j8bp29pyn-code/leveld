\set ON_ERROR_STOP on
insert into auth.users(id,email) values ('77777777-7777-7777-7777-777777777777','g@test'),('88888888-8888-8888-8888-888888888888','h@test');
set role authenticated;
select set_config('request.jwt.claim.sub','77777777-7777-7777-7777-777777777777', false);
insert into public.todos(user_id,title,due_date) values ('77777777-7777-7777-7777-777777777777','Physio-Termin vereinbaren','2026-11-21');
update public.profiles set communication_style = 'gym';
do $$ begin
  begin
    update public.profiles set communication_style = 'drill_sergeant';
    raise exception 'unknown style allowed';
  exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','88888888-8888-8888-8888-888888888888', false);
do $$ begin assert (select count(*) from public.todos) = 0, 'todos isolated'; end $$;
update public.todos set title = 'hacked';
reset role;
do $$ begin
  assert (select title from public.todos limit 1) = 'Physio-Termin vereinbaren', 'foreign update blocked';
  assert (select communication_style from public.profiles where user_id = '77777777-7777-7777-7777-777777777777') = 'gym', 'gym style saved';
end $$;
select 'MIGRATION 4 TESTS PASSED' as result;
