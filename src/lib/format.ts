export const formatMoney = (cents: number) => {
  const v = cents / 100
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export const formatShortId = (id: string) => id.slice(0, 8)

