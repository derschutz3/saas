import { cn } from '@/lib/utils'

export default function StatCard(props: {
  label: string
  value: string
  hint?: string
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
}) {
  const tone =
    props.tone === 'good'
      ? 'border-app-success/30 bg-app-success/10'
      : props.tone === 'warn'
        ? 'border-app-accent/30 bg-app-accent/10'
        : props.tone === 'bad'
          ? 'border-rose-400/20 bg-rose-400/5'
          : 'border-app-border bg-app-s1'

  return (
    <div className={cn('rounded-2xl border p-4 shadow-panel', tone)}>
      <div className="text-xs text-app-muted">{props.label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-app-text">{props.value}</div>
      {props.hint ? <div className="mt-1 text-xs text-app-muted/80">{props.hint}</div> : null}
    </div>
  )
}
