import type { BankAccount } from '@/composables/useFinances'

export type Subtipo = 'corriente' | 'ahorros' | 'meta' | 'inversion' | 'efectivo' | 'credito'

/** Tipos de cuenta (en el orden en que se muestran) */
export const SUBTIPOS: { id: Subtipo; nombre: string; corto: string; ayuda: string; icono: string; color: string; grupo: 'disponible' | 'ahorro' | 'deuda' }[] = [
  { id: 'ahorros', nombre: 'Cuenta de ahorros', corto: 'Ahorros', ayuda: 'Tu cuenta del día a día (Pichincha, Guayaquil…).', icono: 'banco', color: 'var(--cielo)', grupo: 'disponible' },
  { id: 'corriente', nombre: 'Cuenta corriente', corto: 'Corriente', ayuda: 'Cuenta con chequera.', icono: 'banco', color: 'var(--cielo)', grupo: 'disponible' },
  { id: 'efectivo', nombre: 'Efectivo', corto: 'Efectivo', ayuda: 'Lo que llevas en la billetera.', icono: 'efectivo', color: 'var(--menta)', grupo: 'disponible' },
  { id: 'meta', nombre: 'Cuenta meta / ahorro programado', corto: 'Meta', ayuda: 'Ahorro con rendimiento y una meta (Cuenta Meta, ahorro programado…).', icono: 'meta', color: 'var(--lima)', grupo: 'ahorro' },
  { id: 'inversion', nombre: 'Inversión / póliza', corto: 'Inversión', ayuda: 'Plazo fijo o póliza: dinero que rinde hasta que vence.', icono: 'inversion', color: 'var(--lila)', grupo: 'ahorro' },
  { id: 'credito', nombre: 'Tarjeta de crédito', corto: 'Crédito', ayuda: 'Cada gasto suma a lo que debes.', icono: 'tarjeta', color: 'var(--durazno)', grupo: 'deuda' },
]

export const infoSubtipo = (s: string | undefined | null) =>
  SUBTIPOS.find(x => x.id === s) ?? SUBTIPOS[0]!

/** Sugerencias de entidades en Ecuador (se puede escribir cualquier otra) */
export const ENTIDADES = [
  'Banco Pichincha', 'Banco Guayaquil', 'Produbanco', 'Banco del Pacífico', 'Banco Internacional',
  'Banco Bolivariano', 'Banco del Austro', 'Banco de Machala', 'Banco Solidario', 'Banco General Rumiñahui',
  'Banco de Loja', 'Banco ProCredit', 'Diners Club', 'Mutualista Pichincha', 'Cooperativa JEP',
  'Cooperativa Jardín Azuayo', 'Cooperativa 29 de Octubre', 'Cooperativa Policía Nacional', 'Deuna', 'Payphone',
]

export const esDeuda = (c: Pick<BankAccount, 'subtipo' | 'tipo'>) => (c.subtipo ?? (c.tipo === 'credito' ? 'credito' : '')) === 'credito'
export const deudaDe = (c: BankAccount) => Math.max(0, -Number(c.balance))

/** Rendimiento estimado con la tasa anual (interés simple, antes de impuestos) */
export const rendimiento = (c: BankAccount) => {
  const tasa = Number(c.tasa_anual ?? 0)
  const saldo = Math.max(0, Number(c.balance))
  if (!tasa || !saldo) return null
  const anual = saldo * tasa / 100
  return { mensual: anual / 12, anual }
}

/** Avance hacia la meta: cuánto falta y cuánto apartar por mes para llegar a la fecha */
export const avanceMeta = (c: BankAccount) => {
  const meta = Number(c.meta_monto ?? 0)
  if (!meta) return null
  const saldo = Math.max(0, Number(c.balance))
  const falta = Math.max(0, meta - saldo)
  let porMes: number | null = null
  let meses: number | null = null
  if (c.meta_fecha && falta > 0) {
    const hoy = new Date()
    const fin = new Date(c.meta_fecha + 'T12:00:00')
    meses = Math.max(1, (fin.getFullYear() - hoy.getFullYear()) * 12 + (fin.getMonth() - hoy.getMonth()))
    porMes = falta / meses
  }
  return { meta, falta, porcentaje: Math.min(1, saldo / meta), porMes, meses, lograda: falta === 0 }
}

/** Días para el vencimiento de una inversión */
export const diasParaVencer = (c: BankAccount) => {
  if (!c.vencimiento) return null
  const fin = new Date(c.vencimiento + 'T12:00:00').getTime()
  return Math.ceil((fin - Date.now()) / 86400000)
}

/** Totales para la pantalla de cuentas */
export const resumenCuentas = (cuentas: BankAccount[]) => {
  let disponible = 0, ahorro = 0, deuda = 0, rendMes = 0
  for (const c of cuentas) {
    const g = infoSubtipo(c.subtipo).grupo
    if (g === 'deuda') deuda += deudaDe(c)
    else if (g === 'ahorro') ahorro += Number(c.balance)
    else disponible += Number(c.balance)
    rendMes += rendimiento(c)?.mensual ?? 0
  }
  return { disponible, ahorro, deuda, rendMes, patrimonio: disponible + ahorro - deuda }
}
