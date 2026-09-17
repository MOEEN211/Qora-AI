export async function verifyOnboarding(api) {
  const [result] = await api.query(`/* onboarding-verification */ select
    (select c.relrowsecurity and has_table_privilege('authenticated',c.oid,'SELECT')
      and has_column_privilege('authenticated',c.oid,'status','UPDATE')
      and has_column_privilege('authenticated',c.oid,'display_name','UPDATE')
      and has_column_privilege('authenticated',c.oid,'use_case','UPDATE')
      and has_column_privilege('authenticated',c.oid,'interests','UPDATE')
      and has_column_privilege('authenticated',c.oid,'current_step','UPDATE')
      and not has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')
      and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
      and not exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
        and a.attname not in ('display_name','use_case','interests','current_step','status')
        and has_column_privilege('authenticated',c.oid,a.attname,'UPDATE'))
      and (select count(*) from pg_policy p where p.polrelid=c.oid)=2
      from pg_class c where c.oid=to_regclass('public.onboarding')) as protected_table,
    exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and tgname='on_auth_user_onboarding'
      and tgenabled='O' and tgfoid=to_regprocedure('private.bootstrap_onboarding()')) as signup_trigger,
    exists(select 1 from pg_trigger where tgrelid=to_regclass('public.onboarding') and tgname='onboarding_before_update'
      and tgenabled='O' and tgfoid=to_regprocedure('private.guard_onboarding_update()')) as transition_trigger,
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='private' and p.proname in ('bootstrap_onboarding','guard_onboarding_update')
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE')) as protected_functions,
    not exists(select 1 from auth.users u where not exists(select 1 from public.onboarding o where o.user_id=u.id)) as backfilled`);
  if (!result?.protected_table || !result.signup_trigger || !result.transition_trigger || result.protected_functions !== 2 || !result.backfilled)
    throw new Error('Onboarding storage, permissions, transitions or signup backfill are incomplete. Check the onboarding migration.');
}
