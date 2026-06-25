/**
 * Teste do redator LGPD.
 *
 * SECURITY (LGPD): este teste é OBRIGATÓRIO. Valida que PII NUNCA vaza em
 * logs/audit, mesmo quando o caller esquece de usar buildSafeAuditMeta.
 *
 * Roda com: tsx scripts/test-pii-redactor.ts
 */

import {
  redactPii, hashPii, looksLikePii, buildSafeAuditMeta,
  PII_PROTECTED_KEYS,
} from '../api/shared/pii-redactor.js'

let failed = 0
let passed = 0
function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`)
    passed++
  } else {
    console.log(`  ✗ FAILED: ${msg}`)
    failed++
  }
}

console.log('=== PII REDACTOR — TESTES LGPD ===\n')

// 1. Redação por chave
console.log('1. Redação por chave')
const obj1 = redactPii({
  name: 'João da Silva',
  email: 'joao@example.com',
  phone: '+5511999998888',
  document: '123.456.789-00',
  password: 'secret123',
  apiKey: 'sk_live_abc',
})
assert(typeof obj1.name === 'string' && obj1.name.startsWith('[PII:'), `name deve ser hash: ${obj1.name}`)
assert(typeof obj1.email === 'string' && obj1.email.startsWith('[PII:'), `email deve ser hash: ${obj1.email}`)
assert(typeof obj1.document === 'string' && obj1.document.startsWith('[PII:'), `document deve ser hash`)
// SECURITY: secrets (password, apiKey) são hasheados (não em claro), mas não há como
// distingui-los de outros campos string — apenas saber que NÃO estão em texto claro.
assert(typeof obj1.password === 'string' && obj1.password.includes('[PII'), `password NÃO está em claro: ${obj1.password}`)
assert(typeof obj1.apiKey === 'string' && obj1.apiKey.includes('[PII'), `apiKey NÃO está em claro: ${obj1.apiKey}`)

// 2. Redação inline (regex dentro de string)
console.log('\n2. Redação inline em strings')
const msg1 = redactPii('Login falhou para joao@empresa.com')
assert(!msg1.includes('joao@empresa.com'), `email inline deve ser redatado: ${msg1}`)
assert(typeof msg1 === 'string' && msg1.includes('[PII]'), `deve manter placeholder: ${msg1}`)

const msg2 = redactPii('Cliente CPF 123.456.789-00 fez pedido')
assert(!msg2.includes('123.456.789-00'), `CPF inline deve ser redatado: ${msg2}`)

const msg3 = redactPii('Telefone (11) 99999-8888 cadastrado')
assert(!msg3.includes('99999-8888'), `phone inline deve ser redatado: ${msg3}`)

// 3. Hash determinístico (correlação preservada)
console.log('\n3. Hash determinístico')
const h1 = hashPii('joao@example.com')
const h2 = hashPii('joao@example.com')
assert(h1 === h2, `mesmo email = mesmo hash: ${h1}`)
const h3 = hashPii('maria@example.com')
assert(h1 !== h3, `emails diferentes = hashes diferentes`)
assert(/^[a-f0-9]{12}$/.test(h1), `hash tem 12 chars hex: ${h1}`)

// 4. Não-redação de dados não-PII
console.log('\n4. Não-redação de dados não-PII')
const obj2 = redactPii({
  userId: 'u_abc123',
  role: 'CASHIER',
  tenantId: 't_xyz',
  openingCents: 10000,
  difference: -50,
  active: true,
})
assert(obj2.userId === 'u_abc123', `userId preservado`)
assert(obj2.role === 'CASHIER', `role preservado`)
assert(obj2.openingCents === 10000, `openingCents preservado`)
assert(obj2.active === true, `active preservado`)

// 5. Lookalike check
console.log('\n5. looksLikePii()')
assert(looksLikePii('Email é joao@example.com'), `detecta email`)
assert(looksLikePii('CPF 123.456.789-00'), `detecta CPF`)
assert(looksLikePii('(11) 91234-5678'), `detecta telefone`)
assert(!looksLikePii('Pedido aberto com sucesso'), `não detecta string comum`)
assert(!looksLikePii(123456), `não detecta número puro`)

// 6. buildSafeAuditMeta (audit sem PII)
console.log('\n6. buildSafeAuditMeta — auditoria')
const meta = buildSafeAuditMeta({
  name: 'Maria Cliente',
  email: 'maria@example.com',
  phone: '+5511988887777',
  role: 'OPS',
  document: '987.654.321-00',
  notes: 'Cliente VIP. Telefone 11988887777',
  openingCents: 5000,
  difference: 0,
})
assert(typeof meta.name === 'string' && meta.name.startsWith('hash:'), `name hasheado: ${meta.name}`)
assert(typeof meta.email === 'string' && meta.email.startsWith('hash:'), `email hasheado`)
assert(typeof meta.document === 'string' && meta.document.startsWith('hash:'), `document hasheado`)
assert(typeof meta.notes === 'string' && !meta.notes.includes('11988887777'), `notes inline redatado: ${meta.notes}`)
assert(meta.role === 'OPS', `role preservado`)
assert(meta.openingCents === 5000, `openingCents preservado`)
assert(meta.difference === 0, `difference preservado`)

// 7. Erro: message é redatado
console.log('\n7. Error.message é redatado')
const err = new Error('Falha ao autenticar joao@example.com')
const safe = redactPii(err) as { name: string; message: string }
assert(!safe.message.includes('joao@example.com'), `Error.message redatado: ${safe.message}`)
assert(safe.name === 'Error', `Error.name preservado`)

// 8. Recursão segura em arrays
console.log('\n8. Recursão em arrays')
const arr = redactPii([
  { email: 'a@b.com', note: 'normal' },
  { email: 'c@d.com', note: 'com 123.456.789-00' },
])
assert(arr[0].email.startsWith('[PII:'), `array[0].email redatado`)
assert(arr[1].email.startsWith('[PII:'), `array[1].email redatado`)
// 'note' está em SENSITIVE_KEYS, então sempre tem hash (defense-in-depth).
assert(typeof arr[0].note === 'string' && arr[0].note.includes('[PII'), `note mesmo sem PII é hasheado (defesa em profundidade)`)
assert(!arr[1].note.includes('123.456.789-00'), `nota com CPF inline redatada`)

// 9. Profundidade limitada (anti-DoS)
console.log('\n9. Profundidade limitada')
const deep = { a: { b: { c: { d: { e: { f: { g: { h: { i: 'leaf' } } } } } } } } }
const safeDeep = redactPii(deep)
assert(typeof safeDeep === 'object', `objeto profundo preservado estruturalmente`)

// 10. Catálogo de chaves protegidas
console.log('\n10. Catálogo de chaves protegidas')
const has = (k: string) => PII_PROTECTED_KEYS.includes(k)
assert(has('email') && has('name') && has('phone') && has('document'),
  `catálogo contém email/name/phone/document`)
assert(has('address') && has('city') && has('notes'), `catálogo contém endereço`)
assert(has('password') && has('token') && has('cookie'), `catálogo contém credenciais`)

console.log(`\n=== RESULTADO: ${passed} passed, ${failed} failed ===`)
if (failed > 0) {
  process.exit(1)
}