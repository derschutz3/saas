import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'

interface PagePlaceholderProps {
  title: string
  description: string
  icon: LucideIcon
  features?: string[]
  badge?: string
}

export function PagePlaceholder({ title, description, icon: Icon, features, badge }: PagePlaceholderProps) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          {badge && (
            <span className="pill pill-cyan text-[10px]">{badge}</span>
          )}
        </div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        <p className="text-sm text-white/50 mt-1">{description}</p>
      </div>

      <div className="card p-8 flex flex-col items-center justify-center text-center flex-1 min-h-[400px]">
        <div className="size-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-6">
          <Icon className="size-8 text-accent" />
        </div>
        
        <h2 className="text-lg font-medium text-white mb-2">Módulo em Desenvolvimento</h2>
        <p className="text-sm text-white/40 max-w-md mb-6">
          Este módulo está sendo construído para oferecer a melhor experiência em gestão {title.toLowerCase()}.
        </p>

        {features && features.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-xl">
            {features.map((feature, i) => (
              <div key={i} className="flex items-center gap-2 text-left p-3 rounded-lg bg-white/[0.03]">
                <ArrowRight className="size-3.5 text-accent shrink-0" />
                <span className="text-xs text-white/60">{feature}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 flex items-center gap-2 text-xs text-white/30">
          <div className="size-2 rounded-full bg-yellow-500 animate-pulse" />
          <span>Disponível em breve</span>
        </div>
      </div>
    </div>
  )
}
