import { login } from '@/lib/apiClient'
import { cn } from '@/lib/utils'
import { useSessionStore } from '@/stores/sessionStore'
import { Boxes, Lock, Mail } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

export default function Login() {
  const token = useSessionStore((s) => s.token)
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@demo.com')
  const [password, setPassword] = useState('admin123')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = useMemo(() => email.trim().length > 3 && password.length > 0, [email, password])

  if (token) return <Navigate to="/app/dashboard" replace />

  return (
    <div className="ui-shell">
      <div className="mx-auto flex min-h-dvh max-w-[1200px] items-center px-6 py-10">
        <div className="grid w-full grid-cols-1 gap-8 md:grid-cols-2">
          <div className="flex flex-col justify-center">
            <div className="inline-flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-2xl border border-app-border bg-app-s1 text-app-text shadow-panel">
                <Boxes className="size-6" />
              </div>
              <div>
                <div className="text-sm text-app-muted">Distribuidoras e depósitos</div>
                <div className="text-2xl font-semibold tracking-tight text-app-text">ERP Bebidas</div>
              </div>
            </div>

            <div className="mt-6 text-sm leading-relaxed text-app-muted">
              Operação demo local com pedidos, estoque, caixa e monitor fiscal.
            </div>

            <div className="mt-6 ui-panel p-4 text-xs text-app-muted">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-1.5 rounded-full bg-app-accent" />
                Credenciais de demonstração
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-app-border bg-app-s2 px-3 py-2">
                  <div className="text-app-muted/70">E-mail</div>
                  <div className="truncate font-medium text-app-text">admin@demo.com</div>
                </div>
                <div className="rounded-xl border border-app-border bg-app-s2 px-3 py-2">
                  <div className="text-app-muted/70">Senha</div>
                  <div className="truncate font-medium text-app-text">admin123</div>
                </div>
              </div>
            </div>
          </div>

          <div className="ui-panel rounded-3xl p-6">
            <div className="text-sm font-semibold text-app-text">Acessar</div>
            <div className="mt-1 text-xs text-app-muted">Entre para iniciar a operação</div>

            <form
              className="mt-6 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!canSubmit || loading) return
                setError(null)
                setLoading(true)
                try {
                  await login({ email: email.trim(), password: password.trim() })
                  navigate('/app/dashboard')
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Falha ao entrar')
                } finally {
                  setLoading(false)
                }
              }}
            >
              <label className="block">
                <div className="mb-2 text-xs text-app-muted">E-mail</div>
                <div className="flex items-center gap-2 rounded-xl border border-app-border bg-app-s2 px-3 py-2 focus-within:ring-2 focus-within:ring-app-primary/25">
                  <Mail className="size-4 text-app-muted" />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-transparent text-sm text-app-text outline-none placeholder:text-app-muted/60"
                    placeholder="seu@email.com"
                    autoComplete="email"
                  />
                </div>
              </label>

              <label className="block">
                <div className="mb-2 text-xs text-app-muted">Senha</div>
                <div className="flex items-center gap-2 rounded-xl border border-app-border bg-app-s2 px-3 py-2 focus-within:ring-2 focus-within:ring-app-primary/25">
                  <Lock className="size-4 text-app-muted" />
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent text-sm text-app-text outline-none placeholder:text-app-muted/60"
                    placeholder="••••••••"
                    type="password"
                    autoComplete="current-password"
                  />
                </div>
              </label>

              {error ? (
                <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!canSubmit || loading}
                className={cn(
                  'ui-btn ui-btn-primary w-full',
                  !canSubmit || loading ? 'opacity-50' : '',
                )}
              >
                {loading ? 'Entrando…' : 'Entrar'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
