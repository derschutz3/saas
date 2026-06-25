'use client'

import { memo, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Boxes, Lock, Mail, ArrowRight,
  AlertCircle, Loader2, Eye, EyeOff,
  Sparkles, ShieldCheck,
} from 'lucide-react'

import { useAuth } from '@/contexts/auth-context'
import { ThemeSwitch } from '@/components/theme/theme-switch'

// Credenciais demo (apenas visíveis em dev)
const DEMO_CREDENTIALS = {
  admin: { email: 'admin@demo.com', password: 'admin123', role: 'admin' as const, label: 'Master Admin', sub: 'Painel de controladoria' },
  client: { email: 'cliente@demo.com', password: 'cliente123', role: 'client' as const, label: 'Tenant Cliente', sub: 'Operação de loja' },
}

const TODAY = new Date().toLocaleDateString('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

const QuickLogin = memo(function QuickLogin({
  email,
  password,
  role,
  label,
  sub,
  onSelect,
}: {
  email: string
  password: string
  role: 'admin' | 'client'
  label: string
  sub: string
  onSelect: (email: string, password: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(email, password)}
      className="group flex w-full items-center justify-between gap-4 border border-line bg-bg-2 px-4 py-3 text-left transition-all duration-200 hover:border-accent hover:bg-bg-3"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="font-mono text-[11px] font-medium text-paper-3">
          {role === 'admin' ? '01' : '02'}
        </span>
        <div className="min-w-0">
          <div className="font-sans text-[13px] font-semibold tracking-wide text-paper">
            {label}
          </div>
          <div className="font-mono text-[11px] text-paper-3 truncate">{email}</div>
        </div>
      </div>
      <span className="font-sans text-[10px] font-bold tracking-[0.2em] uppercase text-paper-3 group-hover:text-accent transition-colors">
        Preencher →
      </span>
    </button>
  )
})

export default function LoginPage() {
  const router = useRouter()
  const { login, isAuthenticated, isAdmin, isLoading: authLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace(isAdmin ? '/admin' : '/app/dashboard')
    }
  }, [authLoading, isAuthenticated, isAdmin, router])

  const handleSelectDemo = useCallback((demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail)
    setPassword(demoPassword)
    setError(null)
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)

    const result = await login({ email, password })

    if (!result.ok) {
      setError(result.error || 'Erro ao entrar')
      setLoading(false)
      return
    }

    const user = result.session?.user
    if (user?.role === 'admin') {
      router.push('/admin')
    } else {
      router.push('/app/dashboard')
    }
  }, [loading, login, email, password, router])

  return (
    <div className="app-shell min-h-dvh flex flex-col">
      {/* === MASTHEAD BAR === */}
      <div className="border-b border-line">
        <div className="shell flex items-center justify-between py-2.5 text-[10px] font-mono tracking-[0.22em] uppercase text-paper-3">
          <span>Capítulo de Abertura · {TODAY}</span>
          <div className="flex items-center gap-3">
            <ThemeSwitch variant="compact" />
            <Link href="/" className="hover:text-paper transition-colors">← Voltar ao site</Link>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
        {/* === COLUNA ESQUERDA — Brand dark luxe === */}
        <aside className="surface-ink relative overflow-hidden flex flex-col justify-between p-10 lg:p-14 min-h-[480px] anim-fade-in">
          {/* Marca d'água */}
          <span
            aria-hidden
            className="absolute -bottom-32 -right-8 font-display text-[420px] leading-none text-paper/[0.025] select-none pointer-events-none"
          >
            U
          </span>

          {/* Topo */}
          <header className="flex items-center justify-between relative z-10">
            <Link href="/" className="flex items-center gap-3 group">
              <span className="flex size-10 items-center justify-center bg-paper text-bg">
                <Boxes className="size-5" strokeWidth={1.5} />
              </span>
              <span className="font-display text-lg tracking-tight text-paper">
                ERP <span className="italic-accent text-accent">Universal</span>
              </span>
            </Link>
            <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-3">
              Ed. 2026 · nº 04
            </span>
          </header>

          {/* Centro */}
          <div className="max-w-xl relative z-10 anim-fade-up" style={{ animationDelay: '120ms' }}>
            <span className="pill pill-accent">
              <Sparkles className="size-3" /> A operação começa aqui
            </span>

            <h1 className="mt-8 serif-h1 text-[64px] lg:text-[88px] text-paper">
              Bem-vindo<br />
              <span className="italic-accent text-gradient-accent">de volta.</span>
            </h1>

            <p className="mt-6 max-w-md font-sans text-[15px] leading-relaxed text-paper-2">
              Sua operação inteira em uma tela. Acesse o painel, abra o caixa, gerencie pedidos —
              tudo em um único sistema nervoso.
            </p>

            <div className="mt-10 grid grid-cols-3 gap-6 max-w-md">
              {[
                { n: '99,99%', l: 'Uptime' },
                { n: '< 12ms', l: 'Sync' },
                { n: '12k+', l: 'Operadores' },
              ].map((s) => (
                <div key={s.l} className="border-t border-line pt-3">
                  <div className="font-display text-2xl text-paper">{s.n}</div>
                  <div className="mt-1 font-mono text-[10px] tracking-[0.22em] uppercase text-paper-3">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Rodapé */}
          <footer className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-3 flex items-center justify-between relative z-10">
            <span>Vol. IV · Operação de Alta Performance</span>
            <span className="flex items-center gap-2">
              <span className="size-1.5 bg-emerald rounded-full anim-pulse" />
              Sistema operacional
            </span>
          </footer>
        </aside>

        {/* === COLUNA DIREITA — Formulário dark === */}
        <main className="flex items-center justify-center p-8 lg:p-14 bg-bg anim-fade-in" style={{ animationDelay: '180ms' }}>
          <div className="w-full max-w-md">
            <div className="mb-10 flex items-baseline justify-between">
              <span className="label">Edição nº 04 · Aceso</span>
              <Link href="/" className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-3 hover:text-paper transition-colors">
                ← Sair
              </Link>
            </div>

            <h2 className="serif-h2 text-[40px] lg:text-[52px] text-paper">
              Entre na sua <span className="italic-accent text-gradient-accent">operação.</span>
            </h2>
            <p className="mt-3 font-sans text-[14px] leading-relaxed text-paper-3 max-w-sm">
              Suas credenciais liberam o painel e os módulos contratados.
            </p>

            <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label htmlFor="email" className="label-ink">E-mail operacional</label>
                <div className="flex items-center gap-3 border border-line bg-bg-2 px-4 h-12 transition-all duration-200 focus-within:border-accent focus-within:shadow-[0_0_0_3px_hsl(225_100%_68%/0.18)]">
                  <Mail className="size-4 shrink-0 text-paper-3" strokeWidth={1.5} />
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 bg-transparent text-[14px] font-sans text-paper outline-none placeholder:text-paper-3/70"
                    placeholder="operador@empresa.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="password" className="label-ink">Senha</label>
                  <button
                    type="button"
                    className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-3 hover:text-accent transition-colors"
                  >
                    Esqueci
                  </button>
                </div>
                <div className="flex items-center gap-3 border border-line bg-bg-2 px-4 h-12 transition-all duration-200 focus-within:border-accent focus-within:shadow-[0_0_0_3px_hsl(225_100%_68%/0.18)]">
                  <Lock className="size-4 shrink-0 text-paper-3" strokeWidth={1.5} />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex-1 bg-transparent text-[14px] font-sans text-paper outline-none placeholder:text-paper-3/70"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="shrink-0 text-paper-3 hover:text-paper transition-colors"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="size-4" strokeWidth={1.5} /> : <Eye className="size-4" strokeWidth={1.5} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-3 border border-crimson/40 bg-crimson/10 p-3 text-[13px] text-crimson">
                  <AlertCircle className="size-4 shrink-0" strokeWidth={1.5} />
                  <span className="font-sans">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-4 mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="size-5 animate-spin" strokeWidth={1.5} />
                ) : (
                  <>
                    Autenticar
                    <ArrowRight className="size-4" strokeWidth={1.8} />
                  </>
                )}
              </button>

              <div className="flex items-center gap-4 text-[10px] font-mono tracking-[0.22em] uppercase text-paper-3">
                <span className="flex-1 h-px bg-line" />
                <span>ou use uma conta demo</span>
                <span className="flex-1 h-px bg-line" />
              </div>

              {process.env.NODE_ENV === 'development' && (
                <div className="flex flex-col gap-2">
                  <QuickLogin {...DEMO_CREDENTIALS.admin} onSelect={handleSelectDemo} />
                  <QuickLogin {...DEMO_CREDENTIALS.client} onSelect={handleSelectDemo} />
                </div>
              )}

              <div className="mt-2 flex items-center justify-center gap-2 font-mono text-[10px] tracking-[0.22em] uppercase text-paper-3">
                <ShieldCheck className="size-3" />
                Conexão criptografada · TLS 1.3
              </div>
            </form>

            <p className="mt-10 font-mono text-[10px] tracking-[0.22em] uppercase text-paper-3 text-center">
              ERP Universal · {new Date().getFullYear()} · todos os direitos reservados
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}