-- Removable AI module. Billing never depends on these tables/functions.
create extension if not exists pg_cron with schema pg_catalog;
create table private.ai_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  allowance integer not null default 100 check(allowance>=0),
  created_at timestamptz not null default now(),
  reserved integer not null default 0 check(reserved>=0),
  consumed integer not null default 0 check(consumed>=0),
  unique(org_id),
  check(reserved+consumed<=allowance)
);
create table private.ai_chats (
  id uuid primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null default 'New chat',
  created_at timestamptz not null default clock_timestamp()
);
create index ai_chats_page on private.ai_chats(org_id,created_at desc,id desc);
create table private.ai_generations (
  id uuid primary key,
  chat_id uuid not null references private.ai_chats(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  credit_account_id uuid not null references private.ai_credit_accounts(id) on delete cascade,
  prompt text not null check(length(prompt) between 1 and 4000),
  output text not null default '' check(length(output)<=40000),
  status text not null check(status in ('streaming','completed','failed','stopped','expired')),
  lease uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default now()+interval '150 seconds',
  model text not null,
  provider_id text,
  input_tokens integer check(input_tokens>=0),
  output_tokens integer check(output_tokens>=0),
  cost_usd numeric(20,10) check(cost_usd>=0),
  credits_charged integer not null default 0 check(credits_charged in (0,1)),
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz
);
create index ai_generations_page on private.ai_generations(chat_id,created_at desc,id desc);
create index ai_generations_recovery on private.ai_generations(expires_at) where status='streaming';
create index ai_generations_rate on private.ai_generations(org_id,user_id,created_at);
create unique index ai_chat_one_stream on private.ai_generations(chat_id) where status='streaming';
alter table private.ai_credit_accounts enable row level security;
alter table private.ai_chats enable row level security;
alter table private.ai_generations enable row level security;
revoke all on private.ai_credit_accounts,private.ai_chats,private.ai_generations from public,anon,authenticated,service_role;

-- One grant per workspace, atomically with every creation path (signup, explicit,
-- or fallback). The allowance default above is the sole grant amount definition.
create function private.ai_grant_workspace() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into private.ai_credit_accounts(org_id) values(new.id) on conflict(org_id) do nothing;
  return new;
end $$;
revoke all on function private.ai_grant_workspace() from public,anon,authenticated,service_role;
create trigger on_workspace_created_ai after insert on public.organizations
for each row execute function private.ai_grant_workspace();
-- Existing workspaces receive the same one-time grant on installation.
insert into private.ai_credit_accounts(org_id) select id from public.organizations on conflict(org_id) do nothing;

create function private.ai_recover(target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare g private.ai_generations;
begin
  perform 1 from public.organizations where id=target for update;
  for g in select * from private.ai_generations where org_id=target and status='streaming' and expires_at<=now() order by id for update loop
    update private.ai_credit_accounts set reserved=reserved-1 where id=g.credit_account_id;
    update private.ai_generations set status='expired',finished_at=now() where id=g.id;
  end loop;
end $$;
create function private.ai_recover_all() returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  for target in select distinct org_id from private.ai_generations where status='streaming' and expires_at<=now() order by org_id limit 100 loop
    perform private.ai_recover(target);
  end loop;
end $$;
do $$ begin
  perform cron.schedule('forma-ai-recovery','* * * * *','select private.ai_recover_all()');
end $$;

-- User-scoped history API. No balance/output writes are exposed to members.
create function private.ai_history(target uuid,operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p private.ai_credit_accounts; result jsonb; target_chat uuid; boundary timestamptz; boundary_id uuid; g private.ai_generations;
begin
  perform 1 from public.organizations where id=target for update;
  if not private.is_verified_user() or not exists(select 1 from public.organization_members where org_id=target and user_id=auth.uid()) then raise insufficient_privilege; end if;
  perform private.ai_recover(target);
  boundary:=coalesce((payload->>'before')::timestamptz,'infinity'); boundary_id:=coalesce((payload->>'before_id')::uuid,'ffffffff-ffff-ffff-ffff-ffffffffffff');
  if operation='credits' then
    select * into p from private.ai_credit_accounts where org_id=target;
    return jsonb_build_object('allowance',coalesce(p.allowance,0),'reserved',coalesce(p.reserved,0),'consumed',coalesce(p.consumed,0),'available',coalesce(p.allowance-p.reserved-p.consumed,0));
  elsif operation='stop' then
    select * into g from private.ai_generations where id=(payload->>'id')::uuid and org_id=target and user_id=auth.uid() for update;
    if g.id is null then raise insufficient_privilege; end if;
    if g.status='streaming' then
      update private.ai_credit_accounts set reserved=reserved-1 where id=g.credit_account_id;
      update private.ai_generations set status='stopped',finished_at=now() where id=g.id;
    end if;
    return jsonb_build_object('status',case when g.status='streaming' then 'stopped' else g.status end);
  elsif operation='create' then
    target_chat:=(payload->>'id')::uuid;
    if (select count(*) from private.ai_chats where org_id=target and created_at>now()-interval '1 hour')>=30 then raise exception 'Chat creation limit reached'; end if;
    insert into private.ai_chats(id,org_id,created_by) values(target_chat,target,auth.uid()) on conflict(id) do nothing;
    if not exists(select 1 from private.ai_chats where id=target_chat and org_id=target) then raise insufficient_privilege; end if;
    return jsonb_build_object('id',target_chat);
  elsif operation='chats' then
    select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from
      (select id,title,created_at from private.ai_chats where org_id=target and (created_at,id)<(boundary,boundary_id) order by created_at desc,id desc limit 21) c;
    return result;
  elsif operation='messages' then
    target_chat:=(payload->>'chat_id')::uuid;
    if not exists(select 1 from private.ai_chats where id=target_chat and org_id=target) then raise insufficient_privilege; end if;
    select coalesce(jsonb_agg(to_jsonb(history_row)),'[]') into result from
      (select id,prompt,output,status,model,input_tokens,output_tokens,cost_usd,credits_charged,created_at,user_id=auth.uid() as is_mine from private.ai_generations
       where chat_id=target_chat and org_id=target and (created_at,id)<(boundary,boundary_id) order by created_at desc,id desc limit 21) history_row;
    return result;
  end if;
  raise exception 'Unknown history operation';
end $$;
create function public.ai_history(target uuid,operation text,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select private.ai_history(target,operation,payload); $$;

-- Trusted server protocol: reserve before provider call; lease gates checkpoint/settlement.
create function private.ai_run(operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; actor uuid; g private.ai_generations; p private.ai_credit_accounts; context jsonb; final_status text;
begin
  if operation='reserve' then
    target:=(payload->>'org_id')::uuid; actor:=(payload->>'user_id')::uuid;
    perform 1 from public.organizations where id=target for update;
    if not exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.org_id=target and u.id=actor and u.email_confirmed_at is not null) then raise insufficient_privilege; end if;
    if not exists(select 1 from private.ai_chats where id=(payload->>'chat_id')::uuid and org_id=target) then raise insufficient_privilege; end if;
    perform private.ai_recover(target);
    select * into g from private.ai_generations where id=(payload->>'id')::uuid;
    if found then
      if g.user_id is distinct from actor or g.org_id<>target or g.chat_id<>(payload->>'chat_id')::uuid or g.prompt is distinct from payload->>'prompt' then raise insufficient_privilege; end if;
      return jsonb_build_object('duplicate',true,'status',g.status);
    end if;
    if exists(select 1 from private.ai_generations where chat_id=(payload->>'chat_id')::uuid and status='streaming') then raise exception 'This chat already has a response in progress'; end if;
    if (select count(*) from private.ai_generations where org_id=target and status='streaming')>=3 then raise exception 'Workspace concurrency limit reached'; end if;
    if (select count(*) from private.ai_generations where org_id=target and user_id=actor and created_at>now()-interval '1 minute')>=10 then raise exception 'Please wait a minute before trying again'; end if;
    select * into p from private.ai_credit_accounts where org_id=target;
    if p.id is null or p.allowance-p.reserved-p.consumed<1 then raise exception 'No AI credits available for this workspace'; end if;
    insert into private.ai_generations(id,chat_id,org_id,user_id,credit_account_id,prompt,status,model)
    values((payload->>'id')::uuid,(payload->>'chat_id')::uuid,target,actor,p.id,payload->>'prompt','streaming',payload->>'model') returning * into g;
    update private.ai_credit_accounts set reserved=reserved+1 where id=p.id;
    update private.ai_chats set title=left(g.prompt,70) where id=g.chat_id and title='New chat';
    select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at,c.id),'[]') into context from
      (select id,prompt,output,created_at from private.ai_generations where chat_id=g.chat_id and status='completed' order by created_at desc,id desc limit 10) c;
    return jsonb_build_object('id',g.id,'lease',g.lease,'context',context);
  end if;
  select org_id into target from private.ai_generations where id=(payload->>'id')::uuid;
  perform 1 from public.organizations where id=target for update;
  perform private.ai_recover(target);
  select * into g from private.ai_generations where id=(payload->>'id')::uuid for update;
  if g.id is null or g.lease is distinct from (payload->>'lease')::uuid then raise insufficient_privilege; end if;
  if g.status<>'streaming' then
    -- Late provider accounting may still arrive after Stop/recovery. It never changes charges.
    if operation='settle' then
      update private.ai_generations set provider_id=coalesce(provider_id,payload->>'provider_id'),
        input_tokens=coalesce(input_tokens,(payload->>'input_tokens')::integer),output_tokens=coalesce(output_tokens,(payload->>'output_tokens')::integer),
        cost_usd=coalesce(cost_usd,(payload->>'cost_usd')::numeric) where id=g.id;
    end if;
    return jsonb_build_object('status',g.status);
  end if;
  if operation='checkpoint' then
    update private.ai_generations set output=coalesce(payload->>'output',output),provider_id=coalesce(payload->>'provider_id',provider_id) where id=g.id;
  elsif operation='settle' then
    final_status:=payload->>'status';
    if final_status not in ('completed','failed','stopped') then raise exception 'Invalid completion status'; end if;
    update private.ai_credit_accounts set reserved=reserved-1,consumed=consumed+case when final_status='completed' then 1 else 0 end where id=g.credit_account_id;
    update private.ai_generations set status=final_status,output=coalesce(payload->>'output',output),finished_at=now(),
      credits_charged=case when final_status='completed' then 1 else 0 end,provider_id=coalesce(payload->>'provider_id',provider_id),
      input_tokens=(payload->>'input_tokens')::integer,output_tokens=(payload->>'output_tokens')::integer,cost_usd=(payload->>'cost_usd')::numeric where id=g.id;
  else raise exception 'Unknown generation operation'; end if;
  return jsonb_build_object('status',coalesce(final_status,g.status));
end $$;
create function public.ai_run(operation text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.ai_run(operation,payload); $$;
revoke all on function private.ai_recover(uuid),private.ai_recover_all(),private.ai_history(uuid,text,jsonb),public.ai_history(uuid,text,jsonb),private.ai_run(text,jsonb),public.ai_run(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.ai_history(uuid,text,jsonb),public.ai_history(uuid,text,jsonb) to authenticated;
grant execute on function private.ai_run(text,jsonb),public.ai_run(text,jsonb) to service_role;
