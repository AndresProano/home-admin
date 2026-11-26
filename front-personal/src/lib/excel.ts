import type { BankAccount, Expense } from '@/composables/useFinances'
import { CATEGORIAS, SIN_CLASIFICAR } from './categorias'
import { aISO, hoy, ayer } from './fechas'

/* Plantilla, exportación e importación de movimientos en Excel (SheetJS, cargado solo al usarlo). */

const COLUMNAS = ['Fecha', 'Descripción', 'Monto', 'Tipo', 'Categoría', 'Cuenta', 'Compartido'] as const

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

/* ---------- descargas ---------- */

export async function descargarPlantilla(cuentas: BankAccount[]) {
  const XLSX = await cargarXLSX()
  const ejemploCuenta = cuentas.find(c => c.tipo !== 'credito')?.name ?? 'Pichincha'
  const ejemploCredito = cuentas.find(c => c.tipo === 'credito')?.name ?? ''
  const filas = [
    [...COLUMNAS],
    [hoy(), 'Ejemplo: Supermaxi', 45.2, 'Gasto', 'Supermercado', ejemploCuenta, 'No'],
    [ayer(), 'Ejemplo: Sueldo de noviembre', 1500, 'Ingreso', 'Otros', ejemploCuenta, 'No'],
    [ayer(), 'Ejemplo: Cena con mi pareja', 38.5, 'Gasto', 'Salidas', ejemploCredito, 'Sí'],
  ]
  const hoja = XLSX.utils.aoa_to_sheet(filas)
  hoja['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 10 }, { wch: 9 }, { wch: 16 }, { wch: 18 }, { wch: 11 }]

  const ayuda = [
    ['Cómo llenar la plantilla'],
    [],
    ['Columna', 'Qué poner'],
    ['Fecha', 'La fecha del movimiento: 2026-11-26, 26/11/2026 o una fecha de Excel.'],
    ['Descripción', 'Dónde o en qué (ej: Supermaxi, Uber, Netflix).'],
    ['Monto', 'El valor, sin signo (ej: 12,50). Si pones un número negativo se toma como gasto.'],
    ['Tipo', '"Gasto" o "Ingreso". Si lo dejas vacío, es Gasto.'],
    ['Categoría', 'Una de las de abajo. Si no coincide, se guarda como "Otros".'],
    ['Cuenta', 'El nombre de una de tus cuentas (abajo). Vacío = efectivo / ninguna.'],
    ['Compartido', '"Sí" si el gasto es de los dos (con tu pareja). Vacío = No.'],
    [],
    ['Categorías válidas'],
    ...CATEGORIAS.map(c => [c.nombre]),
    [],
    ['Tus cuentas'],
    ...(cuentas.length ? cuentas.map(c => [c.name, c.tipo === 'credito' ? 'Crédito' : 'Débito']) : [['(aún no tienes cuentas: créalas en Ajustes)']]),
    [],
    ['Las filas que empiezan con "Ejemplo:" no se importan; puedes borrarlas o escribir encima.'],
  ]
  const hojaAyuda = XLSX.utils.aoa_to_sheet(ayuda)
  hojaAyuda['!cols'] = [{ wch: 22 }, { wch: 80 }]

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Movimientos')
  XLSX.utils.book_append_sheet(libro, hojaAyuda, 'Instrucciones')
  XLSX.writeFile(libro, 'Plantilla Mis Finanzas.xlsx')
}

export async function exportarMovimientos(movs: Expense[], cuentas: BankAccount[]) {
  const XLSX = await cargarXLSX()
  const nombre = (id: string | null) => (id ? cuentas.find(c => c.id === id)?.name : '') ?? ''
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
  hoja['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 10 }, { wch: 9 }, { wch: 16 }, { wch: 18 }, { wch: 11 }]
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Movimientos')
  XLSX.writeFile(libro, `Mis movimientos ${hoy()}.xlsx`)
}

/* ---------- importación ---------- */

export interface FilaImport {
  date: string
  description: string
  amount: number
  type: 'expense' | 'income'
  category: string
  account_id: string | null
  is_shared: boolean
}

export interface Lectura {
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

export async function leerArchivo(archivo: File, cuentas: BankAccount[], userId: string): Promise<Lectura> {
  const XLSX = await cargarXLSX()
  const libro = XLSX.read(await archivo.arrayBuffer(), { cellDates: true })
  const nombreHoja = libro.SheetNames.find(n => norm(n) === 'movimientos') ?? libro.SheetNames[0]
  if (!nombreHoja) throw new Error('El archivo no tiene hojas')
  const datos = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombreHoja]!, { header: 1, raw: true, defval: '' })

  // encabezados: la primera fila que tenga "fecha" y "monto" (o sinónimos)
  const iCab = datos.findIndex(f => {
    const c = (f as unknown[]).map(norm)
    return c.some(x => ALIAS.fecha!.includes(x)) && c.some(x => ALIAS.monto!.includes(x))
  })
  if (iCab < 0) throw new Error('No encontré las columnas "Fecha" y "Monto". Usa la plantilla.')
  const cab = (datos[iCab] as unknown[]).map(norm)
  const col = (k: string) => cab.findIndex(x => ALIAS[k]!.includes(x))
  const c = { fecha: col('fecha'), desc: col('descripcion'), monto: col('monto'), tipo: col('tipo'),
    cat: col('categoria'), cuenta: col('cuenta'), comp: col('compartido') }

  const mias = cuentas.filter(a => a.owner_id === userId)
  const res: Lectura = { filas: [], avisos: [], omitidas: [], gastos: 0, ingresos: 0, desde: null, hasta: null }

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
    if (cuentaTxt && !/^(efectivo|ninguna|cash)$/i.test(norm(cuentaTxt))) {
      const cta = mias.find(a => norm(a.name) === norm(cuentaTxt))
      if (cta) account_id = cta.id
      else res.avisos.push(`Fila ${n}: no tienes la cuenta "${cuentaTxt}" → sin cuenta`)
    }

    const description = String(val(c.desc) ?? '').trim() || category
    res.filas.push({ date: fecha, description, amount, type, category, account_id, is_shared: siNo(val(c.comp)) })
    if (type === 'income') res.ingresos += amount
    else res.gastos += amount
    if (!res.desde || fecha < res.desde) res.desde = fecha
    if (!res.hasta || fecha > res.hasta) res.hasta = fecha
  })
  return res
}
