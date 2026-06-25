'use client'

/**
 * Landing page — modelo editorial "engineering blueprint"
 * Inspirada em Meridian by shadcnblocks.
 *
 * Estrutura:
 *  1. Masthead bar (data, volume, edição)
 *  2. Header minimal
 *  3. Hero com tipografia serif gigante + dashboard mockup
 *  4. Spec sheet (MRD-2026-Q1, Rev A, 1/3)
 *  5. 3 stats enormes (12 módulos, R$ 2,1bi, 99,99%)
 *  6. Spec de 6 zonas (A-F)
 *  7. Comparação Us vs Them em 7 categorias
 *  8. Timeline numerada (01-04) + mockup de tela
 *  9. Tabela tabular de features
 * 10. Testimonials B&W 35mm (3 quotes)
 * 11. Trusted by
 * 12. Pricing em formato receipt (3 tickets)
 * 13. CTA final + footer
 */
import Link from 'next/link'
import { motion, useScroll, useTransform, type Variants } from 'framer-motion'
import { useRef } from 'react'
import {
  ArrowRight, ArrowUpRight, Boxes, Receipt, FileText,
  ShoppingCart, Calculator, Globe, ShieldCheck, Activity, Star,
  Check, X, Minus,
} from 'lucide-react'
import { ThemeSwitch } from '@/components/theme/theme-switch'

// === Editorial constants — like magazine masthead ===
const MASTHEAD = {
  volume: 'Vol. IV',
  issue: 'Edição 2026.04',
  date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
  edition: 'Brasília · São Paulo · Recife',
}

const HERO = {
  kicker: 'A operação que sua empresa merece',
  title: ['Um console', 'para o seu', 'caixa, estoque', 'e fiscal.'],
  body: 'ERP Universal substitui dashboards ruidosos por um único console que só te chama quando importa. PDV, fiscal, estoque, marketplace, clientes e relatórios — sem ruído, sem promessas vazias.',
}

const STATS_3UP = [
  { num: '12', unit: 'módulos', tag: 'A — F spec zones' },
  { num: 'R$ 2,1bi', unit: 'GMV processado', tag: '2025-2026' },
  { num: '99,99%', unit: 'uptime SLA', tag: 'medido · últimos 12 meses' },
]

const ZONES = [
  { letter: 'A', tag: 'Surface', title: 'Um console para o operador.', body: 'Keyboard-first. ⌘K para qualquer coisa. Sua equipe aprende em 4 minutos.' },
  { letter: 'B', tag: 'Topologia', title: 'Cada módulo mapeado ao seu papel.', body: 'Estoque, fiscal, PDV, marketplace — visíveis e relacionados desde o primeiro login.' },
  { letter: 'C', tag: 'Sinal fiscal', title: 'Alertas por SLO, não por volume.', body: 'Você só é avisado quando o orçamento fiscal do mês está em risco, não a cada nota emitida.' },
  { letter: 'D', tag: 'Auto-draft', title: 'Conferência de compras escrita sozinha.', body: 'Timeline, itens suspeitos, últimas 3 entradas — anexadas a cada pedido automaticamente.' },
  { letter: 'E', tag: 'Velocidade', title: 'p95 de queries abaixo de 120 ms.', body: 'Leituras rápidas de qualquer região do Brasil. Servidores em SP, BSB, REC.' },
  { letter: 'F', tag: 'Ruído', title: '97% menos notificações desde Q1 2026.', body: 'Medido em 41 operações ativas. Nenhuma pediu para voltar ao sistema anterior.' },
]

const COMPARISON = [
  { cat: '01', us: 'Preço fixo, tudo incluído.', them: 'Por usuário, por módulo, por integração.', icon: Check },
  { cat: '02', us: 'PDV, estoque, fiscal, clientes — em um.', them: 'Três produtos, três boletos, três renovações.', icon: Check },
  { cat: '03', us: 'NF-e nativa, 3ms na SEFAZ.', them: 'Intermediários opacos, 200ms+.', icon: Check },
  { cat: '04', us: 'Incidente com runbook.', them: 'Canal aberto se você lembrar.', icon: Check },
  { cat: '05', us: '90 dias de retenção, sempre.', them: '7 dias, depois arquivo frio.', icon: Check },
  { cat: '06', us: 'Parquet, NDJSON, S3 assinado.', them: 'Ticket de suporte e uma oração.', icon: Check },
  { cat: '07', us: 'Onboarding em 90 segundos, primeiro pedido em 10.', them: 'Plano de duas semanas com consultoria.', icon: Check },
]

const TIMELINE = [
  { n: '01', tag: 'Receber', title: 'Compras sincronizam.', body: 'Quando o pedido de compra entra em "Recebido", o estoque dispara, o custo médio recalcula, o financeiro compõe o fluxo de caixa.' },
  { n: '02', tag: 'Detectar', title: 'Fiscal preparado.', body: 'Cada item com NCM e CFOP correto, contingência automática, cancelamento com rastro de auditoria.' },
  { n: '03', tag: 'Vender', title: 'PDV fala com tudo.', body: 'Salão, balcão, delivery e marketplace — o mesmo produto, o mesmo estoque, o mesmo caixa.' },
  { n: '04', tag: 'Fechar', title: 'Fechamento cego.', body: 'Sessão conferida sem intervenção do operador, fluxo de caixa escrito, divergências destacadas para o gestor.' },
]

const TICKERS = [
  { time: '08:14:02', depth: 'L1', kind: 'compra', mag: '4.2', where: 'checkout-pdv', note: 'recebida · 12 itens' },
  { time: '08:14:18', depth: 'L2', kind: 'estoque', mag: '3.1', where: 'filial-centro', note: 'transferência · 8 SKUs' },
  { time: '08:15:09', depth: 'L1', kind: 'fiscal', mag: '2.4', where: 'nfe-emit', note: 'NF-e 4521 · ok' },
  { time: '08:15:55', depth: 'L3', kind: 'caixa', mag: '5.6', where: 'sessão-pdv-03', note: 'paged · gerente' },
  { time: '08:16:18', depth: 'L2', kind: 'compras', mag: '2.8', where: 'pedido-7841', note: 'cotação salva' },
  { time: '08:16:47', depth: 'L1', kind: 'clientes', mag: '1.9', where: 'crm-sync', note: '273 contatos' },
  { time: '08:17:20', depth: 'L2', kind: 'caixa', mag: '3.4', where: 'fechamento', note: 'conferido · ok' },
  { time: '08:17:51', depth: 'L1', kind: 'fiscal', mag: '2.1', where: 'nfe-cancel', note: 'cancelada · rastro' },
]

const TESTIMONIALS = [
  {
    num: '01', label: 'B&W · 35mm',
    quote: 'Trocamos três sistemas por um. A diferença foi o tempo que minha equipe parou de desperdiçar tentando descobrir o que tinha acontecido no caixa.',
    name: 'Helena Vasconcellos',
    role: 'Diretora de Operações',
    company: 'Empório Norte',
    filed: 'Brasília · 2026.03',
  },
  {
    num: '02', label: 'B&W · 35mm',
    quote: 'Parei de temer o fechamento do mês. O ERP decide o que vale a pena me acordar, e está certo em quase todo caso.',
    name: 'Marcos Okafor',
    role: 'Platform Lead',
    company: 'Restaurante Vela',
    filed: 'São Paulo · 2026.02',
  },
  {
    num: '03', label: 'B&W · 35mm',
    quote: 'Volume de notificações caiu 90% no primeiro mês. Ninguém na minha equipe pediu pra voltar.',
    name: 'Ana Reyes',
    role: 'Infraestrutura',
    company: 'Hortifruti Verde',
    filed: 'Recife · 2026.04',
  },
]

const TRUSTED = [
  { name: 'Empório Norte', est: 'est 2023' },
  { name: 'Mercado Sul', est: 'est 2024' },
  { name: 'Restaurante Vela', est: 'est 2024' },
  { name: 'Padaria Madri', est: 'est 2023' },
  { name: 'Atacadão Litoral', est: 'est 2024' },
  { name: 'Cervejaria Aurora', est: 'est 2025' },
  { name: 'Hortifruti Verde', est: 'est 2024' },
  { name: 'Distribuidora Cerrado', est: 'est 2025' },
]

const PLANS = [
  {
    code: 'MRD-LK-2026',
    name: 'Lookout',
    cadence: 'Para a equipe que acabou de subir um caixa.',
    incl: ['5 assentos · 1 equipe', 'PDV, estoque, clientes', 'Fiscal básico', 'Suporte por e-mail', '99,95% global SLA'],
    subtotal: 'R$ 1.200,00',
    tax: 'R$ 0,00',
    total: 'R$ 1.200/ ano',
    cta: 'Iniciar Lookout',
  },
  {
    code: 'MRD-BR-2026',
    name: 'Bridge',
    badge: '★ Mais escolhido',
    cadence: 'O que 41 operações já rodam em produção.',
    incl: ['25 assentos incluídos', 'Tudo do Lookout', 'Conferência automática', 'Watch · ack & rollback', 'Linear · GitHub', '99,997% global SLA', 'Auditoria assinada'],
    subtotal: 'R$ 4.800,00',
    tax: 'R$ 0,00',
    overage: 'R$ 0,00',
    hidden: 'R$ 0,00',
    total: 'R$ 4.800/ ano',
    cta: 'Assinar Bridge',
  },
  {
    code: 'MRD-AT-2026',
    name: 'Atlas',
    cadence: 'Quando a operação cruza três fusos.',
    incl: ['Assentos ilimitados', 'Tudo do Bridge', 'Engenheiro de rotação dedicado', 'SOC 2 · DPA customizado', 'Retenção customizada', 'On-call prioritário'],
    subtotal: 'sob consulta',
    setup: 'R$ 0,00',
    total: 'Custom',
    cta: 'Falar com vendas',
  },
]

// === Motion presets ===
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.9, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] },
  }),
}

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
}

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroParallax = useTransform(scrollYProgress, [0, 1], ['0%', '18%'])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0])

  return (
    <div className="min-h-screen bg-bg text-paper overflow-x-hidden">
      {/* =================== MASTHEAD BAR =================== */}
      <div className="border-b border-line bg-bg-2">
        <div className="shell flex items-center justify-between py-2 text-[10px] font-mono tracking-widest uppercase text-paper-3">
          <div className="flex items-center gap-3">
            <span>§ {MASTHEAD.volume}</span>
            <span className="text-paper-3/40">·</span>
            <span>{MASTHEAD.edition}</span>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <span>{MASTHEAD.date}</span>
            <span className="text-paper-3/40">·</span>
            <span>Filed from us-east-1 · 03:14 UTC</span>
          </div>
          <div className="hidden lg:block">EDIÇÃO SEMANAL · PARA OPERADORES</div>
        </div>
      </div>

      {/* =================== HEADER =================== */}
      <header className="sticky top-0 z-40 bg-bg/85 backdrop-blur-[2px] border-b border-line">
        <div className="shell flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center border border-paper text-paper transition-transform duration-500 group-hover:rotate-12">
              <Boxes className="h-4 w-4" strokeWidth={1.4} />
            </div>
            <div className="leading-tight">
              <div className="font-display text-base font-semibold tracking-tight">ERP <span className="italic-accent">Universal</span><sup className="text-[9px] font-mono text-paper-3 ml-0.5">®</sup></div>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-9">
            <a href="#spec" className="nav-link">Spec</a>
            <a href="#zones" className="nav-link">Zonas</a>
            <a href="#timeline" className="nav-link">Operação</a>
            <a href="#compare" className="nav-link">Comparação</a>
            <a href="#planos" className="nav-link">Planos</a>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeSwitch variant="landing" />
            <Link href="/login" className="hidden sm:inline-flex nav-link">Entrar</Link>
            <Link href="/login" className="btn-primary">
              Testar 14 dias
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </header>

      {/* =================== HERO =================== */}
      <section ref={heroRef} className="relative border-b border-line">
        <motion.div style={{ y: heroParallax, opacity: heroOpacity }} className="absolute inset-x-0 top-0 pointer-events-none">
          <div className="shell pt-12">
            <div className="font-display text-[18vw] leading-[0.85] tracking-[-0.04em] text-line select-none whitespace-nowrap overflow-hidden">
              Operação
            </div>
          </div>
        </motion.div>

        <div className="shell relative pt-24 md:pt-32 pb-20 md:pb-28">
          <motion.div initial="hidden" animate="show" variants={stagger} className="max-w-5xl">
            <motion.div variants={fadeUp} custom={0} className="flex items-center gap-3 mb-10">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
                § MRD / 01 — Rev A · 2026.04
              </span>
              <span className="flex-1 h-px bg-line" />
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">Sheet 1/3</span>
            </motion.div>

            <motion.h1 variants={fadeUp} custom={1} className="serif-h1 text-[clamp(2.6rem,7vw,6rem)] leading-[0.95] text-paper">
              {HERO.title[0]} <span className="italic-accent text-accent">{HERO.title[1]}</span><br />
              {HERO.title[2]}<br />
              <span className="italic-accent text-accent">{HERO.title[3]}</span>
            </motion.h1>

            <motion.p variants={fadeUp} custom={2} className="mt-10 max-w-2xl text-lg md:text-xl text-paper-2 leading-relaxed">
              {HERO.body}
            </motion.p>

            <motion.div variants={fadeUp} custom={3} className="mt-10 flex flex-wrap items-center gap-4">
              <Link href="/login" className="btn-primary">
                Iniciar teste gratuito
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
              </Link>
              <a href="#dashboard" className="btn-ghost">
                Ver console
              </a>
              <div className="flex items-center gap-2 ml-2 text-sm text-paper-3">
                <div className="flex">
                  {[0,1,2,3,4].map((i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-gold text-gold" strokeWidth={0} />
                  ))}
                </div>
                <span className="font-mono text-xs">4.9 · 312 avaliações verificadas</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* =================== DASHBOARD MOCKUP =================== */}
      <section id="dashboard" className="border-b border-line bg-bg-2 py-16">
        <div className="shell">
          <div className="flex items-center gap-3 mb-6 font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
            <span>acme · dashboard</span>
            <span className="text-paper-3/40">·</span>
            <span>Plano Pro · 14 dias restantes</span>
            <span className="flex-1 h-px bg-line" />
            <span>Fig. 02 · The console, inspected</span>
          </div>

          <div className="card-ink rounded-sm overflow-hidden shadow-2xl">
            {/* mockup tabbar */}
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-line">
              <span className="h-2.5 w-2.5 rounded-full bg-crimson/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-gold/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald/70" />
              <div className="ml-4 font-mono text-[10px] text-paper-3 tracking-wider">
                acme.erp.app / dashboard
              </div>
            </div>

            {/* mockup body */}
            <div className="p-6 md:p-8 grid grid-cols-12 gap-6">
              {/* sidebar mockup */}
              <div className="col-span-3 hidden md:flex flex-col gap-1">
                {['Dashboard', 'Pedidos', 'Estoque', 'Compras', 'Clientes', 'PDV / Caixa', 'Fiscal', 'Marketplace', 'Relatórios', 'Configurações'].map((item, i) => (
                  <div
                    key={item}
                    className={`px-3 py-1.5 text-[12px] font-mono ${i === 0 ? 'bg-accent/12 text-accent border-l-2 border-accent' : 'text-paper-3'}`}
                  >
                    {item}
                  </div>
                ))}
              </div>

              {/* main mockup */}
              <div className="col-span-12 md:col-span-9 space-y-6">
                {/* KPI row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Receita 24h', value: 'R$ 18.420', tone: 'accent' },
                    { label: 'Pedidos', value: '126', tone: 'emerald' },
                    { label: 'Acurácia', value: '94%', tone: 'gold' },
                    { label: 'Ticket médio', value: 'R$ 146,20', tone: 'muted' },
                  ].map((k) => (
                    <div key={k.label} className="border border-line p-4">
                      <div className="text-[9px] font-mono tracking-widest uppercase text-paper-3">{k.label}</div>
                      <div className="serif-h2 text-2xl text-paper mt-2">{k.value}</div>
                      <div className="mt-3 h-1 bg-bg-3">
                        <div className={`h-full ${k.tone === 'accent' ? 'bg-accent' : k.tone === 'gold' ? 'bg-gold' : k.tone === 'emerald' ? 'bg-emerald' : 'bg-paper-3'}`} style={{ width: '70%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* chart row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2 border border-line p-4">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-paper-3">Receita · 30d</span>
                      <span className="text-[10px] font-mono text-emerald">+12,3% ↗</span>
                    </div>
                    <svg viewBox="0 0 400 100" className="w-full h-24">
                      <defs>
                        <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <polyline
                        points="0,70 30,55 60,62 90,40 120,45 150,30 180,38 210,22 240,28 270,15 300,20 330,8 360,12 400,5"
                        fill="none"
                        stroke="hsl(var(--accent))"
                        strokeWidth="2"
                      />
                      <polygon
                        points="0,70 30,55 60,62 90,40 120,45 150,30 180,38 210,22 240,28 270,15 300,20 330,8 360,12 400,5 400,100 0,100"
                        fill="url(#heroGrad)"
                      />
                    </svg>
                  </div>
                  <div className="border border-line p-4">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-paper-3 mb-4">Por canal</div>
                    {[
                      { l: 'Balcão', v: 42, c: 'accent' },
                      { l: 'iFood', v: 28, c: 'gold' },
                      { l: 'WhatsApp', v: 18, c: 'emerald' },
                      { l: 'Rappi', v: 8, c: 'crimson' },
                    ].map((c) => (
                      <div key={c.l} className="mb-2">
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className="text-paper-2">{c.l}</span>
                          <span className="text-paper-3">{c.v}%</span>
                        </div>
                        <div className="h-1.5 bg-bg-3 mt-1">
                          <div
                            className={`h-full ${c.c === 'accent' ? 'bg-accent' : c.c === 'gold' ? 'bg-gold' : c.c === 'emerald' ? 'bg-emerald' : 'bg-crimson'}`}
                            style={{ width: `${c.v}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* recent activity */}
                <div className="border border-line">
                  <div className="px-4 py-2.5 border-b border-line flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-paper-3">Vendas recentes · 5 hoje</span>
                    <span className="text-[10px] font-mono text-paper-3">Atualizado há 4s</span>
                  </div>
                  {[
                    { i: 'OM', n: 'Olivia Martin', v: 'R$ 1.999,00', t: 'há 2 min' },
                    { i: 'JL', n: 'Jackson Lee', v: 'R$ 39,00', t: 'há 8 min' },
                    { i: 'IN', n: 'Isabella Nguyen', v: 'R$ 299,00', t: 'há 14 min' },
                    { i: 'WK', n: 'William Kim', v: 'R$ 99,00', t: 'há 22 min' },
                  ].map((r) => (
                    <div key={r.n} className="px-4 py-3 flex items-center gap-3 border-b border-line/40 last:border-0">
                      <div className="size-8 flex items-center justify-center bg-accent/12 text-accent font-mono text-[10px] font-semibold ring-1 ring-line">{r.i}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-paper">{r.n}</div>
                        <div className="text-[10px] font-mono text-paper-3">{r.t}</div>
                      </div>
                      <div className="font-mono text-sm text-emerald">+{r.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================== SPEC =================== */}
      <section id="spec" className="border-b border-line">
        <div className="shell py-20 md:py-28">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-12"
          >
            <motion.div variants={fadeUp} className="md:col-span-3 space-y-2">
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">§ Bulletin № 01</div>
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">MRD-2026-Q1 · Sheet 1/1</div>
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">Filed from us-east-1 · 03:14 UTC</div>
            </motion.div>
            <motion.h2 variants={fadeUp} className="md:col-span-9 serif-h2 text-4xl md:text-6xl text-paper">
              ERP Universal, <span className="italic-accent text-accent">num relance.</span>
            </motion.h2>
          </motion.div>

          {/* 3-up big stats */}
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-3 border-t border-b border-line"
          >
            {STATS_3UP.map((s) => (
              <motion.div
                key={s.num}
                variants={fadeUp}
                className="border-r border-line last:border-r-0 px-2 py-10 md:py-16"
              >
                <div className="flex items-baseline gap-3">
                  <span className="serif-h1 text-7xl md:text-8xl text-paper">{s.num}</span>
                  <span className="font-mono text-[10px] tracking-widest uppercase text-paper-3">{s.unit}</span>
                </div>
                <div className="mt-3 font-mono text-[10px] tracking-widest uppercase text-accent">{s.tag}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* =================== ZONES A-F =================== */}
      <section id="zones" className="border-b border-line bg-bg-2">
        <div className="shell py-20 md:py-28">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="mb-12"
          >
            <motion.div variants={fadeUp} className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 mb-3">
              § Spec · 6 zonas, A a F
            </motion.div>
            <motion.h2 variants={fadeUp} className="serif-h2 text-4xl md:text-5xl text-paper max-w-3xl">
              Cada zona, uma promessa. <span className="italic-accent text-accent">Mantida por medição.</span>
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-50px' }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-line"
          >
            {ZONES.map((z) => (
              <motion.article
                key={z.letter}
                variants={fadeUp}
                className="group bg-bg p-8 md:p-10 hover:bg-bg-3 transition-colors duration-500 relative"
              >
                <div className="flex items-start justify-between mb-8">
                  <span className="serif-h1 text-5xl text-accent">{z.letter}</span>
                  <span className="font-mono text-[10px] tracking-widest uppercase text-paper-3 mt-3">{z.tag}</span>
                </div>
                <h3 className="serif-h2 text-xl mb-3 text-paper">{z.title}</h3>
                <p className="text-paper-2 leading-relaxed text-[14px]">{z.body}</p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      {/* =================== SILENCE / BULLETIN =================== */}
      <section className="border-b border-line">
        <div className="shell py-20 md:py-28">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-12 gap-10"
          >
            <motion.div variants={fadeUp} className="md:col-span-5">
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 mb-3">
                Headline · Filed 2026.04.25
              </div>
              <h2 className="serif-h2 text-4xl md:text-6xl text-paper">
                Silencie os alarmes, <span className="italic-accent text-accent">com confiança.</span>
              </h2>
            </motion.div>
            <motion.div variants={fadeUp} className="md:col-span-7 md:pt-4">
              <p className="text-paper-2 text-lg leading-relaxed mb-10">
                41 operações rodaram o ERP Universal por 90 dias. Saíram de 217 alertas por semana para 2. Nenhuma pediu pra voltar.
              </p>
              <div className="grid grid-cols-3 gap-px bg-line border border-line">
                {[
                  { n: '217', l: 'Alertas/semana · antes' },
                  { n: '2', l: 'Alertas/semana · com ERP' },
                  { n: '215', l: 'Alertas que você nunca vê' },
                ].map((s) => (
                  <div key={s.l} className="bg-bg-2 p-5">
                    <div className="serif-h1 text-5xl text-paper">{s.n}</div>
                    <div className="font-mono text-[10px] tracking-widest uppercase text-paper-3 mt-2">{s.l}</div>
                  </div>
                ))}
              </div>
              <p className="mt-8 font-display italic text-paper-3 text-lg">Isso não é uma falha. É o produto.</p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* =================== TIMELINE 01-04 =================== */}
      <section id="timeline" className="border-b border-line bg-bg-2">
        <div className="shell py-20 md:py-28">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="mb-12"
          >
            <motion.div variants={fadeUp} className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 mb-3">
              § Night shift · 03:17 UTC
            </motion.div>
            <motion.h2 variants={fadeUp} className="serif-h2 text-4xl md:text-5xl text-paper max-w-3xl">
              Seis minutos, uma página, <span className="italic-accent text-accent">nenhum laptop aberto.</span>
            </motion.h2>
          </motion.div>

          <motion.ol
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-50px' }}
            variants={stagger}
            className="border-t border-line"
          >
            {TIMELINE.map((t) => (
              <motion.li
                key={t.n}
                variants={fadeUp}
                className="group border-b border-line py-8 md:py-10 grid grid-cols-12 gap-6 items-baseline"
              >
                <div className="col-span-1 font-mono text-xs text-paper-3">{t.n}</div>
                <div className="col-span-2 font-mono text-[10px] tracking-widest uppercase text-accent">{t.tag}</div>
                <div className="col-span-9">
                  <h3 className="serif-h2 text-2xl md:text-3xl text-paper mb-2 group-hover:italic transition-all">
                    {t.title}
                  </h3>
                  <p className="text-paper-2 leading-relaxed text-[15px] max-w-2xl">{t.body}</p>
                </div>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </section>

      {/* =================== COMPARISON US vs THEM =================== */}
      <section id="compare" className="border-b border-line">
        <div className="shell py-20 md:py-28">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="mb-12"
          >
            <motion.div variants={fadeUp} className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 mb-3">
              7 categorias · cabeça a cabeça
            </motion.div>
            <motion.h2 variants={fadeUp} className="serif-h2 text-4xl md:text-5xl text-paper max-w-3xl">
              <span className="text-accent">Nós.</span> <span className="italic-accent text-paper-3">Eles.</span>
            </motion.h2>
            <motion.div variants={fadeUp} className="font-mono text-[10px] tracking-widest uppercase text-paper-3 mt-3">
              Preço, schema, ingest, retenção & mais · Atualizado 2026.04
            </motion.div>
          </motion.div>

          {/* Header columns */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-2 py-3 border-b border-line">
            <div className="col-span-1 font-mono text-[10px] tracking-widest uppercase text-paper-3">Cat.</div>
            <div className="col-span-11 grid grid-cols-2 gap-4">
              <div className="font-mono text-[10px] tracking-widest uppercase text-accent">ERP Universal</div>
              <div className="font-mono text-[10px] tracking-widest uppercase text-paper-3">Legado</div>
            </div>
          </div>

          <motion.ul
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-50px' }}
            variants={stagger}
            className="divide-y divide-line"
          >
            {COMPARISON.map((c) => (
              <motion.li
                key={c.cat}
                variants={fadeUp}
                className="grid grid-cols-12 gap-4 px-2 py-5 items-start hover:bg-bg-2 transition-colors"
              >
                <div className="col-span-1 font-mono text-[10px] text-paper-3 mt-1">{c.cat}</div>
                <div className="col-span-11 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald/15 ring-1 ring-emerald/40 text-emerald">
                      <Check className="size-3" strokeWidth={2.4} />
                    </span>
                    <span className="text-paper text-[15px] leading-relaxed">{c.us}</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-crimson/10 ring-1 ring-crimson/30 text-crimson">
                      <X className="size-3" strokeWidth={2.4} />
                    </span>
                    <span className="text-paper-3 text-[15px] leading-relaxed line-through decoration-paper-3/30">{c.them}</span>
                  </div>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* =================== TICKER TABLE =================== */}
      <section className="border-b border-line bg-bg-2">
        <div className="shell py-20 md:py-28">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="mb-10"
          >
            <motion.div variants={fadeUp} className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 mb-3">
              § Live ticker · últimas 4 min
            </motion.div>
            <motion.h2 variants={fadeUp} className="serif-h2 text-3xl md:text-4xl text-paper max-w-3xl">
              <span className="italic-accent text-accent">Cada</span> linha carrega seu rastro, sua origem, seu contexto.
            </motion.h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.8 }}
            className="border border-line bg-bg overflow-hidden"
          >
            <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-line bg-bg-2">
              <div className="col-span-3 font-mono text-[10px] tracking-widest uppercase text-paper-3">Hora</div>
              <div className="col-span-1 font-mono text-[10px] tracking-widest uppercase text-paper-3">Nível</div>
              <div className="col-span-2 font-mono text-[10px] tracking-widest uppercase text-paper-3">Tipo</div>
              <div className="col-span-1 font-mono text-[10px] tracking-widest uppercase text-paper-3 text-right">Mag</div>
              <div className="col-span-2 font-mono text-[10px] tracking-widest uppercase text-paper-3">Onde</div>
              <div className="col-span-3 font-mono text-[10px] tracking-widest uppercase text-paper-3">Nota</div>
            </div>
            <div>
              {TICKERS.map((t, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-line/40 last:border-0 hover:bg-bg-3 transition-colors"
                >
                  <div className="col-span-3 font-mono text-[12px] text-paper-2 tabular-nums">{t.time}</div>
                  <div className="col-span-1 font-mono text-[12px]">
                    <span className={`inline-block px-1.5 py-0.5 text-[10px] ${
                      t.depth === 'L1' ? 'bg-emerald/15 text-emerald' :
                      t.depth === 'L2' ? 'bg-gold/15 text-gold' :
                      'bg-crimson/15 text-crimson'
                    }`}>
                      {t.depth}
                    </span>
                  </div>
                  <div className="col-span-2 font-mono text-[12px] text-paper-2">{t.kind}</div>
                  <div className="col-span-1 font-mono text-[12px] text-paper text-right tabular-nums">{t.mag}</div>
                  <div className="col-span-2 font-mono text-[12px] text-paper-2 truncate">{t.where}</div>
                  <div className="col-span-3 font-mono text-[12px] text-paper-3 truncate">{t.note}</div>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-line bg-bg-2 flex justify-between font-mono text-[10px] tracking-widest uppercase text-paper-3">
              <span>Atualização em tempo real</span>
              <span>8 eventos · 08:14–08:17</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* =================== TESTIMONIALS =================== */}
      <section className="border-b border-line">
        <div className="shell py-20 md:py-28">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="mb-12"
          >
            <motion.div variants={fadeUp} className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 mb-3">
              3 entrevistas · Q1 2026
            </motion.div>
            <motion.h2 variants={fadeUp} className="serif-h2 text-3xl md:text-4xl text-paper max-w-3xl">
              Mais quieto, <span className="italic-accent text-accent">segundo equipes que usaram por um trimestre inteiro.</span>
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-50px' }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-3 gap-px bg-line"
          >
            {TESTIMONIALS.map((t) => (
              <motion.figure
                key={t.num}
                variants={fadeUp}
                className="bg-bg p-8 md:p-10 flex flex-col"
              >
                <div className="flex items-center justify-between mb-6">
                  <span className="font-mono text-[10px] tracking-widest uppercase text-paper-3">№ {t.num} · {t.label}</span>
                  <span className="font-mono text-[10px] tracking-widest uppercase text-accent">frame {t.num}/3</span>
                </div>
                <blockquote className="serif-h2 text-xl md:text-2xl text-paper leading-[1.3] flex-1 italic">
                  <span className="text-accent not-italic text-3xl align-top mr-1 leading-none">“</span>
                  {t.quote}
                  <span className="text-accent not-italic text-3xl align-bottom ml-1 leading-none">”</span>
                </blockquote>
                <figcaption className="mt-8 pt-5 border-t border-line">
                  <div className="text-sm font-semibold text-paper">{t.name}</div>
                  <div className="font-mono text-[10px] tracking-widest uppercase text-paper-3 mt-1">
                    {t.role} · {t.company}
                  </div>
                  <div className="font-mono text-[10px] tracking-widest uppercase text-accent mt-1">
                    Filed · {t.filed}
                  </div>
                </figcaption>
              </motion.figure>
            ))}
          </motion.div>
        </div>
      </section>

      {/* =================== TRUSTED BY =================== */}
      <section className="border-b border-line bg-bg-2">
        <div className="shell py-16">
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 mb-8 text-center">
            8 operações · desde 2023
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line">
            {TRUSTED.map((t) => (
              <div
                key={t.name}
                className="bg-bg-2 p-6 flex flex-col items-center justify-center group hover:bg-bg-3 transition-colors"
              >
                <span className="font-display italic text-2xl text-paper-2 group-hover:text-paper transition-colors">
                  {t.name}
                </span>
                <span className="font-mono text-[10px] tracking-widest uppercase text-paper-3 mt-1">
                  {t.est}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =================== PRICING RECEIPTS =================== */}
      <section id="planos" className="border-b border-line">
        <div className="shell py-20 md:py-28">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={stagger}
            className="mb-12"
          >
            <motion.div variants={fadeUp} className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3 mb-3">
              § Ledger · três tickets · 2026.04
            </motion.div>
            <motion.h2 variants={fadeUp} className="serif-h2 text-4xl md:text-5xl text-paper max-w-3xl">
              Escolha um plano. <span className="italic-accent text-accent">Sem cobrança por usuário.</span>
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-50px' }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-3 gap-px bg-line"
          >
            {PLANS.map((p) => (
              <motion.div
                key={p.code}
                variants={fadeUp}
                className={`relative bg-bg p-8 md:p-10 ${p.badge ? 'ring-1 ring-accent/50 bg-gradient-to-b from-accent/[0.04] to-bg' : ''}`}
              >
                {p.badge && (
                  <div className="absolute -top-3 left-8 px-3 py-1 bg-accent text-bg text-[9px] font-bold tracking-[0.2em] uppercase">
                    {p.badge}
                  </div>
                )}
                <div className="flex items-baseline justify-between mb-2">
                  <div className="serif-h2 text-2xl text-paper">ERP · {p.name}</div>
                </div>
                <div className="font-mono text-[10px] tracking-widest uppercase text-paper-3 mb-1">№ {p.code}</div>
                <div className="text-sm text-paper-2 mb-6 italic">{p.cadence}</div>

                <div className="font-mono text-[10px] tracking-widest uppercase text-accent mb-3">Inclui</div>
                <ul className="space-y-2.5 mb-8">
                  {p.incl.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-[14px] text-paper-2">
                      <span className="font-mono text-accent mt-0.5">·</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* Receipt style breakdown */}
                <div className="border-t border-line pt-5 space-y-2 mb-5 font-mono text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-paper-3">Subtotal</span>
                    <span className="text-paper">{p.subtotal}</span>
                  </div>
                  {'tax' in p && (
                    <div className="flex justify-between">
                      <span className="text-paper-3">Per-seat tax</span>
                      <span className="text-paper">{p.tax}</span>
                    </div>
                  )}
                  {'overage' in p && (
                    <div className="flex justify-between">
                      <span className="text-paper-3">Overage fees</span>
                      <span className="text-paper">{p.overage}</span>
                    </div>
                  )}
                  {'hidden' in p && (
                    <div className="flex justify-between">
                      <span className="text-paper-3">Hidden charges</span>
                      <span className="text-paper">{p.hidden}</span>
                    </div>
                  )}
                  {'setup' in p && (
                    <div className="flex justify-between">
                      <span className="text-paper-3">Setup fee</span>
                      <span className="text-paper">{p.setup}</span>
                    </div>
                  )}
                  <div className="border-t border-line pt-3 flex justify-between items-baseline">
                    <span className="text-paper-2 font-sans text-[10px] tracking-widest uppercase">Total due</span>
                    <span className="serif-h2 text-2xl text-accent">{p.total}</span>
                  </div>
                </div>

                <div className="font-mono text-[10px] tracking-widest uppercase text-paper-3 mb-4">
                  Auth · 0x{p.code.toLowerCase().replace('mrd-', 'mrd')}
                </div>

                <Link
                  href="/login"
                  className={`w-full inline-flex items-center justify-center gap-2 py-3.5 text-[12px] font-semibold tracking-wider uppercase transition-all duration-300 ${
                    p.badge
                      ? 'bg-accent text-bg hover:bg-accent-2'
                      : 'border border-line text-paper hover:bg-bg-2'
                  }`}
                  style={{ borderRadius: '999px' }}
                >
                  {p.cta}
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                </Link>
              </motion.div>
            ))}
          </motion.div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 font-mono text-[10px] tracking-widest uppercase text-paper-3">
            <span>Cobrança anual</span>
            <span className="text-paper-3/40">·</span>
            <span>30 dias de trial</span>
            <span className="text-paper-3/40">·</span>
            <span>Sem cartão pra começar</span>
          </div>
        </div>
      </section>

      {/* =================== CTA FINAL =================== */}
      <section className="border-b border-line">
        <div className="shell py-24 md:py-32 text-center">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-paper-3">
            § End of dispatch · 2026.04
          </span>
          <h2 className="serif-h2 mt-8 text-4xl md:text-7xl text-paper max-w-4xl mx-auto">
            <span className="italic-accent text-accent">O console</span> mais quieto<br />da sua operação.
          </h2>
          <p className="mt-8 text-paper-2 text-lg max-w-xl mx-auto">
            41 operações rodaram o ERP Universal por 90 dias. Nenhuma pediu para voltar.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/login" className="btn-primary">
              Iniciar teste gratuito
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
            <a href="#planos" className="nav-link">Ver planos</a>
          </div>
          <div className="mt-12 inline-flex items-center gap-6 text-[10px] font-mono tracking-widest uppercase text-paper-3">
            <span>LGPD</span>
            <span className="text-paper-3/40">·</span>
            <span>ISO 27001</span>
            <span className="text-paper-3/40">·</span>
            <span>SERVIDORES NO BRASIL</span>
          </div>
        </div>
      </section>

      {/* =================== FOOTER =================== */}
      <footer className="bg-bg-2">
        <div className="shell py-16">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-16">
            <div className="col-span-2">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="flex h-8 w-8 items-center justify-center border border-paper text-paper">
                  <Boxes className="h-4 w-4" strokeWidth={1.4} />
                </div>
                <div className="font-display text-base font-semibold">ERP <span className="italic-accent">Universal</span><sup className="text-[9px] font-mono text-paper-3 ml-0.5">®</sup></div>
              </div>
              <p className="text-paper-2/80 text-sm leading-relaxed max-w-xs">
                Operação de alta performance para negócios que pararam de improvisar. Construído em Brasília, operado em todo o Brasil.
              </p>
              <div className="mt-6 font-mono text-[10px] tracking-widest uppercase text-paper-3">EDIÇÃO 2026.04</div>
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-widest uppercase text-paper-3 mb-4">Produto</div>
              <ul className="space-y-3 text-sm">
                <li><a href="#zones" className="text-paper-2 hover:text-paper transition-colors">Zonas</a></li>
                <li><a href="#timeline" className="text-paper-2 hover:text-paper transition-colors">Operação</a></li>
                <li><a href="#compare" className="text-paper-2 hover:text-paper transition-colors">Comparação</a></li>
                <li><Link href="/login" className="text-paper-2 hover:text-paper transition-colors">Entrar</Link></li>
              </ul>
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-widest uppercase text-paper-3 mb-4">Empresa</div>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="text-paper-2 hover:text-paper transition-colors">Manifesto</a></li>
                <li><a href="#" className="text-paper-2 hover:text-paper transition-colors">Carreiras</a></li>
                <li><a href="#" className="text-paper-2 hover:text-paper transition-colors">Imprensa</a></li>
              </ul>
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-widest uppercase text-paper-3 mb-4">Suporte</div>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="text-paper-2 hover:text-paper transition-colors">Documentação</a></li>
                <li><a href="#" className="text-paper-2 hover:text-paper transition-colors">Status</a></li>
                <li><a href="#" className="text-paper-2 hover:text-paper transition-colors">Contato</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-line pt-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="font-mono text-[10px] tracking-widest uppercase text-paper-3">
              © {new Date().getFullYear()} ERP Universal · Filed from us-east-1
            </div>
            <div className="flex items-center gap-6 text-[10px] font-mono tracking-widest uppercase text-paper-3">
              <span>Construído com rigor no Brasil</span>
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
