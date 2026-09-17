-- Auth imports and database fixtures may omit created_at. Reporting must not block signup.
create or replace function private.report_signup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.reporting_state) then
 insert into private.reporting_signups_daily(day,count) values((coalesce(new.created_at,now()) at time zone 'UTC')::date,1)
 on conflict(day) do update set count=reporting_signups_daily.count+1;
 end if;return new;
end $$;

create or replace function private.operator_change(target_email text,grant_access boolean,actor uuid,origin text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; changed boolean:=false;
begin
 perform private.lock_workspace_lifecycle();
 if length(target_email)>254 or length(trim(target_email))<3 then raise exception 'Enter a valid account email.';end if;
 select id into target from auth.users where lower(email)=lower(trim(target_email)) and (not grant_access or email_confirmed_at is not null);
 if target is null then raise exception 'Account not found, or not confirmed for an admin grant.';end if;
 if grant_access then
 insert into private.operator_users(user_id,granted_by) values(target,actor) on conflict do nothing;
 changed:=found;
 else
 delete from private.operator_users where user_id=target;
 changed:=found;
 end if;
 if changed then insert into private.operator_events(actor_id,target_id,action,source) values(actor,target,case when grant_access then 'grant' else 'revoke' end,origin);end if;
 return jsonb_build_object('changed',changed,'user_id',target,'granted',grant_access);
end $$;
