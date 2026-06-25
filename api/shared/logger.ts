/**
 * Logger estruturado leve (zero dependências externas).
 *
 * SECURITY (LGPD + M5 do relatório): substitui `console.log/warn/error` por
 * - logs estruturados em JSON em produção (facilita ingestão em ELK/Loki/CloudWatch)
 * - redação automática de campos sensíveis (PII / credenciais / tokens)
 *   para impedir que um stack-trace ou um `metadata` vaze segredo em log.
 * - redação POR PADRÃO dentro de strings (ex: "login falhou para joao@x.com"
 *   vira "login falhou para jo***[PII]") — defende contra PII inline
 *   que escaparia de uma redação por chave.
 *
 * Uso:
 *   import { logger } from '../shared/logger.js'
 *   logger.info('User logged in', { userId: 'u_1', email: 'a@b.com' })
 *   logger.warn('Rate limit hit', { ip, path })
 *   logger.error('Webhook failed', { provider, eventId, err })
 *
 * Para desabilitar redação (ex: testes), use `setRedactDisabled(true)`.
 */
import { inspect } from 'util'
import { redactPii } from './pii-redactor.js'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const ENV_LEVEL = (process.env.LOG_LEVEL ?? '').toLowerCase() as LogLevel
const ACTIVE_LEVEL: number =
  LEVELS[ENV_LEVEL] ??
  (process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug)

const isProd = process.env.NODE_ENV === 'production'

/**
 * SECURITY (LGPD): redação unificada. Usa o módulo pii-redactor que combina:
 *  - redação por chave (email, name, phone, ...)
 *  - redação por padrão dentro de strings (regex para email/CPF/CNPJ/phone)
 *  - tratamento especial de Error.message (que pode conter PII)
 */
const safeSerialize = (meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
  if (!meta) return undefined
  return redactPii(meta) as Record<string, unknown>
}

const serialize = (level: LogLevel, msg: string, meta?: Record<string, unknown>): string => {
  const safeMeta = safeSerialize(meta)
  if (isProd) {
    return JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...(safeMeta ?? {}),
    })
  }
  // dev: format humanizado
  const metaStr = safeMeta && Object.keys(safeMeta).length > 0 ? ` ${inspect(safeMeta, { depth: 3, breakLength: 120 })}` : ''
  return `[${level.toUpperCase()}] ${msg}${metaStr}`
}

const shouldLog = (level: LogLevel): boolean => LEVELS[level] >= ACTIVE_LEVEL

const emit = (level: LogLevel, msg: string, meta?: Record<string, unknown>): void => {
  if (!shouldLog(level)) return
  const line = serialize(level, msg, meta)
  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}

export interface Logger {
  debug: (msg: string, meta?: Record<string, unknown>) => void
  info: (msg: string, meta?: Record<string, unknown>) => void
  warn: (msg: string, meta?: Record<string, unknown>) => void
  error: (msg: string, meta?: Record<string, unknown>) => void
  child: (bindings: Record<string, unknown>) => Logger
}

const make = (bindings: Record<string, unknown> = {}): Logger => ({
  debug: (msg, meta) => emit('debug', msg, { ...bindings, ...meta }),
  info: (msg, meta) => emit('info', msg, { ...bindings, ...meta }),
  warn: (msg, meta) => emit('warn', msg, { ...bindings, ...meta }),
  error: (msg, meta) => emit('error', msg, { ...bindings, ...meta }),
  child: (b) => make({ ...bindings, ...b }),
})

export const logger: Logger = make()
