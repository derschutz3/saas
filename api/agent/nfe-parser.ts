/**
 * Parser de XML de NFe (Nota Fiscal Eletrônica) e NFCe.
 *
 * Extrai metadados da nota e a lista de produtos do <det><prod>.
 * Implementação baseada em regex (mais leve e tolerante a atributos
 * que um parser XML completo) — assume o schema padrão SEFAZ 4.00.
 *
 * Saída:
 *   {
 *     nfeNumber, series, emissionDate, issuerName, issuerCnpj,
 *     totalCents, products: [{ sku, name, unit, quantity, unitPriceCents, totalCents }]
 *   }
 */

export type ParsedNfeItem = {
  /** SKU do produto (cProd) — pode ser o EAN/code interno do fornecedor. */
  sku: string | null
  /** Nome do produto (xProd). */
  name: string
  /** Unidade de medida comercial (uCom) — ex: UN, KG, LT. */
  unit: string
  /** Quantidade (qCom) — fracionária, ex: 10.000 = 10 unidades. */
  quantity: number
  /** Preço unitário em centavos (vUnCom × 100). */
  unitPriceCents: number
  /** Valor total do item em centavos (vProd × 100). */
  totalCents: number
}

export type ParsedNfe = {
  /** Número da NF (nNF). */
  nfeNumber: string | null
  /** Série. */
  series: string | null
  /** Data de emissão ISO 8601 (dhEmi ou dEmi). */
  emissionDate: string | null
  /** Razão social do emitente. */
  issuerName: string | null
  /** CNPJ do emitente. */
  issuerCnpj: string | null
  /** Valor total da NF em centavos. */
  totalCents: number
  /** Lista de produtos extraídos. */
  products: ParsedNfeItem[]
}

const NUM_RE = /[0-9]+(?:[.,][0-9]+)?/g

function parseNumberBR(raw: string | null | undefined): number {
  if (!raw) return 0
  // Em NFe/NFCe (schema 4.00), o separador decimal é PONTO, não vírgula.
  // "24.0000" = 24,00 (decimal) — NÃO é milhar. "1.234,56" não aparece.
  const cleaned = raw.trim().replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

function toCents(value: number): number {
  return Math.round(value * 100)
}

function pickTag(xml: string, tag: string, opts: { attr?: string; all?: boolean } = {}): string[] {
  // Match <tag ...>(conteúdo)</tag> (não-vazio; self-closing é ignorado)
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'g')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    if (opts.attr) {
      const attrRe = new RegExp(`\\b${opts.attr.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}="([^"]+)"`)
      const attrMatch = attrRe.exec(m[1] ?? '')
      if (!attrMatch) continue
    }
    out.push((m[2] ?? '').trim())
  }
  // IMPORTANTE: retornar TODOS os matches; callers que quiserem só o 1º pegam [0]
  return out
}

function firstTag(xml: string, tag: string): string | null {
  const m = pickTag(xml, tag)
  return m.length > 0 ? m[0] : null
}

/**
 * Remove declarações/processing instructions que poluem o regex matching.
 */
function sanitize(xml: string): string {
  return xml
    .replace(/<\?xml[^?]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<xmlns:[^>]+>/g, '')
}

export function parseNfeXml(rawXml: string): ParsedNfe {
  if (!rawXml || typeof rawXml !== 'string') {
    throw new Error('XML vazio ou inválido')
  }
  if (rawXml.length > 5_000_000) {
    throw new Error('XML muito grande (>5MB). Considere enviar apenas a seção <NFe>.')
  }
  const xml = sanitize(rawXml)

  // Detectar pelo menos o root NFe (nfeProc, NFe, etc.)
  if (!/<NFe\b/.test(xml)) {
    throw new Error('XML não parece ser uma NFe/NFCe (tag <NFe> ausente)')
  }

  // Metadados
  const nfeNumber = firstTag(xml, 'nNF')?.trim() ?? null
  const series = firstTag(xml, 'serie')?.trim() ?? null
  const emissionDate = firstTag(xml, 'dhEmi')?.trim() ?? firstTag(xml, 'dEmi')?.trim() ?? null
  const issuerName = firstTag(xml, 'xNome')?.trim() ?? null
  const issuerCnpj = firstTag(xml, 'CNPJ')?.trim() ?? null
  const totalRaw = firstTag(xml, 'vProd') // pode pegar o do item, então pegar o do total
  // vProd aparece em <total><ICMSTot><vProd> e em cada <prod><vProd>; pegar o último (do total).
  const allVProd = pickTag(xml, 'vProd')
  const totalCents = allVProd.length > 0 ? toCents(parseNumberBR(allVProd[allVProd.length - 1])) : 0

  // Itens: <det nItem="N"><prod>...</prod></det>
  const products: ParsedNfeItem[] = []
  const detRe = /<det\b[^>]*>([\s\S]*?)<\/det>/g
  let detMatch: RegExpExecArray | null
  while ((detMatch = detRe.exec(xml)) !== null) {
    const detContent = detMatch[1] ?? ''
    const prodMatch = /<prod\b[^>]*>([\s\S]*?)<\/prod>/.exec(detContent)
    if (!prodMatch) continue
    const prod = prodMatch[1] ?? ''

    const cProd = firstTag(prod, 'cProd')?.trim() || firstTag(prod, 'cEAN')?.trim() || null
    const xProd = firstTag(prod, 'xProd')?.trim() ?? null
    const uCom = firstTag(prod, 'uCom')?.trim() ?? 'UN'
    const qCom = parseNumberBR(firstTag(prod, 'qCom'))
    const vUnCom = parseNumberBR(firstTag(prod, 'vUnCom'))
    const vProd = parseNumberBR(firstTag(prod, 'vProd'))

    if (!xProd) continue // item sem nome — descartar

    products.push({
      sku: cProd,
      name: xProd,
      unit: uCom || 'UN',
      quantity: qCom,
      unitPriceCents: toCents(vUnCom),
      totalCents: toCents(vProd || vUnCom * qCom),
    })
  }

  if (products.length === 0) {
    throw new Error('Nenhum produto encontrado no XML (verifique a estrutura <det><prod>)')
  }

  return {
    nfeNumber,
    series,
    emissionDate,
    issuerName,
    issuerCnpj,
    totalCents,
    products,
  }
}

/**
 * Parser de arquivo de texto DANFE (PDF extraído por OCR ou texto puro).
 * Muito mais permissivo — usa heurística de linhas que pareçam
 * "CODIGO DESCRICAO QTD UN VLR_UNIT VLR_TOTAL".
 *
 * Retorna null se não conseguir encontrar nenhuma linha de produto.
 */
export function parseDanfeText(rawText: string): ParsedNfe | null {
  if (!rawText || rawText.length < 50) return null
  const lines = rawText.split(/\r?\n/)
  const products: ParsedNfeItem[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length < 8) continue

    // Pular cabeçalhos
    if (/DANFE|NOTA FISCAL|VALOR TOTAL|CNPJ|INSCRIÇÃO|DOCUMENTO AUXILIAR/i.test(trimmed)) continue

    // Tentar 2 formatos:
    //   A) CODIGO(6-14d) NOME QTD UN VLR_UNIT VLR_TOTAL
    //   B) NOME QTD UN VLR_UNIT VLR_TOTAL  (sem código)
    let sku = ''
    let rest = trimmed
    const withCode = /^([0-9]{6,14})\s+(.+)/.exec(trimmed)
    if (withCode) {
      sku = withCode[1] ?? ''
      rest = withCode[2] ?? ''
    }

    // QTD UN VLR_UNIT VLR_TOTAL no final (QTD inteiro ou decimal, UN 2-3 letras, VLRs decimais)
    const tail = /\s+([0-9]+(?:[.,][0-9]+)?)\s+([A-Z]{2,3})\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)\s*$/.exec(rest)
    if (!tail) continue

    const name = rest.slice(0, tail.index).trim()
    const qty = parseNumberBR(tail[1] ?? '0')
    const unit = tail[2] ?? 'UN'
    const unitPrice = parseNumberBR(tail[3] ?? '0')
    const total = parseNumberBR(tail[4] ?? '0')

    if (!name || qty <= 0) continue
    products.push({
      sku: sku || null,
      name,
      unit,
      quantity: qty,
      unitPriceCents: toCents(unitPrice),
      totalCents: toCents(total || unitPrice * qty),
    })
  }

  if (products.length === 0) return null
  const totalCents = products.reduce((acc, p) => acc + p.totalCents, 0)

  // Tentar extrair número da NF e emitente do texto
  const nfeNumber = (rawText.match(/N[ºo°]?\.?\s*(\d{1,9})/i) ?? [])[1] ?? null
  const issuerName = (rawText.match(/Emitente[:\s]+([A-ZÀ-Ú][^\n]{5,60})/i) ?? [])[1]?.trim() ?? null
  const issuerCnpj = (rawText.match(/CNPJ[:\s]+([0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2})/i) ?? [])[1] ?? null

  return {
    nfeNumber,
    series: null,
    emissionDate: null,
    issuerName,
    issuerCnpj,
    totalCents,
    products,
  }
}
