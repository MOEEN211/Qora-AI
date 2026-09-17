-- Each workspace has its own subscription. Only owners/admins manage billing.
create table private.billing_catalog (
  mode text primary key check(mode in ('test','live')),
  stripe_account text not null,
  catalog jsonb not null check(jsonb_typeof(catalog)='array'),
  updated_at timestamptz not null default now()
);
create table private.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  mode text not null references private.billing_catalog(mode),
  stripe_account text not null,
  customer_id text,
  customer_attempt jsonb,
  checkout_attempt jsonb,
  lease uuid,
  lease_until timestamptz,
  synced_at timestamptz,
  attempted_at timestamptz,
  unique(org_id,mode), unique(stripe_account,mode,customer_id)
);
create table private.billing_subscriptions (
  account_id uuid primary key references private.billing_accounts(id) on delete cascade,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);
create table private.billing_events (
  account_id uuid not null references private.billing_accounts(id),
  event_id text not null,
  completed_at timestamptz not null default now(),
  primary key(account_id,event_id)
);
alter table private.billing_catalog enable row level security;
alter table private.billing_accounts enable row level security;
alter table private.billing_subscriptions enable row level security;
alter table private.billing_events enable row level security;
revoke all on private.billing_catalog,private.billing_accounts,private.billing_subscriptions,private.billing_events from public,anon,authenticated;

create function private.my_billing(target_mode text,target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare account private.billing_accounts; catalog private.billing_catalog;
begin
  if not private.can_manage_org(target) then raise exception 'Not permitted'; end if;
  select * into catalog from private.billing_catalog where mode=target_mode;
  select * into account from private.billing_accounts where org_id=target and mode=target_mode;
  return jsonb_build_object('ready',catalog.mode is not null,'mode',target_mode,'catalog',coalesce(catalog.catalog,'[]'::jsonb),
    'snapshot',coalesce((select snapshot from private.billing_subscriptions where account_id=account.id),'{"status":"none","paid":false}'::jsonb),
    'customer',account.customer_id is not null,'synced_at',account.synced_at);
end;
$$;
create function public.my_billing(target_mode text,target uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.my_billing(target_mode,target); $$;
revoke all on function private.my_billing(text,uuid),public.my_billing(text,uuid) from public,anon,authenticated;
grant execute on function private.my_billing(text,uuid),public.my_billing(text,uuid) to authenticated;

create function private.workspace_subscription(target uuid,target_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_org_member(target) then raise exception 'Not permitted'; end if;
  return coalesce((select jsonb_build_object('paid',coalesce((s.snapshot->>'paid')::boolean,false) and coalesce((s.snapshot->>'period_end')::bigint,0)>extract(epoch from now()),'plan',s.snapshot->'plan','status',s.snapshot->'status')
    from private.billing_accounts a join private.billing_subscriptions s on s.account_id=a.id where a.org_id=target and a.mode=target_mode),'{"paid":false,"status":"none"}'::jsonb);
end;
$$;
create function public.workspace_subscription(target uuid,target_mode text) returns jsonb
language sql security invoker set search_path='' as $$ select private.workspace_subscription(target,target_mode); $$;
revoke all on function private.workspace_subscription(uuid,text),public.workspace_subscription(uuid,text) from public,anon,authenticated;
grant execute on function private.workspace_subscription(uuid,text),public.workspace_subscription(uuid,text) to authenticated;

-- Narrow privileged protocol; no table access is exposed to application users.
create function private.billing_admin(operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare account private.billing_accounts; token uuid; attempt jsonb; result jsonb;
begin
  if operation='catalog' then
    return (select to_jsonb(c) from private.billing_catalog c where mode=payload->>'mode');
  elsif operation='lookup' then
    return (select to_jsonb(a) from private.billing_accounts a where mode=payload->>'mode' and stripe_account=payload->>'stripe_account' and customer_id=payload->>'customer_id');
  elsif operation='deletion_accounts' then
    return (select coalesce(jsonb_agg(jsonb_build_object('mode',a.mode,'customer_id',a.customer_id,'org_id',a.org_id)),'[]'::jsonb)
      from private.billing_accounts a where a.org_id in (select m.org_id from public.organization_members m where m.user_id=(payload->>'user_id')::uuid and m.role='owner'
        and not exists(select 1 from public.organization_members x where x.org_id=m.org_id and x.user_id<>m.user_id)));
  elsif operation='pending' then
    return (select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from
      (select * from private.billing_accounts where mode=payload->>'mode' and customer_id is not null
       order by greatest(synced_at,attempted_at) nulls first limit 20) a);
  elsif operation='claim' then
    if payload ? 'org_id' then
      perform 1 from auth.users where id=(payload->>'user_id')::uuid and email_confirmed_at is not null for key share;
      if not found then raise exception 'Not permitted'; end if;
      if not exists(select 1 from private.billing_catalog where mode=payload->>'mode' and stripe_account=payload->>'stripe_account') then raise exception 'Billing target mismatch'; end if;
      perform 1 from public.organizations where id=(payload->>'org_id')::uuid for update;
      if not exists(select 1 from public.organization_members where org_id=(payload->>'org_id')::uuid and user_id=(payload->>'user_id')::uuid and role in ('owner','admin')) then raise exception 'Not permitted'; end if;
      insert into private.billing_accounts(org_id,mode,stripe_account) values((payload->>'org_id')::uuid,payload->>'mode',payload->>'stripe_account') on conflict(org_id,mode) do nothing;
      select * into account from private.billing_accounts where org_id=(payload->>'org_id')::uuid and mode=payload->>'mode' for update;
    else
      select * into account from private.billing_accounts where id=(payload->>'id')::uuid for update;
    end if;
    if account.id is null then raise exception 'Account not found'; end if;
    if account.lease_until>now() then return null; end if;
    if payload ? 'user_id' and account.attempted_at>now()-interval '2 seconds' then return null; end if;
    token:=gen_random_uuid();
    update private.billing_accounts set lease=token,lease_until=now()+interval '2 minutes',attempted_at=now() where id=account.id;
    return jsonb_build_object('account',to_jsonb(account),'token',token);
  end if;
  select * into account from private.billing_accounts where id=(payload->>'id')::uuid for update;
  if account.id is null or account.lease is distinct from (payload->>'token')::uuid then raise exception 'Lease lost'; end if;
  if operation='release' then
    update private.billing_accounts set lease=null,lease_until=null where id=account.id;
    return null;
  end if;
  if account.lease_until<=now() then raise exception 'Lease expired'; end if;
  if operation='customer_attempt' then
    attempt:=coalesce(account.customer_attempt,jsonb_build_object('id',gen_random_uuid(),'started_at',now(),'email',payload->>'email'));
    update private.billing_accounts set customer_attempt=attempt where id=account.id;
    return attempt;
  elsif operation='customer' then
    if account.customer_id is not null and account.customer_id<>payload->>'customer_id' then raise exception 'Customer mismatch'; end if;
    update private.billing_accounts set customer_id=payload->>'customer_id' where id=account.id;
  elsif operation='checkout_attempt' then
    attempt:=account.checkout_attempt;
    if attempt is null or (attempt->>'expires_at')::bigint<extract(epoch from now())-120 then
      attempt:=jsonb_build_object('id',gen_random_uuid(),'price_id',payload->>'price_id','app_url',payload->>'app_url','expires_at',floor(extract(epoch from now()))::bigint+2100);
      update private.billing_accounts set checkout_attempt=attempt where id=account.id;
    end if;
    return attempt;
  elsif operation='checkout_session' then
    update private.billing_accounts set checkout_attempt=checkout_attempt||jsonb_build_object('session_id',payload->>'session_id') where id=account.id;
  elsif operation='commit' then
    insert into private.billing_subscriptions(account_id,snapshot) values(account.id,payload->'snapshot')
      on conflict(account_id) do update set snapshot=excluded.snapshot,updated_at=now();
    update private.billing_accounts set synced_at=now() where id=account.id;
    if payload->>'event_id' is not null then
      insert into private.billing_events(account_id,event_id) values(account.id,payload->>'event_id') on conflict do nothing;
    end if;
  else raise exception 'Unknown billing operation';
  end if;
  return null;
end;
$$;
create function public.billing_admin(operation text,payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.billing_admin(operation,payload); $$;
revoke all on function private.billing_admin(text,jsonb),public.billing_admin(text,jsonb) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.billing_admin(text,jsonb),public.billing_admin(text,jsonb) to service_role;

-- Serializes with billing leases. Existing workspace ownership guards remain intact.
-- Paid-through cancellations still block deletion; cancel and wait for expiry first.
create function private.guard_billing_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from private.billing_accounts where org_id=old.id order by id for update;
  if exists(select 1 from private.billing_accounts a left join private.billing_subscriptions s on s.account_id=a.id
    where a.org_id=old.id and (
      a.lease_until>now() or
      coalesce((a.checkout_attempt->>'expires_at')::bigint,0)>extract(epoch from now())-120 or
      (a.customer_id is not null and (a.synced_at is null or a.synced_at<now()-interval '5 minutes' or s.snapshot is null or
       s.snapshot->>'status' not in ('none','canceled','incomplete_expired')))
    )) then raise exception 'Refresh billing and finish or cancel subscriptions before deleting this workspace'; end if;
  return old;
end;
$$;
revoke all on function private.guard_billing_deletion() from public,anon,authenticated;
create trigger before_workspace_billing_deletion before delete on public.organizations for each row execute function private.guard_billing_deletion();

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
create function private.invoke_billing(target_mode text) returns bigint
language plpgsql security definer set search_path='' as $$
declare endpoint text; secret text; request_id bigint;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='forma_billing_url_'||target_mode;
  select decrypted_secret into secret from vault.decrypted_secrets where name='forma_billing_secret_'||target_mode;
  if endpoint is null or secret is null then raise exception 'Billing schedule unconfigured'; end if;
  select net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;
  return request_id;
end;
$$;
create function private.configure_billing_schedule(target_mode text,endpoint text,secret text) returns void
language plpgsql security definer set search_path='' as $$
declare secret_id uuid;
begin
  if target_mode not in ('test','live') or endpoint not like 'https://%.supabase.co/functions/v1/forma-billing-%/reconcile' or secret !~ '^[a-f0-9]{64}$' then raise exception 'Invalid scheduler configuration'; end if;
  select id into secret_id from vault.secrets where name='forma_billing_url_'||target_mode;
  if secret_id is null then perform vault.create_secret(endpoint,'forma_billing_url_'||target_mode);
  else perform vault.update_secret(secret_id,endpoint); end if;
  select id into secret_id from vault.secrets where name='forma_billing_secret_'||target_mode;
  if secret_id is null then perform vault.create_secret(secret,'forma_billing_secret_'||target_mode);
  else perform vault.update_secret(secret_id,secret); end if;
  perform cron.schedule('forma-billing-'||target_mode,'*/5 * * * *',format('select private.invoke_billing(%L)',target_mode));
end;
$$;
revoke all on function private.invoke_billing(text),private.configure_billing_schedule(text,text,text) from public,anon,authenticated,service_role;
