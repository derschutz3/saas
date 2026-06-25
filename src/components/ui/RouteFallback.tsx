export default function RouteFallback() {
  return (
    <div className="grid min-h-dvh place-items-center bg-app-bg" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-sm text-app-muted">
        <span className="size-4 animate-spin rounded-full border-2 border-app-border border-t-app-primary" />
        Carregando…
      </div>
    </div>
  )
}
