-- The service-only invoker RPC must resolve its narrowly granted private function.
-- Schema usage grants no table privileges; AI tables remain denied to service_role.
grant usage on schema private to service_role;
