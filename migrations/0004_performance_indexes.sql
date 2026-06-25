-- Migration 0004: índices de performance + ajustes estruturais
-- Foco: acelerar queries mais executadas pelo dashboard e telas de estoque/pedidos.

-- products: filtragem por tenant é a query mais comum. Index composto cobre
-- a maioria das listagens (todas as páginas listam por tenant + ordenação por name/sku).
CREATE INDEX IF NOT EXISTS idx_products_tenant_active ON products(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_products_tenant_name ON products(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_products_tenant_sku ON products(tenant_id, sku);
-- Suporte ao filtro por categoria (usado na view de estoque)
CREATE INDEX IF NOT EXISTS idx_products_tenant_category ON products(tenant_id, category_id) WHERE category_id IS NOT NULL;

-- inventory_balances: saldo por branch é lido em toda listagem de estoque
-- (mostrar "saldo atual" ao lado de cada produto).
CREATE INDEX IF NOT EXISTS idx_inv_balances_branch_product ON inventory_balances(tenant_id, branch_id, product_id);

-- inventory_movements: relatórios (CMV, prejuízo) varrem todos os movimentos do tenant.
CREATE INDEX IF NOT EXISTS idx_inv_movements_tenant_created ON inventory_movements(tenant_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_movements_tenant_product ON inventory_movements(tenant_id, product_id, created_at DESC);
-- Filtro por tipo para separar SALE (vendas) de ADJUSTMENT (perdas/quebras).
CREATE INDEX IF NOT EXISTS idx_inv_movements_tenant_type ON inventory_movements(tenant_id, movement_type);

-- orders: dashboard de vendas varre por tenant + período.
CREATE INDEX IF NOT EXISTS idx_orders_tenant_created ON orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(tenant_id, status, created_at DESC);

-- categories: lista carregada em quase toda página
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);

-- customers / suppliers: usado em vendas/compras
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);

-- purchase_orders: dashboard de compras
CREATE INDEX IF NOT EXISTS idx_po_tenant_created ON purchase_orders(tenant_id, created_at DESC);

-- prices: leitura em cada produto do catálogo de vendas
CREATE INDEX IF NOT EXISTS idx_prices_tenant_product ON prices(tenant_id, product_id);

-- unit_conversions: leitura em produtos
CREATE INDEX IF NOT EXISTS idx_unit_conv_tenant_product ON unit_conversions(tenant_id, product_id);

-- users: login e validação de token
CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email);