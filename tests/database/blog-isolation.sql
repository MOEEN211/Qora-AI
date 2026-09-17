begin;
select set_config('test.blog_slug','blog-test-'||replace(gen_random_uuid()::text,'-',''),true);
insert into public.blog_posts(slug,title,excerpt,category,author,content,reading_minutes,status,published_at)
select current_setting('test.blog_slug')||suffix,'Test story','Test excerpt','Test','Test author',
  '[{"heading":"Test section","paragraphs":["Test content"]}]'::jsonb,1,status,published_at
from (values ('-public','published',now()-interval '1 day'),('-draft','draft',now()-interval '1 day'),('-future','published',now()+interval '1 day')) as fixtures(suffix,status,published_at);
set local role anon;
do $$ begin
  if (select count(*) from public.blog_posts where slug like current_setting('test.blog_slug')||'%') <> 1 then raise exception 'Anonymous draft/scheduled visibility failed'; end if;
  begin
    insert into public.blog_posts(slug,title,excerpt,category,author,content,reading_minutes) values ('unauthorized','x','x','x','x','[{}]',1);
    raise exception 'Anonymous insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.blog_posts set status='draft' where slug=current_setting('test.blog_slug')||'-public';
    raise exception 'Anonymous update allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.blog_posts where slug=current_setting('test.blog_slug')||'-public';
    raise exception 'Anonymous delete allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.blog_posts where slug like current_setting('test.blog_slug')||'%') <> 1 then raise exception 'Customer draft/scheduled visibility failed'; end if;
  begin
    insert into public.blog_posts(slug,title,excerpt,category,author,content,reading_minutes) values ('unauthorized','x','x','x','x','[{}]',1);
    raise exception 'Customer insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.blog_posts set title='Changed' where slug=current_setting('test.blog_slug')||'-public';
    raise exception 'Customer update allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.blog_posts where slug=current_setting('test.blog_slug')||'-public';
    raise exception 'Customer delete allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
