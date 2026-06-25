/**
 * Proxy do Next.js para a API de integrações.
 *
 * Encaminha todas as requisições /api/integrations/* para ${apiBase}/integrations/*
 * preservando método, headers, body, e query string.
 */
import { NextRequest, NextResponse } from 'next/server'

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3103'

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  const search = req.nextUrl.search
  const target = `${apiBase}/integrations/${path.join('/')}${search}`

  const headers = new Headers()
  for (const [k, v] of req.headers.entries()) {
    if (['host', 'connection', 'content-length'].includes(k.toLowerCase())) continue
    headers.set(k, v)
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text(),
    redirect: 'manual',
  }

  const upstream = await fetch(target, init)
  const out = new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
  })
  upstream.headers.forEach((v, k) => {
    if (['content-encoding', 'transfer-encoding', 'connection'].includes(k.toLowerCase())) return
    out.headers.set(k, v)
  })
  return out
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
export const OPTIONS = proxy
export const HEAD = proxy
