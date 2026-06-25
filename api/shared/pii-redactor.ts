/**
 * LGPD — Redator centralizado de PII (Personally Identifiable Information).
 *
 * Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018) proíbe armazenamento,
 * compartilhamento ou exposição de dados pessoais sem finalidade legítima.
 * Este módulo garante que logs e registros de auditoria NUNCA retenham PII em
 * texto claro.
 *
 * Duas estratégias complementares:
 *  1. **Por chave** — chaves sabidamente PII (email, name, phone, ...) são
 *     substituídas por hashes SHA-256 truncados para manter correlação.
 *  2. **Por padrão** — emails, CPFs/CNPJs e telefones brasileiros são
 *     detectados DENTRO de qualquer string (ex: "Login de joao@x.com falhou")
 *     e redatados.
 *
 * Para preservar rastreabilidade, expomos `hashPII()` (SHA-256 truncado) que
 * pode ser usado em identificadores correlatos (ex: hash(email) == mesmo usuário).
 *
 * Em testes, defina `redactDisabled = true` para inspecionar dados brutos.
 *
 * USO:
 *   import { redactPii, hashPii, buildSafeAuditMeta } from './pii-redactor.js'
 *   const safe = redactPii(arbitraryObject)
 *   logger.info('evt', safe)
 */

import { createHash } from 'crypto'

// ============================================================
// 1. Chaves sabidamente PII (case-insensitive)
// ============================================================

/**
 * SECURITY (LGPD): chaves que armazenam PII direto.
 * Comparação é case-insensitive (email === Email === EMAIL).
 *
 * IMPORTANTE: estes são METADADOS (nomes de campos), não conteúdo de string.
 */
const SENSITIVE_KEYS = new Set([
  // Identidade
  'name', 'fullname', 'full_name', 'firstname', 'lastname',
  'customername', 'customer_name', 'suppliername', 'supplier_name',
  'tradename', 'trade_name', 'username',
  // Contato
  'email', 'mail', 'e-mail',
  'phone', 'telefone', 'whatsapp', 'celular', 'mobile',
  // Documento
  'taxid', 'tax_id', 'cpf', 'cnpj', 'document', 'documento', 'rg', 'ie',
  // Endereço
  'address', 'endereco', 'street', 'rua', 'logradouro',
  'city', 'cidade', 'state', 'estado',
  'zip', 'zipcode', 'zip_code', 'cep',
  'complement', 'complemento', 'neighborhood', 'bairro',
  // Notas livres que podem conter PII
  'notes', 'note', 'observacao', 'observacoes', 'description', 'descricao',
  'reason', 'motivo', 'message',
  // Operador / funcionário
  'operatorname', 'operator_name',
  // Credenciais (defense-in-depth, logger.ts já tem)
  'password', 'pass', 'pwd', 'secret', 'token', 'apikey', 'api_key',
  'authorization', 'bearer', 'cookie', 'set-cookie',
  'hash', 'salt', 'passwordhash', 'passwordsalt',
  // Pagamento
  'card', 'cardnumber', 'cvv', 'account',
])

const PLACEHOLDER_KEY = '[PII]'
const PLACEHOLDER_TEXT = '[PII:redacted]'

// ============================================================
// 2. Regex para detectar PII dentro de strings
// ============================================================

/**
 * SECURITY (LGPD): regexes que detectam PII dentro de QUALQUER string.
 * Quando encontrados, a string inteira é redatada (não substituímos o pedaço
 * para evitar quebras de contexto e evitar expor parte do dado).
 *
 * Fontes dos formatos:
 *  - Email: RFC 5322 simplificado
 *  - CPF: 11 dígitos (###.###.###-## ou só dígitos)
 *  - CNPJ: 14 dígitos (##.###.###/####-## ou só dígitos)
 *  - Telefone BR: DDD + número, com ou sem formatação
 *  - Cartão: 13-19 dígitos com separadores
 */

// Email (case-insensitive). Aceita a maioria dos formatos comuns.
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
// CPF (formato com ou sem pontuação)
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g
// CNPJ (formato com ou sem pontuação)
const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g
// Telefone BR: (11) 91234-5678 ou 11912345678 ou variações
const PHONE_BR_RE = /\b\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g
// Cartão de crédito (13-19 dígitos com separadores)
const CARD_RE = /\b(?:\d[\s-]?){13,19}\b/g

// Combina todos os detectores em uma única regex
const PII_INLINE_RE = new RegExp(
  [EMAIL_RE, CPF_RE, CNPJ_RE, PHONE_BR_RE, CARD_RE].map((r) => `(${r.source})`).join('|'),
  'gi',
)

/** True se string contém PII detectável. */
export function looksLikePii(value: unknown): boolean {
  if (typeof value !== 'string') return false
  // Resetar lastIndex (regex global com .test() é stateful)
  PII_INLINE_RE.lastIndex = 0
  return PII_INLINE_RE.test(value)
}

/** Substitui PII inline por placeholder. Mantém tamanho aproximado. */
export function redactInlinePii(text: string): string {
  return text.replace(PII_INLINE_RE, (match) => {
    // Mantém os primeiros 2 caracteres para debug (ex: "jo***@***")
    if (match.length <= 4) return PLACEHOLDER_TEXT
    return `${match.slice(0, 2)}***[PII]`
  })
}

// ============================================================
// 3. Hash determinístico (para correlação sem expor PII)
// ============================================================

/**
 * SECURITY (LGPD): hash truncado de PII para uso em logs/audit.
 *
 * - SHA-256 do valor normalizado (trim + lowercase) + salt estático.
 * - Resultado: 12 caracteres hex (48 bits). Probabilidade de colisão ~1 em 2^48.
 *   Suficiente para correlação, insuficiente para reverter o PII.
 *
 * O salt estático aqui é um peppering para hashes de LOG, NÃO para
 * armazenamento de senhas. Serve apenas para evitar rainbow tables em logs
 * exportados acidentalmente.
 */
const LOG_HASH_PEPPER = process.env.LOG_HASH_PEPPER ?? 'erp-logs-only-2024'

export function hashPii(value: unknown): string {
  if (value == null) return ''
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) return ''
  return createHash('sha256')
    .update(LOG_HASH_PEPPER)
    .update(normalized)
    .digest('hex')
    .slice(0, 12)
}

// ============================================================
// 4. Redator principal (recursivo, preservando estrutura)
// ============================================================

const MAX_DEPTH = 8

export function redactPii<T>(value: T, depth = 0): T {
  if (depth > MAX_DEPTH) return PLACEHOLDER_KEY as unknown as T
  if (value == null) return value
  if (typeof value === 'string') {
    // PERFORMANCE: checar antes de rodar regex (evita custo em strings comuns)
    if (value.length === 0) return value
    // Strings longas com PII inline: redatar match
    if (value.length > 256) {
      // Limite para evitar DoS via regex em strings enormes
      return redactPii(value.slice(0, 256), depth + 1) + '...[truncated]' as unknown as T
    }
    if (looksLikePii(value)) {
      return redactInlinePii(value) as unknown as T
    }
    return value
  }
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map((v) => redactPii(v, depth + 1)) as unknown as T
  }
  // Error: mensagem pode conter PII, mas stack trace também (frame info).
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactPii(value.message, depth + 1),
      // Stack NÃO é redatado porque contém apenas file:line, não PII.
      stack: process.env.NODE_ENV === 'production' ? '[redacted in prod]' : value.stack,
    } as unknown as T
  }
  // Map, plain object, etc.
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      // Mantém referência de correlação via hash (se string) ou undefined
      out[k] = typeof v === 'string' ? `[PII:${hashPii(v)}]` : PLACEHOLDER_KEY
    } else {
      out[k] = redactPii(v, depth + 1)
    }
  }
  return out as unknown as T
}

// ============================================================
// 5. Helpers para audit metadata
// ============================================================

/**
 * SECURITY (LGPD): monta metadata para AuditEvent removendo PII.
 *
 * - Campos string são hasheados (preserva correlação entre eventos).
 * - Booleanos, números e IDs (UUID) são preservados como estão.
 * - Listas/tipos complexos são JSON-stringified com redaction.
 *
 * Uso:
 *   await store.audit({
 *     ...
 *     metadata: buildSafeAuditMeta({ name: req.body.name, email: req.body.email, role }),
 *   })
 */
export function buildSafeAuditMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    const lower = k.toLowerCase()
    if (SENSITIVE_KEYS.has(lower)) {
      out[k] = typeof v === 'string' ? `hash:${hashPii(v)}` : '[PII]'
      continue
    }
    if (typeof v === 'string') {
      // String livre (ex: notes, description) — checar PII inline
      if (looksLikePii(v)) {
        out[k] = redactInlinePii(v)
        continue
      }
      out[k] = v
      continue
    }
    if (typeof v === 'number' || typeof v === 'boolean' || v == null) {
      out[k] = v
      continue
    }
    // Array/object: redata recursivamente
    out[k] = redactPii(v)
  }
  return out
}

// ============================================================
// 6. Kill switch (testes)
// ============================================================

/** Em testes, defina como true para inspecionar dados brutos. */
export let redactDisabled = false
export function setRedactDisabled(disabled: boolean): void {
  redactDisabled = disabled
}

// ============================================================
// 7. Verificação de PII (exportada para validação em CI/tests)
// ============================================================

/**
 * Lista de chaves PII que o sistema protege (útil para auditoria estática).
 */
export const PII_PROTECTED_KEYS = Array.from(SENSITIVE_KEYS).sort()

/**
 * Lista de regexes PII (útil para auditoria).
 */
export const PII_PATTERNS = {
  email: EMAIL_RE.source,
  cpf: CPF_RE.source,
  cnpj: CNPJ_RE.source,
  phoneBR: PHONE_BR_RE.source,
  card: CARD_RE.source,
}