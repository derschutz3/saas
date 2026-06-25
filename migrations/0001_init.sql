CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_select ON tenants FOR SELECT USING (TRUE);

CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

CREATE INDEX branches_tenant_id_idx ON branches(tenant_id);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY branches_tenant_isolation ON branches
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX users_tenant_email_uidx ON users(tenant_id, lower(email));
CREATE INDEX users_tenant_id_idx ON users(tenant_id);
CREATE INDEX users_branch_id_idx ON users(branch_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_tenant_isolation ON users
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX customers_tenant_id_idx ON customers(tenant_id);
CREATE UNIQUE INDEX customers_tenant_phone_uidx ON customers(tenant_id, lower(phone));

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_tenant_isolation ON customers
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  base_unit TEXT NOT NULL DEFAULT 'un',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX products_tenant_id_idx ON products(tenant_id);
CREATE UNIQUE INDEX products_tenant_sku_uidx ON products(tenant_id, sku);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_tenant_isolation ON products
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE TABLE units (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, code)
);

ALTER TABLE units ENABLE ROW LEVEL SECURITY;
CREATE POLICY units_tenant_isolation ON units
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE TABLE unit_conversions (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_code TEXT NOT NULL,
  factor_to_base INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, product_id, unit_code)
);

CREATE INDEX unit_conversions_tenant_product_idx ON unit_conversions(tenant_id, product_id);

ALTER TABLE unit_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY unit_conversions_tenant_isolation ON unit_conversions
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE TABLE prices (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  unit_code TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, product_id, channel, unit_code)
);

CREATE INDEX prices_tenant_product_idx ON prices(tenant_id, product_id);

ALTER TABLE prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY prices_tenant_isolation ON prices
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  customer_name TEXT NULL,
  customer_phone TEXT NULL,
  delivery_address TEXT NULL,
  status TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL
);

CREATE INDEX orders_tenant_branch_idx ON orders(tenant_id, branch_id);
CREATE INDEX orders_tenant_branch_status_idx ON orders(tenant_id, branch_id, status);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  unit_code TEXT NOT NULL,
  unit_label TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  quantity_base INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL
);

CREATE INDEX order_items_tenant_order_idx ON order_items(tenant_id, order_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_items_tenant_isolation ON order_items
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE TABLE inventory_balances (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_base INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, branch_id, product_id)
);

CREATE INDEX inventory_balances_tenant_branch_idx ON inventory_balances(tenant_id, branch_id);

ALTER TABLE inventory_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_balances_tenant_isolation ON inventory_balances
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  quantity_base INTEGER NOT NULL,
  ref_type TEXT NULL,
  ref_id UUID NULL,
  reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL
);

CREATE INDEX inventory_movements_tenant_branch_idx ON inventory_movements(tenant_id, branch_id);
CREATE INDEX inventory_movements_tenant_branch_product_idx ON inventory_movements(tenant_id, branch_id, product_id);

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_movements_tenant_isolation ON inventory_movements
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE TABLE accounts_receivable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ NULL
);

CREATE INDEX accounts_receivable_tenant_branch_idx ON accounts_receivable(tenant_id, branch_id);
CREATE INDEX accounts_receivable_tenant_branch_status_idx ON accounts_receivable(tenant_id, branch_id, status);

ALTER TABLE accounts_receivable ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounts_receivable_tenant_isolation ON accounts_receivable
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE TABLE cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ NULL,
  opening_float_cents INTEGER NOT NULL DEFAULT 0,
  closing_declared_cents INTEGER NULL
);

CREATE INDEX cash_sessions_tenant_branch_idx ON cash_sessions(tenant_id, branch_id);

ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY cash_sessions_tenant_isolation ON cash_sessions
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE TABLE cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  cash_session_id UUID NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  ref_type TEXT NULL,
  ref_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL
);

CREATE INDEX cash_movements_tenant_branch_session_idx ON cash_movements(tenant_id, branch_id, cash_session_id);

ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY cash_movements_tenant_isolation ON cash_movements
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE TABLE fiscal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX fiscal_documents_tenant_branch_idx ON fiscal_documents(tenant_id, branch_id);
CREATE INDEX fiscal_documents_tenant_status_idx ON fiscal_documents(tenant_id, status);

ALTER TABLE fiscal_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_documents_tenant_isolation ON fiscal_documents
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_events_tenant_created_idx ON audit_events(tenant_id, created_at DESC);
CREATE INDEX audit_events_tenant_entity_idx ON audit_events(tenant_id, entity_type, entity_id);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_events_tenant_isolation ON audit_events
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);
