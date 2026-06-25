import { getStore } from './store.js'

const jitter = () => Math.floor(Math.random() * 250)

export const startFiscalWorker = () => {
  const intervalMs = Math.max(1500, Number(process.env.FISCAL_WORKER_INTERVAL_MS ?? 3500))

  setInterval(async () => {
    const store = await getStore()
    const tenantId = await store.getDefaultTenantId()
    if (!tenantId) return
    const pending = await store.listPendingFiscalDocuments({ tenantId })
    if (pending.length === 0) return

    const batch = pending.slice(0, 6)
    for (const doc of batch) {
      await new Promise((r) => setTimeout(r, 150 + jitter()))
      const ok = Math.random() > 0.18
      await store.updateFiscalDocument({
        tenantId: doc.tenantId,
        fiscalDocumentId: doc.id,
        patch: ok
          ? { status: 'AUTHORIZED', errorMessage: null }
          : { status: 'REJECTED', errorMessage: 'Rejeição simulada: verifique cadastro fiscal' },
      })
      await store.audit({
        tenantId: doc.tenantId,
        userId: 'system',
        action: 'FISCAL_PROCESS',
        entityType: 'FISCAL_DOCUMENT',
        entityId: doc.id,
        metadata: { status: ok ? 'AUTHORIZED' : 'REJECTED' },
      })
    }
  }, intervalMs)
}
