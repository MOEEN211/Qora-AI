-- Generated provider configuration belongs in the private catalog, not .env.
alter table private.billing_catalog
  add column if not exists portal_configuration_id text;

comment on column private.billing_catalog.portal_configuration_id is
  'Kickstart-managed Stripe portal configuration for this catalog and mode.';
