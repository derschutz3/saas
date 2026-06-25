'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Server, Database, Cloud, Cpu, HardDrive, Wifi, Activity, RefreshCw } from 'lucide-react'

type ServiceStatus = 'ok' | 'degraded' | 'down'

type Service = {
  id: string
  name: string
  desc: string
  status: ServiceStatus
  latency: number
  uptime: string
  region: string
  icon: typeof Server
}

const INITIAL_SERVICES: Service[] = [
  { id: 'api', name: 'API Principal', desc: 'api.erpuniversal.com', status: 'ok', latency: 84, uptime: '99.99%', region: 'us-east-1', icon: Server },
  { id: 'db-primary', name: 'PostgreSQL (primary)', desc: 'RDS Multi-AZ', status: 'ok', latency: 12, uptime: '99.98%', region: 'us-east-1', icon: Database },
  { id: 'db-replica', name: 'PostgreSQL (replica)', desc: 'Read replica', status: 'ok', latency: 18, uptime: '99.97%', region: 'us-west-2', icon: Database },
  { id: 'redis', name: 'Redis cache', desc: 'Cluster de 3 nós', status: 'ok', latency: 3, uptime: '99.99%', region: 'us-east-1', icon: HardDrive },
  { id: 'queue', name: 'BullMQ workers', desc: '8 workers ativos', status: 'degraded', latency: 240, uptime: '99.92%', region: 'us-east-1', icon: Cpu },
  { id: 'storage', name: 'S3 Storage', desc: 'Documentos e backups', status: 'ok', latency: 62, uptime: '99.99%', region: 'us-east-1', icon: Cloud },
  { id: 'cdn', name: 'CloudFront CDN', desc: 'Assets estáticos', status: 'ok', latency: 28, uptime: '99.99%', region: 'global', icon: Wifi },
  { id: 'webhook', name: 'Webhook delivery', desc: 'Outbound webhooks', status: 'ok', latency: 142, uptime: '99.94%', region: 'us-east-1', icon: Activity },
]

const RESOURCES = [
  { label: 'CPU', used: 34, total: 100, tone: 'green' },
  { label: 'Memória', used: 61, total: 100, tone: 'yellow' },
  { label: 'Disco', used: 42, total: 100, tone: 'green' },
  { label: 'Rede I/O', used: 28, total: 100, tone: 'green' },
]

const STATUS_ICON = { ok: CheckCircle2, degraded: AlertTriangle, down: XCircle } as const
const STATUS_TONE = {
  ok: { color: 'hsl(142 71% 45%)', bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Operacional' },
  degraded: { color: 'hsl(38 92% 50%)', bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Degradado' },
  down: { color: 'hsl(0 86% 65%)', bg: 'bg-red-500/10', text: 'text-red-400', label: 'Fora do ar' },
}

const LOG_LINES = [
  { ts: '14:32:18', level: 'info', text: 'Worker job-import completed in 1.2s' },
  { ts: '14:32:14', level: 'info', text: 'Tenant t-1004 upgraded to Enterprise' },
  { ts: '14:31:58', level: 'warn', text: 'High latency on api-eu-west-1 (320ms > 250ms threshold)' },
  { ts: '14:31:42', level: 'info', text: 'Healthcheck OK for all 8 services' },
  { ts: '14:31:30', level: 'error', text: 'Webhook delivery failed for t-9821: 3 retries exhausted' },
  { ts: '14:31:12', level: 'info', text: 'Cache invalidated for 142 keys' },
  { ts: '14:30:54', level: 'info', text: 'Backup snapshot completed (4.2 GB uploaded)' },
]

const LEVEL_TONE = {
  info: 'text-blue-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
}

export default function SystemPage() {
  const [services, setServices] = useState(INITIAL_SERVICES)
  const [lastCheck, setLastCheck] = useState<string>('agora')

  const check = () => {
    setServices((prev) =>
      prev.map((s) => ({
        ...s,
        latency: Math.max(1, s.latency + Math.round((Math.random() - 0.5) * 30)),
      })),
    )
    setLastCheck('agora')
  }

  useEffect(() => {
    const id = setInterval(check, 8000)
    return () => clearInterval(id)
  }, [])

  const okCount = services.filter((s) => s.status === 'ok').length
  const degradedCount = services.filter((s) => s.status === 'degraded').length
  const downCount = services.filter((s) => s.status === 'down').length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white">Sistema</h1>
          <p className="text-sm text-white/50 mt-1">Saúde dos serviços, recursos e logs em tempo real</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-mono">Última verificação: {lastCheck}</span>
          <button onClick={check} className="btn-ghost h-9 gap-2 text-xs">
            <RefreshCw className="size-3.5" />
            Atualizar
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Operacional" value={okCount} tone="green" />
        <SummaryCard label="Degradado" value={degradedCount} tone="yellow" />
        <SummaryCard label="Fora do ar" value={downCount} tone="red" />
      </div>

      <div className="panel-solid p-5">
        <h2 className="text-sm font-semibold text-slate-100 mb-4">Serviços</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {services.map((s) => {
            const Icon = STATUS_ICON[s.status]
            const tone = STATUS_TONE[s.status]
            return (
              <div key={s.id} className="rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex size-9 items-center justify-center rounded-xl"
                      style={{ background: `${tone.color}15`, border: `1px solid ${tone.color}30` }}
                    >
                      <s.icon className="size-4" style={{ color: tone.color }} />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-100">{s.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{s.desc}</div>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${tone.bg}`}>
                    <Icon className={`size-3 ${tone.text}`} />
                    <span className={`text-[10px] font-bold ${tone.text}`}>{tone.label}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider">Latência</div>
                    <div className="text-xs font-bold text-slate-200 tabular-nums">{s.latency}ms</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider">Uptime</div>
                    <div className="text-xs font-bold text-slate-200 tabular-nums">{s.uptime}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-wider">Região</div>
                    <div className="text-xs font-bold text-slate-200 font-mono">{s.region}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="panel-solid p-5">
          <h2 className="text-sm font-semibold text-slate-100 mb-4">Recursos do cluster</h2>
          <div className="space-y-4">
            {RESOURCES.map((r) => {
              const color = {
                green: 'hsl(142 71% 45%)',
                yellow: 'hsl(38 92% 50%)',
                red: 'hsl(0 86% 65%)',
              }[r.tone]
              return (
                <div key={r.label}>
                  <div className="flex items-center justify-between mb-1.5 text-xs">
                    <span className="text-slate-300">{r.label}</span>
                    <span className="font-mono text-slate-400 tabular-nums">{r.used}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800/60 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${r.used}%`, background: color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="panel-solid p-5">
          <h2 className="text-sm font-semibold text-slate-100 mb-4">Logs recentes</h2>
          <div className="space-y-1 font-mono text-[11px] max-h-[280px] overflow-y-auto">
            {LOG_LINES.map((l, i) => (
              <div key={i} className="flex items-start gap-2 py-1">
                <span className="text-slate-600 shrink-0">{l.ts}</span>
                <span className={`uppercase shrink-0 font-bold ${LEVEL_TONE[l.level as 'info'|'warn'|'error']}`}>{l.level}</span>
                <span className="text-slate-300">{l.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'green' | 'yellow' | 'red' }) {
  const color = {
    green: 'hsl(142 71% 45%)',
    yellow: 'hsl(38 92% 50%)',
    red: 'hsl(0 86% 65%)',
  }[tone]
  return (
    <div className="panel-solid p-4 flex items-center gap-3">
      <div
        className="flex size-10 items-center justify-center rounded-xl"
        style={{ background: `${color}15`, border: `1px solid ${color}30` }}
      >
        <span className="text-lg font-black tabular-nums" style={{ color }}>{value}</span>
      </div>
      <div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
        <div className="text-xs text-slate-400">serviços</div>
      </div>
    </div>
  )
}
