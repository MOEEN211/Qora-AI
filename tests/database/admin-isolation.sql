begin;
do $$
declare u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); email text; org uuid;
begin
 email:='admin-sql-'||u||'@example.invalid';
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
 values(u,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,now(),'{}',now(),now()),
 (v,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin-sql-'||v||'@example.invalid',now(),'{}',now(),now());
 insert into auth.sessions(id,user_id,aal,created_at,updated_at) values(s,u,'aal1',now(),now());
 perform private.operator_command(email,true);
 perform set_config('test.operator',u::text,true);perform set_config('test.other',v::text,true);perform set_config('test.session',s::text,true);
 select org_id into org from public.organization_members where user_id=u limit 1;perform set_config('test.workspace',org::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','session_id',s,'aal','aal1')::text,true);
end $$;
set local role authenticated;
do $$begin
 if not (public.operator_status()->>'eligible')::boolean then raise exception 'Expected eligible operator';end if;
 if not (public.operator_status()->>'verified')::boolean then raise exception 'Ordinary operator login denied';end if;
 begin perform private.operator_command('arbitrary@example.invalid',true);raise exception 'Command bypass';exception when insufficient_privilege then null;end;
 begin perform 1 from private.operator_users;raise exception 'Table bypass';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.operator'),'role','authenticated','session_id',current_setting('test.session'),'aal','aal1')::text,true);
 if not (public.operator_status()->>'verified')::boolean then raise exception 'Ordinary session should pass';end if;
 perform public.operator_read('users');perform public.operator_read('workspaces');perform public.operator_read('bugs');perform public.operator_read('features');perform public.operator_read('admins');
 perform public.report_app_activity(current_setting('test.workspace')::uuid);perform public.report_app_activity(current_setting('test.workspace')::uuid);
 perform public.operator_read('overview');perform public.operator_read('subscriptions');perform public.operator_read('usage');
 perform public.operator_read('users',jsonb_build_object('id',current_setting('test.operator')));
 perform public.operator_read('workspaces',jsonb_build_object('id',current_setting('test.workspace')));
 perform public.operator_read('users','{"q":"%_'';select 1;--"}');
 perform public.manage_operator('admin-sql-'||current_setting('test.other')||'@example.invalid',true);
 perform public.manage_operator('admin-sql-'||current_setting('test.other')||'@example.invalid',true);
 perform public.manage_operator('admin-sql-'||current_setting('test.other')||'@example.invalid',false);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.other'),'role','authenticated','session_id',current_setting('test.session'),'aal','aal1','is_admin',true)::text,true);
 begin perform public.operator_read('users');raise exception 'Ordinary account or editable metadata authorized admin';exception when insufficient_privilege then null;end;
 begin perform public.manage_operator('admin-sql-'||current_setting('test.other')||'@example.invalid',true);raise exception 'Self-promotion allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.operator'),'role','authenticated','aal','aal1')::text,true);
 begin perform public.operator_read('users');raise exception 'Missing current session accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.operator'),'role','authenticated','session_id',current_setting('test.session'),'aal','aal1','client_id',gen_random_uuid())::text,true);
 begin perform public.operator_read('users');raise exception 'Delegated OAuth bypass';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if (select count(*) from private.workspace_activity_daily where org_id=current_setting('test.workspace')::uuid)<>1 then raise exception 'Duplicate activity';end if;
 if (select count(*) from private.operator_events where target_id=current_setting('test.other')::uuid)<>2 then raise exception 'Duplicate audit';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.operator'),'role','authenticated','session_id',current_setting('test.session'),'aal','aal1')::text,true);
end $$;
do $$
declare i integer; row_id uuid; first_page jsonb; next_page jsonb; org uuid:=current_setting('test.workspace')::uuid; chat uuid:=gen_random_uuid(); credit uuid; report jsonb;
begin
 for i in 1..28 loop
 row_id:=gen_random_uuid();
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
 values(row_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin-sql-'||row_id||'@example.invalid',now(),'{}',now(),now());
 end loop;
 first_page:=public.operator_read('users','{"q":"admin-sql-"}');
 next_page:=public.operator_read('users',jsonb_build_object('q','admin-sql-','page',1,'cursor',first_page->'next_cursor'));
 if jsonb_array_length(first_page->'rows')<>25 or jsonb_array_length(next_page->'rows')<>5 then raise exception 'Cursor pagination lost rows';end if;
 if exists(select 1 from jsonb_array_elements(first_page->'rows') a join jsonb_array_elements(next_page->'rows') b on a->>'id'=b->>'id') then raise exception 'Cursor repeated rows';end if;
 if to_regprocedure('private.operator_ai_usage(jsonb)') is not null then
 select id into credit from private.ai_credit_accounts where org_id=org;
 insert into private.ai_chats(id,org_id,created_by,title) values(chat,org,auth.uid(),'SECRET-TITLE');
 insert into private.ai_generations(id,chat_id,org_id,user_id,credit_account_id,prompt,output,status,expires_at,model)
 values(gen_random_uuid(),chat,org,auth.uid(),credit,'SECRET-PROMPT','SECRET-OUTPUT','stopped',now(),'fixture');
 report:=public.operator_read('usage',jsonb_build_object('workspace',org));
 if report::text like '%SECRET-%' or (report->'summary'->>'missing_cost')::int<>1 or report->'summary'->'cost_usd'<>'null'::jsonb then raise exception 'AI privacy or unknown-cost accounting failed';end if;
 end if;
 if to_regprocedure('private.operator_billing_overview(text,timestamptz)') is not null then
 perform public.operator_read('subscriptions','{"interval":"month","canceling":"false"}');
 perform public.operator_read('subscription-history',jsonb_build_object('id',gen_random_uuid()));
 end if;
 perform public.operator_read('workspaces','{"active":"true"}');
end $$;
do $$begin
 if (select count(*) from private.operator_users)=1 then
 begin delete from private.operator_users where user_id=current_setting('test.operator')::uuid;raise exception 'Last operator removed';exception when raise_exception then if sqlerrm='Last operator removed' then raise;end if;end;
 begin delete from auth.users where id=current_setting('test.operator')::uuid;raise exception 'Last operator account deleted';exception when raise_exception then if sqlerrm='Last operator account deleted' then raise;end if;end;
 end if;
 update auth.sessions set not_after=now()-interval '1 minute' where id=current_setting('test.session')::uuid;
 if private.operator_verified() then raise exception 'Expired session accepted';end if;
 delete from auth.sessions where id=current_setting('test.session')::uuid;
 if private.operator_verified() then raise exception 'Logged-out session accepted';end if;
end $$;
rollback;
