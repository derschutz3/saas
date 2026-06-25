'use client'

import { useState } from 'react'
import { Save, Globe, Lock, CreditCard, Bell, Shield, Code, Database, Mail } from 'lucide-react'

type Section = {
  id: string
  label: string
  icon: typeof Globe
}

const SECTIONS: Section[] = [
  { id: 'general', label: 'Geral', icon: Globe },
  { id: 'auth', label: 'Autenticação', icon: Lock },
  { id: 'billing', label: 'Cobrança', icon: CreditCard },
  { id: 'notifications', label: 'Notificações', icon: Bell },
  { id: 'security', label: 'Segurança', icon: Shield },
  { id: 'api', label: 'API & Webhooks', icon: Code },
  { id: 'data', label: 'Dados & LGPD', icon: Database },
]

export default function SettingsPage() {
  const [active, setActive] = useState<Section['id']>('general')
  const [platformName, setPlatformName] = useState('ERP Universal')
  const [supportEmail, setSupportEmail] = useState('suporte@erpuniversal.com')
  const [primaryColor, setPrimaryColor] = useState('#3b82f6')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white">Ajustes da plataforma</h1>
          <p className="text-sm text-white/50 mt-1">Configurações globais que afetam todos os tenants</p>
        </div>
        <button className="btn-primary h-9 gap-2 px-4 text-xs">
          <Save className="size-3.5" />
          Salvar alterações
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <nav className="panel-solid p-2 h-fit">
          {SECTIONS.map((s) => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  active === s.id
                    ? 'bg-blue-500/10 text-blue-300'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className="size-3.5" />
                {s.label}
              </button>
            )
          })}
        </nav>

        <div className="panel-solid p-5">
          {active === 'general' && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-3">Geral</h2>
              <Field label="Nome da plataforma">
                <input
                  type="text"
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  className="form-input"
                />
              </Field>
              <Field label="E-mail de suporte">
                <input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="form-input"
                />
              </Field>
              <Field label="Cor primária">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="size-10 rounded-lg border border-slate-800/60 bg-slate-950"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="form-input flex-1"
                  />
                </div>
              </Field>
              <Field label="Idioma padrão">
                <select className="form-input">
                  <option>Português (Brasil)</option>
                  <option>English (US)</option>
                  <option>Español</option>
                </select>
              </Field>
              <Field label="Fuso horário padrão">
                <select className="form-input">
                  <option>America/Sao_Paulo (UTC-3)</option>
                  <option>America/New_York (UTC-5)</option>
                  <option>Europe/Lisbon (UTC+0)</option>
                </select>
              </Field>
            </div>
          )}

          {active === 'auth' && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-3">Autenticação</h2>
              <ToggleField label="Permitir login com e-mail e senha" defaultChecked />
              <ToggleField label="Permitir login com Google OAuth" defaultChecked />
              <ToggleField label="Permitir login com Microsoft" />
              <ToggleField label="Permitir SSO (SAML)" />
              <Field label="Tempo de sessão (minutos)">
                <input type="number" defaultValue={480} className="form-input" />
              </Field>
              <Field label="Forçar troca de senha a cada (dias)">
                <input type="number" defaultValue={90} className="form-input" />
              </Field>
            </div>
          )}

          {active === 'billing' && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-3">Cobrança</h2>
              <Field label="Gateway de pagamento">
                <select className="form-input">
                  <option>Stripe</option>
                  <option>Iugu</option>
                  <option>Mercado Pago</option>
                </select>
              </Field>
              <Field label="Moeda padrão">
                <select className="form-input">
                  <option>BRL (R$)</option>
                  <option>USD ($)</option>
                  <option>EUR (€)</option>
                </select>
              </Field>
              <ToggleField label="Cobrar automaticamente na renovação" defaultChecked />
              <ToggleField label="Permitir upgrade/downgrade de plano" defaultChecked />
              <ToggleField label="Enviar nota fiscal após pagamento" defaultChecked />
            </div>
          )}

          {active === 'notifications' && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-3">Notificações</h2>
              <ToggleField label="Notificar admin sobre novo tenant" defaultChecked />
              <ToggleField label="Notificar sobre falhas de pagamento" defaultChecked />
              <ToggleField label="Notificar sobre uso elevado de recursos" />
              <ToggleField label="Relatório semanal por e-mail" defaultChecked />
              <Field label="E-mail remetente">
                <div className="flex items-center gap-2">
                  <Mail className="size-3.5 text-slate-500" />
                  <input type="email" defaultValue="noreply@erpuniversal.com" className="form-input flex-1" />
                </div>
              </Field>
            </div>
          )}

          {active === 'security' && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-3">Segurança</h2>
              <ToggleField label="Exigir 2FA para admins" defaultChecked />
              <ToggleField label="Bloquear após 5 tentativas falhas" defaultChecked />
              <ToggleField label="Listar IPs permitidos" />
              <ToggleField label="Logs de auditoria detalhados" defaultChecked />
              <Field label="Política de senhas">
                <select className="form-input">
                  <option>Alta (12+ caracteres, símbolos)</option>
                  <option>Média (8+ caracteres)</option>
                  <option>Baixa (6+ caracteres)</option>
                </select>
              </Field>
            </div>
          )}

          {active === 'api' && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-3">API & Webhooks</h2>
              <ToggleField label="API pública habilitada" defaultChecked />
              <ToggleField label="Versionamento via header" defaultChecked />
              <Field label="Rate limit (req/min)">
                <input type="number" defaultValue={1000} className="form-input" />
              </Field>
              <Field label="Webhook timeout (segundos)">
                <input type="number" defaultValue={30} className="form-input" />
              </Field>
              <ToggleField label="Assinar webhooks com HMAC-SHA256" defaultChecked />
            </div>
          )}

          {active === 'data' && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-3">Dados & LGPD</h2>
              <ToggleField label="Permitir exportação de dados (LGPD)" defaultChecked />
              <ToggleField label="Permitir exclusão de conta" defaultChecked />
              <Field label="Retenção de logs (dias)">
                <input type="number" defaultValue={365} className="form-input" />
              </Field>
              <Field label="Retenção de backups (dias)">
                <input type="number" defaultValue={90} className="form-input" />
              </Field>
              <ToggleField label="Anonimizar dados ao deletar tenant" defaultChecked />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-300 mb-1.5 block">{label}</label>
      {children}
    </div>
  )
}

function ToggleField({ label, defaultChecked }: { label: string; defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(!!defaultChecked)
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-xs text-slate-300">{label}</span>
      <button
        type="button"
        onClick={() => setChecked((v) => !v)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-blue-500' : 'bg-slate-700'
        }`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  )
}
