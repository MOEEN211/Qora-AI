export async function verifyNotificationPreferences(api) {
  const [result] = await api.query(`/* notification-preferences-verification */ select
    (select c.relrowsecurity and has_table_privilege('authenticated',c.oid,'SELECT')
      and has_column_privilege('authenticated',c.oid,'email_enabled','UPDATE')
      and has_column_privilege('authenticated',c.oid,'in_app_enabled','UPDATE')
      and not has_column_privilege('authenticated',c.oid,'user_id','UPDATE')
      and not has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')
      and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
      and (select count(*) from pg_policy p where p.polrelid=c.oid)=2
      from pg_class c where c.oid=to_regclass('public.notification_preferences')) as protected,
    (select count(*)::int from pg_trigger where not tgisinternal and tgenabled='O' and
      (tgrelid='auth.users'::regclass and tgname='on_auth_user_0_notification_preferences'
        or tgrelid='public.notifications'::regclass and tgname='notification_preference_before_insert')) as triggers,
    (select has_function_privilege('service_role',p.oid,'EXECUTE')
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE')
      from pg_proc p where p.oid=to_regprocedure('public.email_notifications_allowed(text,uuid)')) as lookup,
    not exists(select 1 from auth.users u where not exists(select 1 from public.notification_preferences p where p.user_id=u.id)) as backfilled`);
  if (!result?.protected || result.triggers !== 2 || !result.lookup || !result.backfilled)
    throw new Error('Notification preferences, delivery guards, or permissions are incomplete. Check notification preference migrations.');
}
