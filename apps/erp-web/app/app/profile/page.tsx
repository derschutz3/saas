'use client'

/**
 * Página "Meus dados (LGPD)" — Art. 18, V e VI da LGPD (Lei 13.709/2018).
 *
 * Permite ao titular (cliente final) ou ao OWNER/ADMIN:
 *  - **Exportar dados** (Art. 18, V): baixar todos os dados pessoais
 *    armazenados em formato portátil (JSON).
 *  - **Anonimizar dados** (Art. 18, VI): solicitar eliminação completa
 *    dos dados pessoais, preservando integridade referencial.
 *
 * UX:
 *  - Identifica o customerId via query string (?customerId=...) ou
 *    via campo de busca (OWNER/ADMIN pode buscar pelo nome).
 *  - Export mostra preview e botão de download (.json).
 *  - Anonymize exige confirmação dupla (digitar "ANONIMIZAR" + checkbox).
 *
 * SECURITY (LGPD):
 *  - As rotas do backend só aceitam OWNER/ADMIN (gated no middleware).
 *  - Após anonimização, a UI mostra estado "ANONIMIZADO" e bloqueia
 *    ações irreversíveis (LGPD Art. 16 — cumprimento da finalidade).
 *  - Logs/Audit do download e anonimização são registrados no backend.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Download, ShieldAlert, FileJson, Check, AlertTriangle, Lock, ShieldCheck,
  Trash2, Eye, EyeOff, Search,
} from 'lucide-react'
import {
  lgpdApi, downloadJson, type DataExportPayload, type CustomerProfile,
} from '@/lib/api/lgpd'

type Props = {
  /** Injetado via query string ?customerId=... ou via busca. */
  initialCustomerId?: string
  /** Função para notificar toast global. */
  onToast?: (kind: 'ok' | 'err', msg: string) => void
}

export default function LgpdProfilePage({ initialCustomerId, onToast }: Props) {
  const [customerId, setCustomerId] = useState<string>(initialCustomerId ?? '')
  const [data, setData] = useState<DataExportPayload['data'] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRawJson, setShowRawJson] = useState(false)
  const [confirmStep, setConfirmStep] = useState(0) // 0=idle, 1=ask, 2=type, 3=done
  const [confirmText, setConfirmText] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const toast = useCallback((kind: 'ok' | 'err', msg: string) => {
    if (onToast) onToast(kind, msg)
    else if (kind === 'err') console.error(msg)
    else console.log(msg)
  }, [onToast])

  // Carrega export ao montar se customerId foi passado
  useEffect(() => {
    if (initialCustomerId) {
      void fetchExport(initialCustomerId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCustomerId])

  const fetchExport = async (id: string) => {
    if (!id.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await lgpdApi.exportData(id.trim())
      setData(res.data)
      setCustomerId(id.trim())
      setConfirmStep(0)
      setConfirmText('')
      setUnderstood(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao exportar'
      setError(msg)
      toast('err', msg)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!data) return
    const filename = `lgpd-export-${customerId.slice(0, 8)}-${data.generatedAt.slice(0, 10)}.json`
    downloadJson({ ok: true, data }, filename)
    toast('ok', `Download iniciado: ${filename}`)
  }

  const handleAnonymize = async () => {
    if (!customerId || !understood || confirmText !== 'ANONIMIZAR') return
    setSubmitting(true)
    try {
      await lgpdApi.anonymize(customerId)
      toast('ok', 'Dados anonimizados com sucesso. A página será atualizada.')
      setConfirmStep(3)
      // Re-busca o export (vai mostrar tudo como CONSUMIDOR ANONIMIZADO)
      await fetchExport(customerId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao anonimizar'
      toast('err', msg)
    } finally {
      setSubmitting(false)
    }
  }

  const isAnonymized = data?.profile.name === 'CONSUMIDOR ANONIMIZADO'

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-6 w-6 text-indigo-600" />
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Meus dados (LGPD)</h1>
            <p className="mt-1 text-sm text-slate-600">
              Conforme a <strong>Lei Geral de Proteção de Dados (Lei 13.709/2018)</strong>,
              você tem direito de saber quais dados pessoais armazenamos e solicitar
              sua eliminação. Use esta página para exercer esses direitos.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex items-start gap-2 rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />
                <div>
                  <strong>Art. 18, V</strong> — Direito de acesso: exporte seus dados em JSON.
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                <Trash2 className="mt-0.5 h-3.5 w-3.5 text-rose-600" />
                <div>
                  <strong>Art. 18, VI</strong> — Eliminação: anonimize seus dados pessoais.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Buscar por ID */}
      {!initialCustomerId && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm" data-testid="lgpd-search-card">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Identificação</h2>
          <p className="mb-3 text-sm text-slate-600">
            Informe o ID do cliente para acessar seus dados. OWNER/ADMIN pode obter este ID em
            <strong> Configurações → Clientes</strong>.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="UUID do cliente (ex: 920f9837-...)"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              data-testid="lgpd-customer-id-input"
            />
            <button
              onClick={() => fetchExport(customerId)}
              disabled={loading || !customerId.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              data-testid="lgpd-search-button"
            >
              <Search className="h-4 w-4" />
              {loading ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4" role="alert">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-600" />
            <div className="text-sm text-rose-800">{error}</div>
          </div>
        </div>
      )}

      {/* Resultado do Export */}
      {data && (
        <>
          {/* Estado de anonimização */}
          {isAnonymized && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4" data-testid="lgpd-anonymized-badge">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 h-5 w-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-semibold text-emerald-900">Dados anonimizados</h3>
                  <p className="mt-1 text-sm text-emerald-800">
                    Este cliente já teve seus dados pessoais anonimizados em
                    <strong> {new Date(data.generatedAt).toLocaleString('pt-BR')}</strong>.
                    O registro é preservado apenas para fins de integridade contábil e auditoria legal.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Perfil */}
          <ProfileCard profile={data.profile} ordersCount={data.orders.length} />

          {/* Ações */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Export */}
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" data-testid="lgpd-export-card">
              <div className="mb-3 flex items-start gap-3">
                <FileJson className="mt-0.5 h-5 w-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Exportar dados (Art. 18, V)</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Baixe uma cópia completa dos seus dados em formato JSON portátil.
                  </p>
                </div>
              </div>
              <button
                onClick={handleDownload}
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                data-testid="lgpd-download-button"
              >
                <Download className="h-4 w-4" />
                Baixar JSON
              </button>
              <button
                onClick={() => setShowRawJson(!showRawJson)}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {showRawJson ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showRawJson ? 'Ocultar preview' : 'Ver preview'}
              </button>
              {showRawJson && (
                <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-slate-900 p-3 text-[10px] text-slate-100">
                  {JSON.stringify(data, null, 2)}
                </pre>
              )}
            </div>

            {/* Anonymize */}
            <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-5 shadow-sm" data-testid="lgpd-anonymize-card">
              <div className="mb-3 flex items-start gap-3">
                <Trash2 className="mt-0.5 h-5 w-5 text-rose-600" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Anonimizar (Art. 18, VI)</h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Substitui TODOS os campos pessoais por placeholders. Esta ação é
                    <strong> irreversível</strong> e preserva apenas integridade contábil.
                  </p>
                </div>
              </div>

              {confirmStep === 3 ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  <Check className="mr-1 inline h-3.5 w-3.5" />
                  Dados anonimizados em {new Date(data.generatedAt).toLocaleString('pt-BR')}.
                </div>
              ) : confirmStep === 0 ? (
                <button
                  onClick={() => setConfirmStep(1)}
                  disabled={isAnonymized}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  data-testid="lgpd-anonymize-button"
                >
                  <Trash2 className="h-4 w-4" />
                  {isAnonymized ? 'Já anonimizado' : 'Solicitar anonimização'}
                </button>
              ) : (
                <div className="space-y-2" data-testid="lgpd-anonymize-confirm">
                  <label className="flex items-start gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={understood}
                      onChange={(e) => setUnderstood(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                      data-testid="lgpd-anonymize-understood"
                    />
                    <span>
                      Estou ciente que esta ação <strong>NÃO PODE</strong> ser revertida.
                      Nome, email, telefone, endereço e notas serão zerados permanentemente.
                    </span>
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder='Digite "ANONIMIZAR" para confirmar'
                    className="w-full rounded-lg border border-rose-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    data-testid="lgpd-anonymize-confirm-text"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setConfirmStep(0); setConfirmText(''); setUnderstood(false) }}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleAnonymize}
                      disabled={!understood || confirmText !== 'ANONIMIZAR' || submitting}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      data-testid="lgpd-anonymize-confirm-button"
                    >
                      {submitting ? 'Processando...' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Audit trail */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            <strong>Trilha de auditoria:</strong> Esta ação será registrada no log de auditoria
            do sistema (LGPD Art. 37) com data, hora, usuário e cliente alvo. Os logs NÃO
            contêm dados pessoais — apenas identificadores técnicos.
          </div>
        </>
      )}
    </div>
  )
}

function ProfileCard({ profile, ordersCount }: { profile: CustomerProfile; ordersCount: number }) {
  const isAnon = profile.name === 'CONSUMIDOR ANONIMIZADO'
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm" data-testid="lgpd-profile-card">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Dados armazenados</h2>
          <p className="mt-1 text-xs text-slate-500">
            {isAnon ? 'Identidade removida (Art. 18, VI)' : 'Estes são os dados pessoais que armazenamos.'}
          </p>
        </div>
        {isAnon && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <Lock className="h-3 w-3" /> Anonimizado
          </span>
        )}
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="ID" value={profile.id} mono />
        <Field label="Nome" value={profile.name} />
        <Field label="Email" value={profile.email ?? '(vazio)'} />
        <Field label="Telefone" value={profile.phone ?? '(vazio)'} />
        <Field label="WhatsApp" value={profile.whatsapp ?? '(vazio)'} />
        <Field label="CPF / CNPJ" value={profile.tags.includes('CPF') ? '(armazenado, exibir sob demanda)' : '(vazio)'} />
        <Field label="Endereço" value={profile.address ?? '(vazio)'} />
        <Field label="Cidade / UF" value={[profile.city, profile.state].filter(Boolean).join(' / ') || '(vazio)'} />
        <Field label="CEP" value={profile.zip ?? '(vazio)'} />
        <Field label="Lifecycle" value={profile.lifecycle} />
        <Field label="Limite de crédito" value={`R$ ${(profile.creditLimitCents / 100).toFixed(2)}`} />
        <Field label="Pedidos" value={`${ordersCount} pedido(s)`} />
        <Field label="Criado em" value={new Date(profile.createdAt).toLocaleString('pt-BR')} />
        <Field label="Atualizado em" value={new Date(profile.updatedAt).toLocaleString('pt-BR')} />
        <Field label="Tags" value={profile.tags.join(', ') || '(sem tags)'} />
        <Field label="Notas" value={profile.notes ?? '(vazio)'} />
      </dl>
    </div>
  )
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-sm text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}
