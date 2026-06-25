-- ============================================================================
-- 0006_audit_retention.sql
-- ============================================================================
-- Política de retenção LGPD Art. 16 (eliminação após cumprimento da finalidade).
--
-- O AuditEvent é necessário para:
--   - Cumprimento de obrigação legal (Art. 16, I) — ex: legislação tributária,
--     regulatória, prevenção à fraude
--   - Exercício regular de direitos em processos (Art. 16, VI)
--
-- Prazo: 5 anos para eventos financeiros (LGPD Art. 16 + Lei 8.137/1990 +
--        Instrução Normativa RFB 1702/2017 — guarda de documentos fiscais).
--        2 anos para eventos não financeiros (LGPD Art. 6, III — princípio
--        da necessidade; armazenamos só pelo tempo necessário).
--
-- Estratégia:
--   1. Coluna `expires_at` em audit_events (gerada no INSERT)
--   2. Função SQL `audit_events_set_expires_at()` que decide o prazo conforme
--      o tipo de evento
--   3. Trigger `BEFORE INSERT` que preenche expires_at
--   4. Job diário `purge_expired_audit_events()` que deleta o que venceu
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Coluna expires_at + default inicial conservador
-- ----------------------------------------------------------------------------
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Backfill de eventos existentes: vence em 2 anos (não-financeiro default)
UPDATE audit_events
   SET expires_at = created_at + INTERVAL '2 years'
 WHERE expires_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. Trigger: define expires_at conforme a natureza do evento
-- ----------------------------------------------------------------------------
-- SECURITY (LGPD): finalidade é a base legal. Eventos financeiros têm prazo
-- regulatório (5 anos); demais têm 2 anos (necessidade).
CREATE OR REPLACE FUNCTION audit_events_set_expires_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Eventos financeiros / fiscais / contratuais: 5 anos (obrigação legal)
  IF NEW.action IN (
    'ORDER_PAID', 'ORDER_CANCELLED',
    'CASH_SESSION_OPENED', 'CASH_SESSION_CLOSED', 'CASH_MOVEMENT',
    'FISCAL_DOC_ISSUED', 'FISCAL_DOC_CANCELLED',
    'PURCHASE_ORDER_CREATED', 'PURCHASE_ORDER_RECEIVED',
    'ACCOUNT_RECEIVABLE_CREATED', 'ACCOUNT_RECEIVABLE_PAID',
    'INTEGRATION_CREDENTIAL_ROTATED'
  ) THEN
    NEW.expires_at := NEW.created_at + INTERVAL '5 years';
  -- Eventos de autenticação: 1 ano (logs de acesso — IN 1702/2017 + LGPD)
  ELSIF NEW.action LIKE 'AUTH_%' OR NEW.action = 'USER_CREATE' OR NEW.action = 'USER_UPDATE' THEN
    NEW.expires_at := NEW.created_at + INTERVAL '1 year';
  -- Default: 2 anos (necessidade)
  ELSE
    NEW.expires_at := NEW.created_at + INTERVAL '2 years';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_set_expires_at_trg ON audit_events;
CREATE TRIGGER audit_events_set_expires_at_trg
  BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_set_expires_at();

-- ----------------------------------------------------------------------------
-- 3. Função de limpeza (idempotente, com métrica)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION purge_expired_audit_events()
RETURNS TABLE(deleted_count INTEGER, retention_cutoff TIMESTAMPTZ) AS $$
DECLARE
  cutoff TIMESTAMPTZ := NOW();
  n_deleted INTEGER;
BEGIN
  DELETE FROM audit_events WHERE expires_at < cutoff;
  GET DIAGNOSTICS n_deleted = ROW_COUNT;
  deleted_count := n_deleted;
  retention_cutoff := cutoff;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION purge_expired_audit_events() IS
  'LGPD Art. 16: deleta audit_events vencidos. Idempotente. Retorna contagem + cutoff.';

COMMENT ON COLUMN audit_events.expires_at IS
  'LGPD Art. 16: prazo de retenção. Definido por trigger conforme ação.';

-- ----------------------------------------------------------------------------
-- 4. View de monitoramento (útil para dashboards e auditoria do próprio LGPD)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW audit_events_retention_status AS
SELECT
  tenant_id,
  COUNT(*)::INTEGER AS total_events,
  COUNT(*) FILTER (WHERE expires_at < NOW())::INTEGER AS expired_events,
  COUNT(*) FILTER (WHERE expires_at > NOW())::INTEGER AS active_events,
  MIN(created_at) AS oldest_event,
  MIN(expires_at) FILTER (WHERE expires_at > NOW()) AS next_expiration,
  MAX(expires_at) AS last_expiration
FROM audit_events
GROUP BY tenant_id;

COMMENT ON VIEW audit_events_retention_status IS
  'LGPD operacional: contagem de eventos por tenant, separando vencidos e ativos.';

-- ----------------------------------------------------------------------------
-- 5. Permissões (defense-in-depth)
-- ----------------------------------------------------------------------------
-- A função purge só pode ser chamada pelo role de manutenção, não pelo app.
REVOKE EXECUTE ON FUNCTION purge_expired_audit_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_expired_audit_events() TO erp_maintenance;

-- View de monitoramento: leitura permitida para OWNER/ADMIN via app
GRANT SELECT ON audit_events_retention_status TO erp_app;
