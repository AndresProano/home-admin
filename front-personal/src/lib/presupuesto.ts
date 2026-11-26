import type { Budget, Expense } from '@/composables/useFinances'
import { aISO } from './fechas'
import { TOTAL } from './categorias'

export type Periodo = 'mensual' | 'anual'

/** Rango [inicio, fin) del periodo que contiene la fecha de referencia */
export const rangoPeriodo = (periodo: Periodo, ref: Date) => {
  const y = ref.getFullYear()
  if (periodo === 'anual') {
    return { inicio: aISO(new Date(y, 0, 1)), fin: aISO(new Date(y + 1, 0, 1)) }
  }
  const m = ref.getMonth()
  return { inicio: aISO(new Date(y, m, 1)), fin: aISO(new Date(y, m + 1, 1)) }
}

/** Misma regla que gastado_en_presupuesto() en SQL */
export const gastoCuenta = (b: Budget, e: Expense) =>
  (e.type || 'expense') === 'expense' &&
  !e.needs_review &&
  e.is_shared === b.is_shared &&
  (b.is_shared || e.owner_id === b.owner_id) &&
  (b.category === TOTAL || e.category === b.category)

export interface EstadoPresupuesto {
  budget: Budget
  gastado: number
  restante: number
  porcentaje: number      // 0..∞
  /** cuánto "debería" llevar gastado a esta altura del periodo (ritmo lineal) */
  esperado: number
  /** cuánto puedes gastar por día (mensual) o por mes (anual) lo que queda */
  porUnidad: number
  unidad: 'día' | 'mes'
  nivel: 'ok' | 'alerta' | 'pasado'
  /** solo compartidos: cuánto lleva gastado cada uno contra su aporte */
  porPersona: { userId: string; gastado: number; aporte: number }[]
}

export const estadoPresupuesto = (b: Budget, gastos: Expense[], ref: Date): EstadoPresupuesto => {
  const periodo = b.period as Periodo
  const { inicio, fin } = rangoPeriodo(periodo, ref)
  const delPeriodo = gastos.filter(e => e.date >= inicio && e.date < fin && gastoCuenta(b, e))
  const gastado = delPeriodo.reduce((s, e) => s + Number(e.amount), 0)

  let porPersona: EstadoPresupuesto['porPersona'] = []
  if (b.is_shared) {
    const ids = new Set([...Object.keys(b.aportes ?? {}), ...delPeriodo.map(e => e.owner_id)])
    porPersona = [...ids].map(userId => ({
      userId,
      aporte: Number(b.aportes?.[userId] ?? 0),
      gastado: delPeriodo.filter(e => e.owner_id === userId).reduce((s, e) => s + Number(e.amount), 0),
    }))
  }
  const monto = Number(b.amount)
  const restante = monto - gastado

  // avance del periodo: si el periodo ya pasó = 1, si es futuro = 0
  const ahora = new Date()
  const ini = new Date(inicio + 'T00:00:00')
  const fi = new Date(fin + 'T00:00:00')
  const avance = Math.min(1, Math.max(0, (ahora.getTime() - ini.getTime()) / (fi.getTime() - ini.getTime())))
  const esperado = monto * avance

  let porUnidad: number
  if (periodo === 'mensual') {
    const diasRestantes = Math.max(1, Math.ceil((fi.getTime() - Math.max(ahora.getTime(), ini.getTime())) / 86400000))
    porUnidad = restante / diasRestantes
  } else {
    const mesActual = ahora.getFullYear() === ini.getFullYear() ? ahora.getMonth() : (ahora < ini ? 0 : 11)
    porUnidad = restante / Math.max(1, 12 - mesActual)
  }

  const porcentaje = monto > 0 ? gastado / monto : 0
  const nivel = porcentaje > 1 ? 'pasado' : (porcentaje >= 0.85 || gastado > esperado * 1.1 + 0.01) ? 'alerta' : 'ok'

  return { budget: b, gastado, restante, porcentaje, esperado, porUnidad,
    unidad: periodo === 'mensual' ? 'día' : 'mes', nivel, porPersona }
}

/** El presupuesto que afecta a un gasto: el de su categoría (mensual antes que anual) */
export const presupuestoDeGasto = (budgets: Budget[], e: Pick<Expense, 'category' | 'is_shared' | 'owner_id'>) =>
  budgets
    .filter(b => b.category === e.category && b.is_shared === e.is_shared && (b.is_shared || b.owner_id === e.owner_id))
    .sort((a, b) => (a.period === 'mensual' ? -1 : 1) - (b.period === 'mensual' ? -1 : 1))[0]
