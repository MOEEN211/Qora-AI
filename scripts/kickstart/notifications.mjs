export async function verifyNotifications(api) {
  const [result] = await api.query(`/* notifications-verification */ select
    (select c.relrowsecurity and has_table_privilege('authenticated',c.oid,'SELECT')
      and has_column_privilege('authenticated',c.oid,'read_at','UPDATE')
      and not has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')
      and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
      and not exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
        and a.attname<>'read_at' and has_column_privilege('authenticated',c.oid,a.attname,'UPDATE'))
      and (select count(*) from pg_policy p where p.polrelid=c.oid)=2
      from pg_class c where c.oid=to_regclass('public.notifications')) as protected_table,
    exists(select 1 from pg_trigger t where t.tgrelid='auth.users'::regclass
      and t.tgname='on_auth_user_notification' and t.tgenabled='O'
      and t.tgfoid=to_regprocedure('private.bootstrap_notification()')) as signup_trigger,
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='private' and p.proname in ('welcome_notification','bootstrap_notification')
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE')) as protected_functions,
    exists(select 1 from pg_index where indexrelid=to_regclass('public.notifications_welcome_idx') and indisunique and indisvalid) as welcome_unique,
    not exists(select 1 from auth.users u where not exists(select 1 from public.notifications n where n.user_id=u.id)) as backfilled`);
  if (!result?.protected_table || !result.signup_trigger || result.protected_functions !== 2 || !result.welcome_unique || !result.backfilled)
    throw new Error("Notification storage, signup trigger, permissions, or welcome backfill are incomplete. Check the notification migration.");
}
