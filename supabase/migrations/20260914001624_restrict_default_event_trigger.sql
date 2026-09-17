-- The provider-created event trigger runs as its owner during DDL; app roles never call it.
do $permissions$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$permissions$;
