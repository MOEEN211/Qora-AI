-- Owner decision: ordinary application login grants access to existing operators.
-- Keep live session, confirmed-account, operator membership and OAuth exclusions.
create or replace function private.operator_verified() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(private.operator_eligible(),false);
$$;
create or replace function private.require_operator() returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.operator_verified() then
  raise insufficient_privilege using message='Admin access requires a signed-in operator account.';
 end if;
end $$;
