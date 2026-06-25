/**
 * Tokens de marca Garciat — fonte única de verdade para nome e cores.
 *
 * Identidade: dark premium "effervescent". Verde-esmeralda efervescente
 * (carbonatação das bebidas) + dourado âmbar (cerveja/whisky premium).
 *
 * As mesmas cores estão espelhadas em tailwind.config.js (tokens `app.*`)
 * para uso via classes utilitárias. Use estas constantes quando precisar do
 * valor hex em runtime (ex.: SVG inline de gráficos e do logo).
 */

export const BRAND = {
  name: 'Garciat',
  product: 'Garciat',
  tagline: 'Gestão de bebidas',
  /** Usado no <title> do app. */
  documentTitle: 'Garciat — Gestão de bebidas',
} as const

export const BRAND_COLORS = {
  bg: '#0A0E13',
  s1: '#111824',
  s2: '#19222F',
  border: '#283341',
  text: '#EAEEF5',
  muted: '#9CA7B8',
  primary: '#1FCB87',
  primaryHover: '#17AE73',
  accent: '#E3B45E',
  success: '#2FB67A',
} as const

/** Paleta categórica para séries de gráficos (canais, categorias, etc.). */
export const CHART_PALETTE = [
  BRAND_COLORS.primary, // esmeralda
  BRAND_COLORS.accent, // âmbar
  '#38BDF8', // cyan
  '#A78BFA', // violeta
  '#FB7185', // rosa
  '#FBBF24', // amarelo
] as const
