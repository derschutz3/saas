'use client'

/**
 * Página de Caixa (Cash Register).
 *
 * UX:
 * - Se não houver sessão aberta: card de "Abrir Caixa" com formulário simples
 * - Se houver sessão aberta: painel de "Sessão em andamento" com:
 *     • KPIs: Abertura, Esperado, Vendas, Movimentos
 *     • Ações: Registrar venda/sangria/suprimento/gorjeta/ajuste
 *     • Lista de movimentos da sessão
 *     • Botão "Fechar Caixa" com confirmação e contagem
 * - Histórico de sessões anteriores com filtro (abertas/fechadas/todas)
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Wallet, Plus, Lock, X, Check, AlertTriangle, ArrowDown, ArrowUp,
  Banknote, ShoppingCart, RefreshCw, Settings, Coffee, Minus, PlusCircle,
  History, Calculator,
} from 'lucide-react'
import {
  cashApi, formatMoneyCents, formatDateTime,
  MOVEMENT_LABELS, MOVEMENT_TONE,
  type CashSession, type CashMovement, type CashMovementType,
} from '@/lib/api/cash'
import { useFetch } from '@/lib/use-fetch'

const KEY_OPEN = 'cash:open:v1'
const KEY_SESSIONS = 'cash:sessions:all:v1'
const KEY_MOVS = 'cash:movements:v1'

export default function CashPage() {
  const [historyFilter, setHistoryFilter] = useState<'all' | 'open' | 'closed'>('all')

  const openFetch = useFetch(KEY_OPEN, () => cashApi.getOpenSession(), { ttl: 3000 })
  const sessionsFetch = useFetch(KEY_SESSIONS, () => cashApi.listSessions('all'), { ttl: 5000 })
  const movementsFetch = useFetch(KEY_MOVS, () => cashApi.listMovements(), { ttl: 5000 })

  const openSession = openFetch.data?.session ?? null

  const [openFormOpen, setOpenFormOpen] = useState(false)
  const [moveForm, setMoveForm] = useState<{ open: boolean; type: CashMovementType }>({ open: false, type: 'sale' })
  const [closeFormOpen, setCloseFormOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const refresh = useCallback(async () => {
    await Promise.all([openFetch.mutate(), sessionsFetch.mutate(), movementsFetch.mutate()])
  }, [openFetch, sessionsFetch, movementsFetch])

  const flash = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg })
    setTimeout(() => setToast(null), 3500)
  }, [])

  // Bloquear scroll do body em modais
  useEffect(() => {
    const anyOpen = openFormOpen || moveForm.open || closeFormOpen
    if (anyOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
    return undefined
  }, [openFormOpen, moveForm.open, closeFormOpen])

  useEffect(() => {
    if (!openFormOpen && !moveForm.open && !closeFormOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        if (openFormOpen) setOpenFormOpen(false)
        if (moveForm.open) setMoveForm({ open: false, type: 'sale' })
        if (closeFormOpen) setCloseFormOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openFormOpen, moveForm.open, closeFormOpen, busy])

  const allSessions = sessionsFetch.data?.items ?? []
  const filteredSessions = useMemo(
    () => allSessions
      .filter((s) => historyFilter === 'all' || s.status === historyFilter)
      // evita duplicar a sessão ativa (que já é exibida no topo)
      .filter((s) => !openSession || s.id !== openSession.id),
    [allSessions, historyFilter, openSession],
  )

  const sessionMovements = useMemo(() => {
    if (!openSession) return []
    const all = movementsFetch.data?.items ?? []
    return all.filter((m) => m.sessionId === openSession.id)
  }, [openSession, movementsFetch.data])

  const stats = useMemo(() => {
    const sales = sessionMovements.filter((m) => m.type === 'sale').reduce((a, m) => a + m.amountCents, 0)
    const withdrawals = sessionMovements.filter((m) => m.type === 'withdrawal').reduce((a, m) => a + m.amountCents, 0)
    const supplies = sessionMovements.filter((m) => m.type === 'supply').reduce((a, m) => a + m.amountCents, 0)
    const tips = sessionMovements.filter((m) => m.type === 'tip').reduce((a, m) => a + m.amountCents, 0)
    const adjustments = sessionMovements.filter((m) => m.type === 'adjustment').reduce((a, m) => a + m.amountCents, 0)
    return { sales, withdrawals, supplies, tips, adjustments }
  }, [sessionMovements])

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Wallet className="h-5 w-5 text-slate-400" />
            Caixa
          </h1>
          <p className="text-sm text-slate-500">
            {openSession
              ? `Sessão aberta em ${formatDateTime(openSession.openedAt)} · operador: ${openSession.operatorName}`
              : 'Nenhuma sessão aberta no momento.'}
          </p>
        </div>
        {openSession ? (
          <button
            type="button"
            className="h-10 px-4 text-sm font-semibold bg-rose-700 hover:bg-rose-600 text-white rounded-md flex items-center gap-2 shadow-lg shadow-rose-900/30"
            onClick={() => setCloseFormOpen(true)}
            disabled={busy}
          >
            <Lock className="h-4 w-4" />
            <span>Fechar Caixa</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary h-10 px-4 text-sm font-semibold flex items-center gap-2 shadow-lg shadow-emerald-900/30"
            onClick={() => setOpenFormOpen(true)}
            disabled={busy}
          >
            <Plus className="h-5 w-5" />
            <span>Abrir Caixa</span>
          </button>
        )}
      </div>

      {/* SESSÃO ATIVA */}
      {openSession ? (
        <ActiveSession
          session={openSession}
          stats={stats}
          movements={sessionMovements}
          busy={busy}
          onNewMovement={(type) => setMoveForm({ open: true, type })}
          onClose={() => setCloseFormOpen(true)}
        />
      ) : (
        <div className="card p-8 text-center">
          <div className="h-16 w-16 rounded-full bg-slate-800/60 flex items-center justify-center mx-auto mb-4">
            <Banknote className="h-8 w-8 text-slate-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-200">Nenhum caixa aberto</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Para começar a registrar vendas, sangrias e outras movimentações, abra uma nova sessão de caixa informando o fundo de troco.
          </p>
          <button
            type="button"
            className="btn-primary h-10 px-4 text-sm font-semibold inline-flex items-center gap-2 mt-4"
            onClick={() => setOpenFormOpen(true)}
            disabled={busy}
          >
            <Plus className="h-5 w-5" />
            <span>Abrir Caixa</span>
          </button>
        </div>
      )}

      {/* HISTÓRICO */}
      <div className="card overflow-hidden">
        <div className="card-top-line" />
        <div className="px-5 py-3 border-b border-slate-800/40 flex items-center gap-3 flex-wrap">
          <History className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-200">Histórico de sessões</span>
          <select
            className="input-base h-8 text-xs px-2 ml-auto"
            value={historyFilter}
            onChange={(e) => setHistoryFilter(e.target.value as 'all' | 'open' | 'closed')}
            disabled={busy}
          >
            <option value="all">Todas</option>
            <option value="open">Abertas</option>
            <option value="closed">Fechadas</option>
          </select>
          <button
            type="button"
            className="h-8 px-2 text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
            onClick={() => refresh()}
            disabled={busy}
            title="Recarregar"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="divide-y divide-slate-800/40">
          {filteredSessions.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-500">Nenhuma sessão no histórico.</div>
          )}
          {filteredSessions.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </div>
      </div>

      {/* MODAL: Abrir Caixa */}
      {openFormOpen && <OpenCashForm onClose={() => setOpenFormOpen(false)} busy={busy} setBusy={setBusy} refresh={refresh} flash={flash} />}

      {/* MODAL: Movimento */}
      {moveForm.open && openSession && (
        <MovementForm
          sessionId={openSession.id}
          type={moveForm.type}
          onClose={() => setMoveForm({ open: false, type: 'sale' })}
          busy={busy}
          setBusy={setBusy}
          refresh={refresh}
          flash={flash}
        />
      )}

      {/* MODAL: Fechar Caixa */}
      {closeFormOpen && openSession && (
        <CloseCashForm
          session={openSession}
          expectedCents={openSession.expectedCents}
          onClose={() => setCloseFormOpen(false)}
          busy={busy}
          setBusy={setBusy}
          refresh={refresh}
          flash={flash}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-md shadow-lg text-sm font-medium ${
            toast.kind === 'ok'
              ? 'bg-emerald-900/90 border border-emerald-700 text-emerald-100'
              : 'bg-rose-900/90 border border-rose-700 text-rose-100'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ============ SESSÃO ATIVA ============

type ActiveSessionProps = {
  session: CashSession
  stats: { sales: number; withdrawals: number; supplies: number; tips: number; adjustments: number }
  movements: CashMovement[]
  busy: boolean
  onNewMovement: (type: CashMovementType) => void
  onClose: () => void
}

function ActiveSession({ session, stats, movements, busy, onNewMovement, onClose }: ActiveSessionProps) {
  return (
    <>
      {/* KPIs da sessão */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Abertura" value={formatMoneyCents(session.openingCents)} color="text-slate-200" icon={Banknote} />
        <KpiCard label="Vendas" value={formatMoneyCents(stats.sales)} color="text-emerald-300" icon={ShoppingCart} />
        <KpiCard label="Suprimentos" value={formatMoneyCents(stats.supplies)} color="text-sky-300" icon={PlusCircle} />
        <KpiCard label="Sangrias" value={formatMoneyCents(stats.withdrawals)} color="text-rose-300" icon={Minus} />
        <KpiCard label="Esperado em caixa" value={formatMoneyCents(session.expectedCents)} color="text-amber-300" icon={Calculator} highlight />
      </div>

      {/* Ações rápidas */}
      <div className="card p-4">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-3">Ações rápidas</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <button type="button" className="h-12 rounded-md bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-200 text-xs font-semibold flex flex-col items-center justify-center gap-0.5 disabled:opacity-50" onClick={() => onNewMovement('sale')} disabled={busy}>
            <ShoppingCart className="h-4 w-4" />
            <span>Venda</span>
          </button>
          <button type="button" className="h-12 rounded-md bg-sky-900/30 hover:bg-sky-900/50 text-sky-200 text-xs font-semibold flex flex-col items-center justify-center gap-0.5 disabled:opacity-50" onClick={() => onNewMovement('supply')} disabled={busy}>
            <PlusCircle className="h-4 w-4" />
            <span>Suprimento</span>
          </button>
          <button type="button" className="h-12 rounded-md bg-rose-900/30 hover:bg-rose-900/50 text-rose-200 text-xs font-semibold flex flex-col items-center justify-center gap-0.5 disabled:opacity-50" onClick={() => onNewMovement('withdrawal')} disabled={busy}>
            <Minus className="h-4 w-4" />
            <span>Sangria</span>
          </button>
          <button type="button" className="h-12 rounded-md bg-amber-900/30 hover:bg-amber-900/50 text-amber-200 text-xs font-semibold flex flex-col items-center justify-center gap-0.5 disabled:opacity-50" onClick={() => onNewMovement('tip')} disabled={busy}>
            <Coffee className="h-4 w-4" />
            <span>Gorjeta</span>
          </button>
          <button type="button" className="h-12 rounded-md bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex flex-col items-center justify-center gap-0.5 disabled:opacity-50" onClick={() => onNewMovement('adjustment')} disabled={busy}>
            <Settings className="h-4 w-4" />
            <span>Ajuste</span>
          </button>
        </div>
      </div>

      {/* Movimentos da sessão */}
      <div className="card overflow-hidden">
        <div className="card-top-line" />
        <div className="px-5 py-3 border-b border-slate-800/40 flex items-center gap-3">
          <History className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-200">Movimentos desta sessão</span>
          <span className="text-xs text-slate-500 ml-auto">{movements.length} lançamento(s)</span>
        </div>
        <div className="divide-y divide-slate-800/40">
          {movements.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-500">Nenhum movimento registrado ainda.</div>
          )}
          {movements.map((m) => (
            <MovementRow key={m.id} movement={m} />
          ))}
        </div>
      </div>
    </>
  )
}

function KpiCard({ label, value, color, icon: Icon, highlight }: { label: string; value: string; color: string; icon: typeof Banknote; highlight?: boolean }) {
  return (
    <div className={`card p-3 ${highlight ? 'ring-1 ring-amber-700/50' : ''}`}>
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-slate-800/60 flex items-center justify-center shrink-0">
          <Icon className={`h-3.5 w-3.5 ${color}`} />
        </div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{label}</div>
      </div>
      <div className={`text-lg font-bold ${color} mt-1 truncate`}>{value}</div>
    </div>
  )
}

function SessionRow({ session }: { session: CashSession }) {
  const diff = session.differenceCents ?? 0
  return (
    <div className="px-5 py-3 flex items-center gap-3 hover:bg-slate-900/40">
      <div className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0 ${session.status === 'open' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-slate-800/60 text-slate-400'}`}>
        {session.status === 'open' ? <Banknote className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          {session.registerName} <span className="text-[10px] uppercase tracking-wider text-slate-500">· {session.operatorName}</span>
        </div>
        <div className="text-xs text-slate-500">
          Aberto em {formatDateTime(session.openedAt)}
          {session.closedAt && ` · Fechado em ${formatDateTime(session.closedAt)}`}
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-mono font-semibold text-slate-200">
          {session.status === 'open' ? formatMoneyCents(session.expectedCents) : formatMoneyCents(session.closingCents)}
        </div>
        {session.status === 'closed' && (
          <div className={`text-[10px] ${diff === 0 ? 'text-emerald-400' : diff > 0 ? 'text-sky-400' : 'text-rose-400'}`}>
            {diff === 0 ? 'OK' : diff > 0 ? `+${formatMoneyCents(diff)}` : formatMoneyCents(diff)}
          </div>
        )}
      </div>
    </div>
  )
}

function MovementRow({ movement }: { movement: CashMovement }) {
  const isOut = movement.amountCents < 0
  return (
    <div className="px-5 py-2.5 flex items-center gap-3 hover:bg-slate-900/40">
      <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${isOut ? 'bg-rose-900/30 text-rose-300' : 'bg-emerald-900/30 text-emerald-300'}`}>
        {isOut ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-100 flex items-center gap-2">
          <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${MOVEMENT_TONE[movement.type]}`}>
            {MOVEMENT_LABELS[movement.type]}
          </span>
          {movement.reason && <span className="text-slate-300 truncate text-xs">{movement.reason}</span>}
        </div>
        <div className="text-[10px] text-slate-500">{formatDateTime(movement.createdAt)}</div>
      </div>
      <div className={`text-sm font-mono font-semibold ${isOut ? 'text-rose-300' : 'text-emerald-300'}`}>
        {isOut ? '−' : '+'}{formatMoneyCents(Math.abs(movement.amountCents))}
      </div>
    </div>
  )
}

// ============ FORMS ============

type OpenFormProps = {
  onClose: () => void
  busy: boolean
  setBusy: (b: boolean) => void
  refresh: () => Promise<void>
  flash: (k: 'ok' | 'err', m: string) => void
}

function OpenCashForm({ onClose, busy, setBusy, refresh, flash }: OpenFormProps) {
  const [operatorName, setOperatorName] = useState('')
  const [registerName, setRegisterName] = useState('Caixa Principal')
  const [opening, setOpening] = useState('0,00')
  const [notes, setNotes] = useState('')

  const submit = async () => {
    if (!operatorName.trim()) {
      flash('err', 'Informe o nome do operador')
      return
    }
    const cents = Math.round(Number(opening.replace(',', '.')) * 100)
    if (!Number.isFinite(cents) || cents < 0) {
      flash('err', 'Valor de abertura inválido')
      return
    }
    setBusy(true)
    try {
      await cashApi.openSession({
        registerName: registerName.trim() || 'Caixa Principal',
        operatorName: operatorName.trim(),
        openingCents: cents,
        notes: notes.trim() || null,
      })
      flash('ok', 'Caixa aberto com sucesso')
      onClose()
      await refresh()
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Erro ao abrir caixa')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="card max-w-md w-full p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Abrir Caixa</h2>
            <p className="text-xs text-slate-500">Informe o fundo de troco e o operador responsável.</p>
          </div>
          <button type="button" className="p-1.5 rounded hover:bg-slate-800 text-slate-400" onClick={onClose} disabled={busy}><X className="h-4 w-4" /></button>
        </div>
        <div>
          <label htmlFor="op-name" className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Operador *</label>
          <input id="op-name" type="text" className="input-base h-10 w-full px-3 mt-1 text-sm" placeholder="Nome do operador" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} disabled={busy} autoFocus />
        </div>
        <div>
          <label htmlFor="op-reg" className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Nome do caixa</label>
          <input id="op-reg" type="text" className="input-base h-10 w-full px-3 mt-1 text-sm" placeholder="Caixa Principal" value={registerName} onChange={(e) => setRegisterName(e.target.value)} disabled={busy} />
        </div>
        <div>
          <label htmlFor="op-open" className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Fundo de troco (R$)</label>
          <input id="op-open" type="text" inputMode="decimal" className="input-base h-10 w-full px-3 mt-1 text-sm font-mono" placeholder="0,00" value={opening} onChange={(e) => setOpening(e.target.value)} disabled={busy} />
        </div>
        <div>
          <label htmlFor="op-notes" className="text-xs text-slate-400">Observações</label>
          <textarea id="op-notes" className="input-base min-h-[50px] w-full px-3 py-2 mt-1 text-sm resize-y" placeholder="Opcional" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/40">
          <button type="button" className="btn-ghost h-10 text-sm px-4" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="btn-primary h-10 text-sm px-5 font-semibold flex items-center gap-2" onClick={submit} disabled={busy || !operatorName.trim()}>
            {busy ? <><span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Abrindo…</> : <><Check className="h-4 w-4" /> Abrir caixa</>}
          </button>
        </div>
      </div>
    </div>
  )
}

type MovementFormProps = {
  sessionId: string
  type: CashMovementType
  onClose: () => void
  busy: boolean
  setBusy: (b: boolean) => void
  refresh: () => Promise<void>
  flash: (k: 'ok' | 'err', m: string) => void
}

function MovementForm({ sessionId, type, onClose, busy, setBusy, refresh, flash }: MovementFormProps) {
  const isOut = type === 'withdrawal'
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [direction, setDirection] = useState<'in' | 'out'>(isOut ? 'out' : 'in')

  const submit = async () => {
    const abs = Math.abs(Number(amount.replace(',', '.')))
    if (!Number.isFinite(abs) || abs <= 0) {
      flash('err', 'Valor inválido')
      return
    }
    const cents = Math.round(abs * 100) * (direction === 'out' ? -1 : 1)
    setBusy(true)
    try {
      await cashApi.addMovement({
        sessionId,
        type,
        amountCents: cents,
        reason: reason.trim() || null,
      })
      flash('ok', 'Movimento registrado')
      onClose()
      await refresh()
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Erro ao registrar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="card max-w-md w-full p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${MOVEMENT_TONE[type]}`}>{MOVEMENT_LABELS[type]}</span>
              Registrar movimento
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{type === 'sale' ? 'Entrada por venda' : type === 'supply' ? 'Entrada de suprimento' : type === 'withdrawal' ? 'Saída (sangria)' : type === 'tip' ? 'Entrada de gorjeta' : 'Ajuste manual'}</p>
          </div>
          <button type="button" className="p-1.5 rounded hover:bg-slate-800 text-slate-400" onClick={onClose} disabled={busy}><X className="h-4 w-4" /></button>
        </div>
        {type !== 'sale' && type !== 'withdrawal' && (
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Direção</label>
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => setDirection('in')} className={`flex-1 h-10 rounded-md text-sm font-semibold ${direction === 'in' ? 'bg-emerald-900/40 text-emerald-200 ring-1 ring-emerald-700' : 'bg-slate-800/40 text-slate-300'}`}>Entrada</button>
              <button type="button" onClick={() => setDirection('out')} className={`flex-1 h-10 rounded-md text-sm font-semibold ${direction === 'out' ? 'bg-rose-900/40 text-rose-200 ring-1 ring-rose-700' : 'bg-slate-800/40 text-slate-300'}`}>Saída</button>
            </div>
          </div>
        )}
        <div>
          <label htmlFor="mv-amount" className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Valor (R$)</label>
          <input id="mv-amount" type="text" inputMode="decimal" className="input-base h-11 w-full px-3 mt-1 text-base font-mono" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} autoFocus />
        </div>
        <div>
          <label htmlFor="mv-reason" className="text-xs text-slate-400">Motivo / observação</label>
          <input id="mv-reason" type="text" className="input-base h-10 w-full px-3 mt-1 text-sm" placeholder="Opcional" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/40">
          <button type="button" className="btn-ghost h-10 text-sm px-4" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="btn-primary h-10 text-sm px-5 font-semibold flex items-center gap-2" onClick={submit} disabled={busy || !amount.trim()}>
            {busy ? <><span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Salvando…</> : <><Check className="h-4 w-4" /> Registrar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

type CloseFormProps = {
  session: CashSession
  expectedCents: number
  onClose: () => void
  busy: boolean
  setBusy: (b: boolean) => void
  refresh: () => Promise<void>
  flash: (k: 'ok' | 'err', m: string) => void
}

function CloseCashForm({ session, expectedCents, onClose, busy, setBusy, refresh, flash }: CloseFormProps) {
  const [closing, setClosing] = useState((expectedCents / 100).toFixed(2).replace('.', ','))
  const [notes, setNotes] = useState('')

  const closingCents = Math.round(Number(closing.replace(',', '.')) * 100)
  const diff = Number.isFinite(closingCents) ? closingCents - expectedCents : 0

  const submit = async () => {
    if (!Number.isFinite(closingCents) || closingCents < 0) {
      flash('err', 'Valor de fechamento inválido')
      return
    }
    setBusy(true)
    try {
      await cashApi.closeSession(session.id, {
        closingCents,
        notes: notes.trim() || null,
      })
      flash('ok', 'Caixa fechado com sucesso')
      onClose()
      await refresh()
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Erro ao fechar caixa')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="card max-w-md w-full p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-rose-900/30 flex items-center justify-center">
            <Lock className="h-6 w-6 text-rose-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100">Fechar Caixa</h2>
            <p className="text-sm text-slate-400">Conte o caixa e informe o valor final.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-3 bg-slate-900/60">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Esperado</div>
            <div className="text-lg font-mono font-bold text-amber-300 mt-1">{formatMoneyCents(expectedCents)}</div>
          </div>
          <div className="card p-3 bg-slate-900/60">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Diferença</div>
            <div className={`text-lg font-mono font-bold mt-1 ${diff === 0 ? 'text-emerald-300' : diff > 0 ? 'text-sky-300' : 'text-rose-300'}`}>
              {diff === 0 ? 'OK' : diff > 0 ? `+${formatMoneyCents(diff)}` : formatMoneyCents(diff)}
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="cl-amount" className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Valor contado (R$)</label>
          <input id="cl-amount" type="text" inputMode="decimal" className="input-base h-11 w-full px-3 mt-1 text-base font-mono" value={closing} onChange={(e) => setClosing(e.target.value)} disabled={busy} autoFocus />
        </div>
        <div>
          <label htmlFor="cl-notes" className="text-xs text-slate-400">Observações do fechamento</label>
          <textarea id="cl-notes" className="input-base min-h-[50px] w-full px-3 py-2 mt-1 text-sm resize-y" placeholder="Justifique diferenças, ocorrências…" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
        </div>
        {diff !== 0 && (
          <div className="bg-amber-900/20 border border-amber-800/50 rounded-md p-3 text-xs text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
            Diferença de {diff > 0 ? 'sobra' : 'falta'} detectada. Esta será registrada para auditoria.
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/40">
          <button type="button" className="btn-ghost h-10 text-sm px-4" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="h-10 text-sm px-5 font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-md disabled:opacity-50 flex items-center gap-2" onClick={submit} disabled={busy}>
            {busy ? <><span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Fechando…</> : <><Lock className="h-4 w-4" /> Fechar caixa</>}
          </button>
        </div>
      </div>
    </div>
  )
}
