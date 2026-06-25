import { useSessionStore } from '@/stores/sessionStore'
import { Navigate, Outlet } from 'react-router-dom'

export default function RequireSession() {
  const token = useSessionStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <Outlet />
}

