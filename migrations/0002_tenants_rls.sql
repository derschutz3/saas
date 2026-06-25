ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_manage ON tenants;

CREATE POLICY tenants_manage ON tenants
  USING (id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (id = current_setting('app.tenant_id', TRUE)::uuid);
