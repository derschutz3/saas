/**
 * Middleware de rate limiting.
 *
 * SECURITY (C3 do relatório): sem rate limit, brute force de credenciais
 * é trivial (PBKDF2 custa ~150ms por tentativa, mas 10 em 0.5s é trivial).
 *
 * Estratégia:
 * - Login: 5 tentativas por IP a cada 15 min (mitiga brute force)
 * - Webhooks: 100 req/min por IP (mitiga abuso)
 * - Global: 300 req/min por IP (mitiga DoS)
 * - Em dev: limites mais altos para não atrapalhar testes
 */
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

const isDev = process.env.NODE_ENV !== 'production'

/**
 * Helper que gera chave de rate limit segura para IPv4 e IPv6.
 * SECURITY: express-rate-limit v8 exige que chaves IPv6 usem
 * `ipKeyGenerator` para que prefixos /64 sejam tratados como uma
 * única origem (evita bypass via rotação de endereço IPv6).
 */
const clientKey = (req: import('express').Request): string => {
  return ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown')
}

/**
 * Rate limit para endpoints de login.
 * SECURITY: 5 tentativas / 15min por IP — alinhado com NIST SP 800-63B
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: { code: 'TOO_MANY_REQUESTS', message: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  skipSuccessfulRequests: true, // só conta tentativas falhas
})

/**
 * Rate limit para webhooks de integração.
 * SECURITY: previne abuse de webhooks públicos (forçar pedidos/cancelamentos)
 */
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 1000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: { code: 'TOO_MANY_REQUESTS', message: 'Rate limit de webhooks excedido.' },
})

/**
 * Rate limit global para toda a API.
 * SECURITY: mitiga DoS por esgotamento de memória/CPU
 */
export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 5000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: { code: 'TOO_MANY_REQUESTS', message: 'Rate limit global excedido. Tente novamente em instantes.' },
})
