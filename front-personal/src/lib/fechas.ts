// Fechas en hora local (toISOString usa UTC: en Ecuador, después de las 19:00 daría "mañana")
export const aISO = (d: Date) => {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dia}`
}

export const hoy = () => aISO(new Date())

export const ayer = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return aISO(d)
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']

export const nombreMes = (mes: number) => MESES[mes] ?? ''

export const fechaLarga = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} de ${nombreMes((m ?? 1) - 1)}${y !== new Date().getFullYear() ? ` de ${y}` : ''}`
}

export const dinero = (n: number) =>
  Math.abs(n).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
