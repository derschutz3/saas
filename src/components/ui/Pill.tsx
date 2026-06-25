import { memo } from 'react'
import { cn } from '@/lib/utils'

function Pill(props: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const cls =
    props.tone === 'good'
      ? 'border-app-success/35 bg-app-success/10 text-app-text'
      : props.tone === 'warn'
        ? 'border-app-accent/35 bg-app-accent/10 text-app-text'
        : props.tone === 'bad'
          ? 'border-rose-400/30 bg-rose-400/10 text-rose-100'
          : 'border-app-border bg-app-s2 text-app-muted'

  return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs', cls)}>{props.label}</span>
}

export default memo(Pill)
