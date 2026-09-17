-- Product feedback is app-wide, explicitly separate from workspace data.
-- Raw authorship and voter identities are private; only safe board fields leave RPCs.
create table private.bug_reports (
  id uuid primary key,
  created_by uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null check (char_length(trim(description)) between 10 and 5000),
  created_at timestamptz not null default now()
);
create table private.feature_requests (
  id uuid primary key,
  created_by uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null check (char_length(trim(description)) between 10 and 5000),
  created_at timestamptz not null default now()
);
create table private.feature_votes (
  request_id uuid not null references private.feature_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);
create index bug_reports_creator_time_idx on private.bug_reports(created_by, created_at);
create index bug_reports_org_idx on private.bug_reports(org_id);
create index feature_requests_creator_time_idx on private.feature_requests(created_by, created_at);
create index feature_requests_org_idx on private.feature_requests(org_id);
create index feature_requests_time_idx on private.feature_requests(created_at desc, id desc);
create index feature_votes_user_idx on private.feature_votes(user_id);
alter table private.bug_reports enable row level security;
alter table private.feature_requests enable row level security;
alter table private.feature_votes enable row level security;
revoke all on private.bug_reports, private.feature_requests, private.feature_votes from public, anon, authenticated;

-- Narrow privileged entry points: identity comes only from Auth, workspace is checked,
-- timestamps/counts cannot be supplied, and authors/voters are never returned.
create function private.submit_feedback(kind text, submission_id uuid, target uuid, subject text, details text)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare actor uuid := auth.uid(); existing_author uuid; recent_count integer;
begin
  if actor is null or not private.is_org_member(target) then raise insufficient_privilege using message='Not permitted'; end if;
  if kind is null or kind not in ('bug','feature') or submission_id is null or subject is null or details is null
    or char_length(trim(subject)) not between 3 and 120 or char_length(trim(details)) not between 10 and 5000
    then raise exception 'Invalid feedback'; end if;
  -- Serialize a user's submissions, including concurrent retries and the hourly quota.
  perform pg_advisory_xact_lock(hashtextextended('feedback:' || actor::text, 0));
  if kind='bug' then
    select created_by into existing_author from private.bug_reports where id=submission_id;
    select count(*) into recent_count from private.bug_reports where created_by=actor and created_at > now()-interval '1 hour';
  else
    select created_by into existing_author from private.feature_requests where id=submission_id;
    select count(*) into recent_count from private.feature_requests where created_by=actor and created_at > now()-interval '1 hour';
  end if;
  if existing_author=actor then return submission_id; end if;
  if existing_author is not null then raise insufficient_privilege using message='Not permitted'; end if;
  if recent_count >= 10 then raise exception using errcode='P0001', message='Feedback limit reached'; end if;
  if kind='bug' then
    insert into private.bug_reports(id,created_by,org_id,title,description) values(submission_id,actor,target,trim(subject),trim(details));
  else
    insert into private.feature_requests(id,created_by,org_id,title,description) values(submission_id,actor,target,trim(subject),trim(details));
  end if;
  return submission_id;
end;
$fn$;

create function private.search_feature_requests(search_term text, page_number integer)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare result jsonb; total bigint;
begin
  if auth.uid() is null or not private.is_verified_user() then raise insufficient_privilege using message='Not permitted'; end if;
  if search_term is null or char_length(search_term)>100 or page_number is null or page_number not between 0 and 10000
    then raise exception 'Invalid search'; end if;
  select count(*) into total from private.feature_requests
    where strpos(lower(title || ' ' || description),lower(trim(search_term)))>0;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,'title',f.title,'description',f.description,'created_at',f.created_at,
    'votes',(select count(*) from private.feature_votes v where v.request_id=f.id),
    'voted',exists(select 1 from private.feature_votes v where v.request_id=f.id and v.user_id=auth.uid())
  ) order by f.created_at desc,f.id desc),'[]'::jsonb) into result from (
    select * from private.feature_requests
    where strpos(lower(title || ' ' || description),lower(trim(search_term)))>0
    order by created_at desc,id desc limit 20 offset page_number*20
  ) f;
  return jsonb_build_object('items',result,'total',total);
end;
$fn$;

create function private.set_feature_vote(feature_id uuid, upvoted boolean)
returns jsonb language plpgsql security definer set search_path='' as $fn$
begin
  if auth.uid() is null or not private.is_verified_user() then raise insufficient_privilege using message='Not permitted'; end if;
  if feature_id is null or upvoted is null then raise exception 'Invalid vote'; end if;
  -- Serialize votes for a request so the returned count reflects this transaction.
  perform 1 from private.feature_requests where id=feature_id for update;
  if not found then raise exception 'Feature request unavailable'; end if;
  if upvoted then
    insert into private.feature_votes(request_id,user_id) values(feature_id,auth.uid()) on conflict do nothing;
  else
    delete from private.feature_votes where request_id=feature_id and user_id=auth.uid();
  end if;
  return jsonb_build_object('votes',(select count(*) from private.feature_votes where request_id=feature_id),'voted',upvoted);
end;
$fn$;

create function public.submit_feedback(kind text, submission_id uuid, target uuid, subject text, details text)
returns uuid language sql security invoker set search_path='' as $$
  select private.submit_feedback(kind,submission_id,target,subject,details);
$$;
create function public.search_feature_requests(search_term text default '', page_number integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.search_feature_requests(search_term,page_number);
$$;
create function public.set_feature_vote(feature_id uuid, upvoted boolean)
returns jsonb language sql security invoker set search_path='' as $$
  select private.set_feature_vote(feature_id,upvoted);
$$;
revoke all on function private.submit_feedback(text,uuid,uuid,text,text), private.search_feature_requests(text,integer), private.set_feature_vote(uuid,boolean),
  public.submit_feedback(text,uuid,uuid,text,text), public.search_feature_requests(text,integer), public.set_feature_vote(uuid,boolean) from public, anon, authenticated;
grant execute on function private.submit_feedback(text,uuid,uuid,text,text), private.search_feature_requests(text,integer), private.set_feature_vote(uuid,boolean),
  public.submit_feedback(text,uuid,uuid,text,text), public.search_feature_requests(text,integer), public.set_feature_vote(uuid,boolean) to authenticated;
