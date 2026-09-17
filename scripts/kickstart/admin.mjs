export async function verifyAdmin(api) {
 const [result]=await api.query(`/* operator-verification */ select
 to_regclass('private.operator_users') is not null and to_regclass('private.reporting_state') is not null
 and to_regprocedure('private.operator_verified()') is not null
 and has_function_privilege('authenticated','public.operator_read(text,jsonb)','EXECUTE')
 and not has_function_privilege('anon','public.operator_read(text,jsonb)','EXECUTE')
 and not has_function_privilege('service_role','private.operator_command(text,boolean)','EXECUTE')
 and not has_table_privilege('authenticated','private.operator_users','SELECT,INSERT,UPDATE,DELETE')
 and exists(select 1 from pg_trigger where tgname='aaa_operator_deletion' and not tgisinternal)
 and exists(select 1 from cron.job where jobname='forma-operator-audit-retention') as ready`);
 if(!result?.ready) throw Error('Admin schema, guards or privileges are incomplete.');
 return 'Operator authorization, private reporting and last-admin guard verified.';
}
