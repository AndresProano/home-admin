import type { BankAccount, Expense, CuentaEditable } from '@/composables/useFinances'
import { SUBTIPOS, type Subtipo } from './cuentas'
import { CATEGORIAS, SIN_CLASIFICAR } from './categorias'
import { aISO, hoy, ayer } from './fechas'

/* Plantilla, exportación e importación de cuentas y movimientos en Excel (SheetJS, cargado solo al usarlo). */

const COLUMNAS = ['Fecha', 'Descripción', 'Monto', 'Tipo', 'Categoría', 'Cuenta', 'Compartido'] as const
const COLUMNAS_CUENTAS = ['Nombre', 'Tipo', 'Banco o entidad', 'Saldo', 'Tasa anual % (si tiene)', 'Meta $', 'Meta fecha', 'Vence', 'Nota'] as const

const cargarXLSX = () => import('xlsx')

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** "12,50" · "$1.234,56" · "USD 1,234.56" · 12.5 · "-8" → número (con signo) */
export const leerMonto = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').trim()
  if (!s) return null
  const antes = s.slice(0, Math.max(0, s.search(/\d/)))
  const negativo = antes.includes('-') || antes.includes('(') || /-\s*$/.test(s)
  const tok = (s.match(/[0-9][0-9.,]*/) ?? [''])[0].replace(/[.,]+$/, '')
  if (!tok) return null
  const dec = tok.match(/[.,](\d{1,2})$/)
  let n: number
  if (dec) {
    const ent = tok.slice(0, tok.length - dec[0].length).replace(/[.,]/g, '')
    n = Number(`${ent || '0'}.${dec[1]}`)
  } else {
    n = Number(tok.replace(/[.,]/g, ''))
  }
  if (!Number.isFinite(n)) return null
  return negativo ? -n : n
}

/** Date de Excel · "2026-11-01" · "01/11/2026" · "1-11-26" · "hoy" · "ayer" → "AAAA-MM-DD" */
export const leerFecha = (v: unknown): string | null => {
  if (v instanceof Date && !isNaN(v.getTime())) return aISO(v)
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // número de serie de Excel (días desde 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)
    return aISO(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  }
  const s = norm(v)
  if (!s) return null
  if (s === 'hoy') return hoy()
  if (s === 'ayer') return ayer()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return valida(+m[1]!, +m[2]!, +m[3]!)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) {
    let y = +m[3]!
    if (y < 100) y += 2000
    return valida(y, +m[2]!, +m[1]!) // día/mes/año (formato Ecuador)
  }
  return null
}
const valida = (y: number, mes: number, d: number) => {
  const f = new Date(y, mes - 1, d)
  return f.getFullYear() === y && f.getMonth() === mes - 1 && f.getDate() === d ? aISO(f) : null
}

const categoriaDe = (v: unknown) => {
  const n = norm(v)
  if (!n) return null
  return CATEGORIAS.find(c => norm(c.nombre) === n)?.nombre
    ?? CATEGORIAS.find(c => n.includes(norm(c.nombre)) || norm(c.nombre).includes(n))?.nombre
    ?? null
}

const siNo = (v: unknown) => ['si', 'sí', 'yes', 'true', '1', 'x', 'compartido'].includes(norm(v))

/** "Cuenta meta", "póliza", "Tarjeta de crédito", "ahorro" → subtipo */
const subtipoDe = (v: unknown): Subtipo | null => {
  const n = norm(v)
  if (!n) return null
  if (/credito|tarjeta|visa|master|diners|amex/.test(n)) return 'credito'
  if (/meta|programad/.test(n)) return 'meta'
  if (/inversion|poliza|plazo|deposito|cdt/.test(n)) return 'inversion'
  if (/efectivo|cash|billetera/.test(n)) return 'efectivo'
  if (/corriente/.test(n)) return 'corriente'
  if (/ahorro/.test(n)) return 'ahorros'
  return SUBTIPOS.find(t => norm(t.nombre) === n || norm(t.corto) === n)?.id ?? null
}

const anchoCols = (anchos: number[]) => anchos.map(wch => ({ wch }))

/* ---------- descargas ---------- */

export async function descargarPlantilla(cuentas: BankAccount[]) {
  const XLSX = await cargarXLSX()

  // Hoja "Cuentas": si ya tienes cuentas, las lista (para que veas cómo escribirlas); si no, ejemplos
  const filasCuentas: unknown[][] = [[...COLUMNAS_CUENTAS]]
  filasCuentas.push(
    ['Ejemplo: Pichincha', 'Ahorros', 'Banco Pichincha', 850, '', '', '', '', ''],
    ['Ejemplo: Cuenta Meta', 'Meta', 'Banco Guayaquil', 300, 6.5, 1200, '30/06/2027', '', 'Viaje'],
    ['Ejemplo: Póliza', 'Inversión', 'Produbanco', 2000, 7.25, '', '', '01/03/2027', ''],
    ['Ejemplo: Visa', 'Crédito', 'Diners Club', 240, '', '', '', '', 'En crédito, el saldo es lo que debes'],
    ['Ejemplo: Efectivo', 'Efectivo', '', 40, '', '', '', '', ''],
  )
  const hojaCuentas = XLSX.utils.aoa_to_sheet(filasCuentas)
  hojaCuentas['!cols'] = anchoCols([22, 12, 18, 10, 12, 10, 12, 12, 30])

  const ejemploCuenta = cuentas.find(c => c.tipo !== 'credito')?.name ?? 'Pichincha'
  const ejemploCredito = cuentas.find(c => c.tipo === 'credito')?.name ?? 'Visa'
  const filas = [
    [...COLUMNAS],
    [hoy(), 'Ejemplo: Supermaxi', 45.2, 'Gasto', 'Supermercado', ejemploCuenta, 'No'],
    [ayer(), 'Ejemplo: Sueldo de noviembre', 1500, 'Ingreso', 'Otros', ejemploCuenta, 'No'],
    [ayer(), 'Ejemplo: Cena con mi pareja', 38.5, 'Gasto', 'Salidas', ejemploCredito, 'Sí'],
  ]
  const hoja = XLSX.utils.aoa_to_sheet(filas)
  hoja['!cols'] = anchoCols([12, 28, 10, 9, 16, 18, 11])

  const ayuda = [
    ['Cómo llenar la plantilla'],
    [],
    ['Todo es opcional: llena solo lo que tengas. Puedes usar una hoja, la otra o las dos.'],
    ['Las filas que empiezan con "Ejemplo:" no se importan; puedes borrarlas o escribir encima.'],
    [],
    ['HOJA "CUENTAS"', ''],
    ['Nombre', 'Cómo la quieres ver (ej: Pichincha, Cuenta Meta). Si lo dejas vacío, se arma con el banco y el tipo.'],
    ['Tipo', 'Ahorros, Corriente, Efectivo, Meta (ahorro programado), Inversión (póliza / plazo fijo) o Crédito (tarjeta). Vacío = Ahorros.'],
    ['Banco o entidad', 'Banco Pichincha, Banco Guayaquil, Produbanco, cooperativa… (opcional).'],
    ['Saldo', 'Lo que tienes hoy. En tarjetas de crédito: lo que debes hoy.'],
    ['Tasa anual % (si tiene)', 'Solo si la cuenta te paga intereses (cuenta meta, póliza, algunas de ahorro). Si no, déjala vacía.'],
    ['Meta $ / Meta fecha', 'Solo para cuentas meta: a cuánto quieres llegar y para cuándo.'],
    ['Vence', 'Solo para pólizas: fecha de vencimiento.'],
    ['Nota', 'Lo que quieras recordar.'],
    ['', 'Si ya tienes una cuenta con el mismo nombre, no se duplica: se usa la que tienes.'],
    [],
    ['HOJA "MOVIMIENTOS"', ''],
    ['Fecha', 'La fecha del movimiento: 2026-11-26, 26/11/2026 o una fecha de Excel.'],
    ['Descripción', 'Dónde o en qué (ej: Supermaxi, Uber, Netflix).'],
    ['Monto', 'El valor, sin signo (ej: 12,50). Si pones un número negativo se toma como gasto.'],
    ['Tipo', '"Gasto" o "Ingreso". Si lo dejas vacío, es Gasto.'],
    ['Categoría', 'Una de las de abajo. Si no coincide, se guarda como "Otros".'],
    ['Cuenta', 'El nombre de una de tus cuentas (o de la hoja Cuentas). Vacío = efectivo / ninguna.'],
    ['Compartido', '"Sí" si el gasto es de los dos (con tu pareja). Vacío = No.'],
    [],
    ['Categorías válidas'],
    ...CATEGORIAS.map(c => [c.nombre]),
    [],
    ['Tus cuentas en la app'],
    ...(cuentas.length ? cuentas.map(c => [c.name, SUBTIPOS.find(t => t.id === c.subtipo)?.corto ?? '']) : [['(aún no tienes: agrégalas en la hoja Cuentas)']]),
  ]
  const hojaAyuda = XLSX.utils.aoa_to_sheet(ayuda)
  hojaAyuda['!cols'] = anchoCols([22, 100])

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hojaCuentas, 'Cuentas')
  XLSX.utils.book_append_sheet(libro, hoja, 'Movimientos')
  XLSX.utils.book_append_sheet(libro, hojaAyuda, 'Instrucciones')
  XLSX.writeFile(libro, 'Plantilla Mis Finanzas.xlsx')
}

export async function exportarMovimientos(movs: Expense[], cuentas: BankAccount[]) {
  const XLSX = await cargarXLSX()
  const nombre = (id: string | null) => (id ? cuentas.find(c => c.id === id)?.name : '') ?? ''
  const filasCuentas = [
    [...COLUMNAS_CUENTAS],
    ...cuentas.map(c => [
      c.name, SUBTIPOS.find(t => t.id === c.subtipo)?.corto ?? '', c.entidad ?? '',
      c.subtipo === 'credito' ? Math.max(0, -Number(c.balance)) : Number(c.balance),
      c.tasa_anual ?? '', c.meta_monto ?? '', c.meta_fecha ?? '', c.vencimiento ?? '', c.nota ?? '',
    ]),
  ]
  const hojaCuentas = XLSX.utils.aoa_to_sheet(filasCuentas)
  hojaCuentas['!cols'] = anchoCols([22, 12, 18, 10, 12, 10, 12, 12, 30])
  const filas = [
    [...COLUMNAS],
    ...[...movs].sort((a, b) => a.date.localeCompare(b.date)).map(e => [
      e.date,
      e.type === 'transfer' ? `${e.description} (${nombre(e.account_id)} → ${nombre(e.to_account_id ?? null)})` : e.description,
      Number(e.amount),
      e.type === 'income' ? 'Ingreso' : e.type === 'transfer' ? 'Transferencia' : 'Gasto',
      e.category === SIN_CLASIFICAR || e.type === 'transfer' ? '' : e.category, nombre(e.account_id), e.is_shared ? 'Sí' : 'No',
    ]),
  ]
  const hoja = XLSX.utils.aoa_to_sheet(filas)
  hoja['!cols'] = anchoCols([12, 28, 10, 9, 16, 18, 11])
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hojaCuentas, 'Cuentas')
  XLSX.utils.book_append_sheet(libro, hoja, 'Movimientos')
  XLSX.writeFile(libro, `Mis finanzas ${hoy()}.xlsx`)
}

/* ---------- importación ---------- */

export interface FilaImport {
  date: string
  description: string
  amount: number
  type: 'expense' | 'income'
  category: string
  account_id: string | null
  /** cuenta que viene en la hoja Cuentas y aún no existe: se resuelve al crearla */
  cuenta_nueva?: string
  is_shared: boolean
}

export type CuentaImport = CuentaEditable & { name: string }

export interface Lectura {
  cuentas: CuentaImport[]   // cuentas nuevas a crear
  filas: FilaImport[]
  avisos: string[]          // filas que se importan con algún ajuste
  omitidas: string[]        // filas que no se pueden importar
  gastos: number
  ingresos: number
  desde: string | null
  hasta: string | null
}

const ALIAS: Record<string, string[]> = {
  fecha: ['fecha', 'date', 'dia', 'día'],
  descripcion: ['descripcion', 'descripción', 'detalle', 'concepto', 'comercio', 'nombre', 'description', 'merchant'],
  monto: ['monto', 'valor', 'importe', 'cantidad', 'amount', 'total', 'precio'],
  tipo: ['tipo', 'type', 'movimiento'],
  categoria: ['categoria', 'categoría', 'category', 'rubro'],
  cuenta: ['cuenta', 'account', 'banco', 'tarjeta', 'medio de pago', 'metodo de pago'],
  compartido: ['compartido', 'shared', 'pareja'],
}
const ALIAS_CUENTAS: Record<string, string[]> = {
  nombre: ['nombre', 'cuenta', 'name'],
  tipo: ['tipo', 'tipo de cuenta', 'type'],
  entidad: ['banco o entidad', 'banco', 'entidad', 'institucion', 'institución'],
  saldo: ['saldo', 'saldo actual', 'monto', 'valor', 'balance', 'deuda'],
  tasa: ['tasa anual % (si tiene)', 'tasa anual %', 'tasa anual', 'tasa', 'interes', 'interés', 'rendimiento', '%'],
  meta: ['meta $', 'meta', 'objetivo'],
  metaFecha: ['meta fecha', 'fecha meta', 'para el'],
  vence: ['vence', 'vencimiento', 'fecha de vencimiento'],
  nota: ['nota', 'notas', 'comentario'],
}

type Hoja = unknown[][]

/** Índice de la fila de encabezados (la primera que tenga todas las columnas pedidas) */
const filaEncabezado = (datos: Hoja, alias: Record<string, string[]>, requeridas: string[]) =>
  datos.findIndex(f => {
    const c = (f as unknown[]).map(norm)
    return requeridas.every(k => c.some(x => alias[k]!.includes(x)))
  })

export async function leerArchivo(archivo: File, cuentas: BankAccount[], userId: string): Promise<Lectura> {
  const XLSX = await cargarXLSX()
  const libro = XLSX.read(await archivo.arrayBuffer(), { cellDates: true })
  const hojaDe = (n: string) => XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[n]!, { header: 1, raw: true, defval: '' }) as Hoja
  const res: Lectura = { cuentas: [], filas: [], avisos: [], omitidas: [], gastos: 0, ingresos: 0, desde: null, hasta: null }

  const mias = cuentas.filter(a => a.owner_id === userId)
  const existe = (nombre: string) => mias.find(a => norm(a.name) === norm(nombre))

  /* ---- hoja Cuentas ---- */
  const nombreHojaCuentas = libro.SheetNames.find(n => norm(n) === 'cuentas')
  if (nombreHojaCuentas) {
    const datos = hojaDe(nombreHojaCuentas)
    const iCab = filaEncabezado(datos, ALIAS_CUENTAS, ['nombre'])
    if (iCab >= 0) {
      const cab = (datos[iCab] as unknown[]).map(norm)
      const col = (k: string) => cab.findIndex(x => ALIAS_CUENTAS[k]!.includes(x))
      const c = { nombre: col('nombre'), tipo: col('tipo'), entidad: col('entidad'), saldo: col('saldo'), tasa: col('tasa'),
        meta: col('meta'), metaFecha: col('metaFecha'), vence: col('vence'), nota: col('nota') }
      datos.slice(iCab + 1).forEach((f, i) => {
        const val = (j: number) => (j >= 0 ? f[j] : '')
        const n = iCab + i + 2
        if (f.every(x => String(x ?? '').trim() === '')) return
        if (norm(val(c.nombre)).startsWith('ejemplo:')) return
        const subtipo = subtipoDe(val(c.tipo)) ?? 'ahorros'
        const entidad = String(val(c.entidad) ?? '').trim()
        let nombre = String(val(c.nombre) ?? '').trim()
        if (!nombre) {
          const ent = entidad.replace(/^(Banco( de| del)?|Cooperativa)\s+/i, '').trim()
          const corto = SUBTIPOS.find(t => t.id === subtipo)!.corto
          nombre = subtipo === 'efectivo' ? 'Efectivo' : ent ? `${ent}${subtipo === 'ahorros' ? '' : ' ' + corto}` : ''
        }
        if (!nombre) { res.omitidas.push(`Cuentas, fila ${n}: falta el nombre o el banco`); return }
        if (existe(nombre) || res.cuentas.some(x => norm(x.name) === norm(nombre))) {
          res.avisos.push(`Cuentas: "${nombre}" ya existe, se usa la que tienes`)
          return
        }
        if (String(val(c.tipo) ?? '').trim() && !subtipoDe(val(c.tipo))) res.avisos.push(`Cuentas, fila ${n}: tipo "${val(c.tipo)}" no se entiende → Ahorros`)
        const saldo = leerMonto(val(c.saldo)) ?? 0
        const tasa = leerMonto(val(c.tasa))
        const meta = leerMonto(val(c.meta))
        res.cuentas.push({
          name: nombre,
          subtipo,
          entidad: entidad || null,
          balance: subtipo === 'credito' ? -Math.abs(saldo) : saldo,
          tasa_anual: tasa != null && tasa > 0 && tasa <= 100 ? tasa : null,
          meta_monto: subtipo === 'meta' && meta ? Math.abs(meta) : null,
          meta_fecha: subtipo === 'meta' ? leerFecha(val(c.metaFecha)) : null,
          vencimiento: subtipo === 'inversion' ? leerFecha(val(c.vence)) : null,
          nota: String(val(c.nota) ?? '').trim() || null,
        })
      })
    }
  }

  /* ---- hoja Movimientos ---- */
  const candidatas = [
    ...libro.SheetNames.filter(n => norm(n) === 'movimientos'),
    ...libro.SheetNames.filter(n => !['movimientos', 'cuentas', 'instrucciones'].includes(norm(n))),
  ]
  let datos: Hoja = []
  let iCab = -1
  for (const n of candidatas) {
    datos = hojaDe(n)
    iCab = filaEncabezado(datos, ALIAS, ['fecha', 'monto'])
    if (iCab >= 0) break
  }
  if (iCab < 0) {
    if (!res.cuentas.length && !res.avisos.length) throw new Error('No encontré la hoja de Cuentas ni las columnas "Fecha" y "Monto". Usa la plantilla.')
    return res
  }
  const cab = (datos[iCab] as unknown[]).map(norm)
  const col = (k: string) => cab.findIndex(x => ALIAS[k]!.includes(x))
  const c = { fecha: col('fecha'), desc: col('descripcion'), monto: col('monto'), tipo: col('tipo'),
    cat: col('categoria'), cuenta: col('cuenta'), comp: col('compartido') }

  datos.slice(iCab + 1).forEach((f, i) => {
    const fila = f as unknown[]
    const n = iCab + i + 2 // número de fila como lo ve Excel
    const val = (j: number) => (j >= 0 ? fila[j] : '')
    if (fila.every(x => String(x ?? '').trim() === '')) return
    if (norm(val(c.desc)).startsWith('ejemplo:')) return // filas de ejemplo de la plantilla

    const fecha = leerFecha(val(c.fecha))
    const montoBruto = leerMonto(val(c.monto))
    if (!fecha) { res.omitidas.push(`Fila ${n}: la fecha "${val(c.fecha)}" no se entiende`); return }
    if (montoBruto === null || montoBruto === 0) { res.omitidas.push(`Fila ${n}: falta el monto`); return }

    const tipoTxt = norm(val(c.tipo))
    if (tipoTxt.startsWith('transfer')) { res.omitidas.push(`Fila ${n}: las transferencias no se importan (regístralas en Mis cuentas)`); return }
    const type: 'expense' | 'income' = tipoTxt.startsWith('ingreso') || tipoTxt === 'income' || tipoTxt.startsWith('entrada')
      ? 'income' : 'expense'
    const amount = Math.abs(Math.round(montoBruto * 100) / 100)

    const catTxt = String(val(c.cat) ?? '').trim()
    let category = categoriaDe(catTxt)
    if (!category) {
      category = 'Otros'
      if (catTxt && type === 'expense') res.avisos.push(`Fila ${n}: categoría "${catTxt}" no existe → Otros`)
    }

    const cuentaTxt = String(val(c.cuenta) ?? '').trim()
    let account_id: string | null = null
    let cuenta_nueva: string | undefined
    if (cuentaTxt && !/^(efectivo \/ ninguna|ninguna|cash)$/i.test(norm(cuentaTxt))) {
      const cta = existe(cuentaTxt)
      const nueva = res.cuentas.find(x => norm(x.name) === norm(cuentaTxt))
      if (cta) account_id = cta.id
      else if (nueva) cuenta_nueva = nueva.name
      else res.avisos.push(`Fila ${n}: no tienes la cuenta "${cuentaTxt}" → sin cuenta`)
    }

    const description = String(val(c.desc) ?? '').trim() || category
    res.filas.push({ date: fecha, description, amount, type, category, account_id, cuenta_nueva, is_shared: siNo(val(c.comp)) })
    if (type === 'income') res.ingresos += amount
    else res.gastos += amount
    if (!res.desde || fecha < res.desde) res.desde = fecha
    if (!res.hasta || fecha > res.hasta) res.hasta = fecha
  })
  return res
}
