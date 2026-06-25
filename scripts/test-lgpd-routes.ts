/**
 * Teste E2E dos endpoints LGPD (Lei 13.709/2018).
 *
 * SECURITY (LGPD): valida que os endpoints Art. 18 (acesso) e Art. 18, VI
 * (eliminação) funcionam corretamente e que o redator PII não vaza dados.
 *
 * Requisitos:
 *   - Servidor rodando em localhost:3001
 *   - Tenant demo com clientes seedados
 *
 * Roda com: tsx scripts/test-lgpd-routes.ts
 *
 * Variáveis:
 *   BASE_URL  (default: http://localhost:3001)
 *   ADMIN_EMAIL (default: admin@demo.com)
 *   ADMIN_PASS  (default: admin123)
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@demo.com'
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'admin123'

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

interface LoginResponse { token: string }
interface Customer { id: string; name: string; phone: string | null; email: string | null }

async function api(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data: unknown = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function main(): Promise<void> {
  console.log('=== LGPD ENDPOINTS — E2E ===\n')

  // 1. Login
  console.log('1. Login admin')
  const login = await api('POST', '/api/v1/auth/login', undefined, { email: ADMIN_EMAIL, password: ADMIN_PASS })
  assert(login.status === 200, `login OK (status ${login.status})`)
  const token = (login.data as LoginResponse).token
  assert(typeof token === 'string' && token.length > 50, `token JWT retornado`)

  // 2. Criar customer novo (com PII inline) e testar anonimização completa
  console.log('\n2. Criar customer para teste')
  const newCustBody = {
    name: 'Cliente Teste LGPD E2E',
    email: `lgpd-e2e-${Date.now()}@demo.com`,
    phone: '11999887766',
    address: 'Rua Teste, 100',
    city: 'São Paulo',
    state: 'SP',
    zip: '01000-000',
    notes: 'Anotações com email joao@empresa.com e CPF 987.654.321-00 inline',
  }
  const created = await api('POST', '/api/v1/customers', token, newCustBody)
  assert(created.status === 201, `customer criado (status ${created.status})`)
  const target = (created.data as Customer)
  assert(!!target?.id, `target customer: ${target.name}`)
  assert(target.phone === newCustBody.phone, `phone preservado após criação`)

  // 3. Data export (Art. 18, V)
  console.log('\n3. Data export (Art. 18, V)')
  const exp = await api('GET', `/api/v1/lgpd/customers/${target.id}/data-export`, token)
  assert(exp.status === 200, `data-export OK`)
  const exportData = exp.data as { ok: boolean; data: { profile: Customer; orders: unknown[]; generatedAt: string } }
  assert(exportData.ok === true, `payload ok=true`)
  assert(exportData.data.profile.id === target.id, `profile.id correto`)
  assert(typeof exportData.data.profile.name === 'string' && exportData.data.profile.name.length > 0, `profile.name presente`)
  assert(typeof exportData.data.generatedAt === 'string', `generatedAt presente`)

  // 4. Audit log NÃO contém PII (verifica metadata sanitizado)
  console.log('\n4. Audit log SEM PII (LGPD)')
  const audit = await api('GET', `/api/v1/audit/events?entityType=Customer&entityId=${target.id}`, token)
  assert(audit.status === 200, `audit/events OK`)
  const auditItems = ((audit.data as { items: Array<{ entityId: string; metadata: Record<string, unknown>; action: string }> }).items ?? []) as Array<{ entityId: string; metadata: Record<string, unknown>; action: string }>
  // Pega eventos do target customer via entityId
  const relevant = auditItems.filter((a) => a.entityId === target.id)
  assert(relevant.length > 0, `há ${relevant.length} audit event(s) do customer target`)
  for (const a of relevant) {
    const metaStr = JSON.stringify(a.metadata ?? {})
    // SECURITY: metadata NÃO deve conter PII em texto claro (só hashes)
    const containsRawPii = /"email":"[^P]/.test(metaStr) ||
      /"phone":"\d/.test(metaStr) ||
      /"name":"[A-Z][a-z]+/.test(metaStr)
    assert(!containsRawPii, `audit.metadata de ${a.action} NÃO contém PII em texto claro`)
  }

  // 5. Acesso negado para não-admin
  console.log('\n5. Controle de acesso (não-admin)')
  // Cria um usuário CASHIER
  const cashier = await api('POST', '/api/v1/settings/users', token, {
    name: 'Teste LGPD E2E',
    email: `lgpd-e2e-${Date.now()}@demo.com`,
    password: 'teste123',
    role: 'CASHIER',
    enabledModules: ['dashboard'],
  })
  if (cashier.status === 201) {
    const cashierTokenRes = await api('POST', '/api/v1/auth/login', undefined, {
      email: (cashier.data as { email: string }).email,
      password: 'teste123',
    })
    if (cashierTokenRes.status === 200) {
      const cashierToken = (cashierTokenRes.data as LoginResponse).token
      const expForbidden = await api('GET', `/api/v1/lgpd/customers/${target.id}/data-export`, cashierToken)
      assert(expForbidden.status === 403, `CASHIER recebe 403 ao tentar acessar data-export (got ${expForbidden.status})`)
      const anonForbidden = await api('POST', `/api/v1/lgpd/customers/${target.id}/anonymize`, cashierToken, {})
      assert(anonForbidden.status === 403, `CASHIER recebe 403 ao tentar anonimizar`)
    }
  }

  // 6. Anonimização (Art. 18, VI)
  console.log('\n6. Anonimização (Art. 18, VI)')
  const anon = await api('POST', `/api/v1/lgpd/customers/${target.id}/anonymize`, token, {})
  assert(anon.status === 200, `anonymize OK`)
  const anonData = anon.data as { ok: boolean; customerId: string; anonymizedAt: string }
  assert(anonData.ok === true, `ok=true`)
  assert(anonData.customerId === target.id, `customerId preservado`)

  // 7. Verificar anonimização
  console.log('\n7. Verificar anonimização')
  const after = await api('GET', '/api/v1/customers', token)
  const afterCust = ((after.data as { items: Customer[] }).items ?? []).find((c) => c.id === target.id)
  assert(afterCust?.name === 'CONSUMIDOR ANONIMIZADO', `name virou 'CONSUMIDOR ANONIMIZADO' (got: '${afterCust?.name}')`)
  assert(afterCust?.phone === null, `phone foi zerado (got: '${afterCust?.phone}')`)
  assert(afterCust?.email === null, `email foi zerado`)

  // 8. Idempotência: anonimizar de novo não dá erro
  console.log('\n8. Idempotência')
  const anon2 = await api('POST', `/api/v1/lgpd/customers/${target.id}/anonymize`, token, {})
  assert(anon2.status === 200, `segunda anonimização OK`)

  // 9. Audit purge (Art. 16 LGPD)
  console.log('\n9. Audit purge (Art. 16 — política de retenção)')
  const dryRun = await api('POST', '/api/v1/lgpd/maintenance/audit-purge', token, { dryRun: true })
  assert(dryRun.status === 200, `purge dry-run OK`)
  const dryRunData = dryRun.data as { mode: string; totalEvents: number; wouldDelete: number; nextRunRecommended: string }
  assert(dryRunData.mode === 'dryRun', `mode=dryRun`)
  assert(typeof dryRunData.totalEvents === 'number', `totalEvents é número`)
  assert(typeof dryRunData.wouldDelete === 'number', `wouldDelete é número`)
  assert(typeof dryRunData.nextRunRecommended === 'string', `nextRunRecommended presente`)
  const exec = await api('POST', '/api/v1/lgpd/maintenance/audit-purge', token, {})
  assert(exec.status === 200, `purge execute OK`)
  const execData = exec.data as { mode: string; deletedCount: number; cutoff: string }
  assert(execData.mode === 'execute', `mode=execute`)
  assert(execData.deletedCount >= 0, `deletedCount válido: ${execData.deletedCount}`)

  console.log(`\n=== RESULTADO: ${passed} passed, ${failed} failed ===`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
