-- Tests for migration 3 (training plan uploads + private storage).
\set ON_ERROR_STOP on
insert into auth.users(id,email) values ('55555555-5555-5555-5555-555555555555','e@test'),('66666666-6666-6666-6666-666666666666','f@test');
do $$ begin
  assert (select public from storage.buckets where id = 'training-plans') = false, 'bucket must be private';
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
insert into storage.objects(bucket_id,name) values ('training-plans','55555555-5555-5555-5555-555555555555/plan.pdf');
insert into public.training_plans(user_id,title,storage_path,mime_type,size_bytes)
  values ('55555555-5555-5555-5555-555555555555','Plan','55555555-5555-5555-5555-555555555555/plan.pdf','application/pdf',1000);
do $$ begin
  begin
    insert into storage.objects(bucket_id,name) values ('training-plans','66666666-6666-6666-6666-666666666666/evil.pdf');
    raise exception 'upload into foreign folder allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.training_plans(user_id,title,storage_path,mime_type,size_bytes)
      values ('55555555-5555-5555-5555-555555555555','x','66666666-6666-6666-6666-666666666666/x.pdf','application/pdf',1);
    raise exception 'path outside own folder allowed';
  exception when check_violation then null; end;
  begin
    insert into public.training_plans(user_id,title,storage_path,mime_type,size_bytes)
      values ('55555555-5555-5555-5555-555555555555','x','55555555-5555-5555-5555-555555555555/x.exe','application/x-msdownload',1);
    raise exception 'exe allowed';
  exception when check_violation then null; end;
end $$;

select set_config('request.jwt.claim.sub','66666666-6666-6666-6666-666666666666', false);
do $$ begin
  assert (select count(*) from storage.objects) = 0, 'foreign files invisible';
  assert (select count(*) from public.training_plans) = 0, 'foreign plans invisible';
end $$;
delete from storage.objects;  -- must not delete E's file

reset role;
do $$ begin assert (select count(*) from storage.objects) = 1, 'E file survived F delete'; end $$;
select 'MIGRATION 3 TESTS PASSED' as result;
