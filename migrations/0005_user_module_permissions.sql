-- ============================================================================
-- 0005_user_module_permissions.sql
-- ============================================================================
-- Permite override por usuário dos módulos permitidos.
-- - Vazio (sem linhas) = herda do tenant
-- - Linhas explícitas = restringe aos módulos listados
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_module_permissions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, module_id),
  -- Segurança: tenant_id deve bater com o do user
  FOREIGN KEY (user_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE CASCADE
);

-- Índice para lookup rápido por tenant
CREATE INDEX IF NOT EXISTS idx_user_module_permissions_tenant
  ON user_module_permissions(tenant_id, user_id);

-- Comentário explicativo
COMMENT ON TABLE user_module_permissions IS
  'Override por usuário dos módulos permitidos. Vazio = herda do tenant. Lista explícita = restringe.';
COMMENT ON COLUMN user_module_permissions.module_id IS
  'ID do módulo (dashboard, orders, inventory, etc). Validação client-side.';
