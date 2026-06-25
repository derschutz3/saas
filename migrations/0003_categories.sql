-- Migration 0003: categorias de estoque
-- Cria a tabela `categories` (per-tenant, soft delete) e adiciona FK
-- `products.category_id` para suportar agrupamento, busca e o agente de IA.

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(300),
  color VARCHAR(7),     -- "#RRGGBB" ou NULL
  icon VARCHAR(40),     -- nome de componente lucide-react
  position INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Não permite 2 categorias com o mesmo nome (não-arquivada) por tenant
  CONSTRAINT categories_tenant_name_uk UNIQUE (tenant_id, name, archived_at)
);

-- Índice composto para a query mais quente:
--   "listar categorias ativas de um tenant, ordenadas por position"
CREATE INDEX IF NOT EXISTS idx_categories_tenant_active
  ON categories (tenant_id, archived_at, position);

-- Full-text search em PT-BR (suporta busca por nome)
CREATE INDEX IF NOT EXISTS idx_categories_name_trgm
  ON categories USING GIN (lower(name) gin_trgm_ops);

-- Migração leve: products.category_id nullable para suportar "Sem categoria"
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id UUID
  REFERENCES categories(id) ON DELETE SET NULL;

-- Índice composto (category_id, name) — atende o faceted search do front
CREATE INDEX IF NOT EXISTS idx_products_category_name
  ON products (tenant_id, category_id, lower(name));

-- Full-text search em produtos (nome + sku) — atende busca global
CREATE INDEX IF NOT EXISTS idx_products_name_sku_trgm
  ON products USING GIN (lower(name) gin_trgm_ops, lower(sku) gin_trgm_ops);

-- Comentário: pg_trgm é recomendado mas não obrigatório.
-- Se a extensão não estiver disponível, basta dropar os índices *_trgm
-- e a busca usará fallback ILIKE.
