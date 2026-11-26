import type { Expense } from '@/composables/useFinances'

/**
 * Impuestos por consumos en el exterior (Ecuador).
 * - IVA a servicios digitales: lo retiene el banco aparte (15% por defecto; se configura en Mis cuentas).
 * - ISD: 5% solo sobre lo que pase de $5.188,26 al año en consumos con tarjeta en el exterior
 *   (monto exento fijado por el SRI para 2025–2027). Se declara una vez al año.
 */
export const ISD_EXENTO_ANUAL = 5188.26
export const ISD_TASA = 5

export const CATEGORIA_DIGITAL = 'Suscripciones'

/** Consumos en el exterior del año (solo los gastos marcados, sin el IVA que cobra el banco aparte) */
export const resumenISD = (gastos: Expense[], userId: string, anio = new Date().getFullYear()) => {
  const desde = `${anio}-01-01`, hasta = `${anio + 1}-01-01`
  const total = gastos
    .filter(e => e.owner_id === userId && e.exterior && (e.type || 'expense') === 'expense' && e.date >= desde && e.date < hasta)
    .reduce((s, e) => s + Number(e.amount), 0)
  const exceso = Math.max(0, total - ISD_EXENTO_ANUAL)
  return {
    anio, total, exceso,
    porcentaje: Math.min(1, total / ISD_EXENTO_ANUAL),
    restanteExento: Math.max(0, ISD_EXENTO_ANUAL - total),
    isdEstimado: exceso * ISD_TASA / 100,
  }
}
