/**
 * Entiende frases dictadas como:
 *   "gasté 12,50 en almuerzo con la visa"
 *   "ayer 20 dólares en uber"
 *   "netflix 10,99"
 *   "me pagaron 500 de sueldo en pichincha"
 *   "15 dólares con 50 en farmacia el lunes"
 * y devuelve monto, tipo, categoría, cuenta, fecha y descripción.
 * No depende de Vue: se puede probar suelto.
 */

export interface CuentaVoz { id: string; name: string; entidad?: string | null; subtipo?: string | null }

export interface ResultadoVoz {
  monto: number | null
  tipo: 'expense' | 'income'
  categoria: string | null      // null = no se reconoció
  cuentaId: string | null | undefined // undefined = no se dijo; null = efectivo
  fecha: string                 // AAAA-MM-DD
  descripcion: string
}

const quitarTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = (s: string) => quitarTildes(s.toLowerCase()).replace(/\s+/g, ' ').trim()
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Palabras clave → categoría (Ecuador) */
const CLAVES: [string, string[]][] = [
  ['Suscripciones', ['netflix', 'spotify', 'disney', 'hbo', 'max', 'prime video', 'amazon prime', 'youtube premium', 'apple music', 'icloud', 'chatgpt', 'openai', 'claude', 'suscripcion', 'membresia', 'paramount', 'crunchyroll', 'xbox game pass', 'playstation plus', 'canva', 'duolingo']],
  ['Supermercado', ['supermaxi', 'megamaxi', 'mi comisariato', 'comisariato', 'tia', 'aki', 'gran aki', 'santa maria', 'supermercado', 'coral', 'tuti', 'despensa', 'mercado', 'compras del mes', 'viveres']],
  ['Comida', ['almuerzo', 'desayuno', 'cena', 'comida', 'restaurante', 'cafe', 'cafeteria', 'starbucks', 'sweet & coffee', 'sweet and coffee', 'juan valdez', 'hamburguesa', 'pizza', 'kfc', 'mcdonald', 'burger', 'sushi', 'menestra', 'encebollado', 'pollo', 'empanada', 'helado', 'pedidosya', 'rappi', 'uber eats', 'snack', 'bolon', 'ceviche', 'tigrillo', 'hornado', 'fritada', 'almorzar', 'cenar', 'desayunar', 'lunch']],
  ['Transporte', ['uber', 'taxi', 'bus', 'buseta', 'gasolina', 'combustible', 'cabify', 'indrive', 'indriver', 'didi', 'metro', 'trole', 'ecovia', 'parqueadero', 'parqueo', 'peaje', 'pasaje', 'carro', 'mecanico', 'matricula del carro', 'transporte']],
  ['Servicios', ['luz', 'agua', 'internet', 'celular', 'claro', 'movistar', 'cnt', 'netlife', 'tvcable', 'plan', 'recarga', 'gas', 'empresa electrica', 'servicios']],
  ['Arriendo', ['arriendo', 'renta', 'alicuota', 'condominio', 'departamento', 'hipoteca']],
  ['Entretenimiento', ['cine', 'cinemark', 'supercines', 'concierto', 'teatro', 'juego', 'videojuego', 'steam', 'playstation', 'nintendo', 'museo', 'entretenimiento', 'boliche', 'karaoke']],
  ['Salidas', ['bar', 'discoteca', 'salida', 'cerveza', 'tragos', 'farra', 'fiesta', 'chupe', 'cocteles', 'pub', 'antro']],
  ['Salud', ['farmacia', 'medicina', 'medicamento', 'doctor', 'medico', 'cita', 'fybeca', 'pharmacys', 'sana sana', 'cruz azul', 'dentista', 'odontologo', 'laboratorio', 'examen', 'gimnasio', 'gym', 'seguro medico', 'clinica', 'hospital', 'salud']],
  ['Compras', ['ropa', 'zapatos', 'zapatillas', 'amazon', 'shein', 'temu', 'mercado libre', 'mall', 'centro comercial', 'regalo', 'kywi', 'ferreteria', 'decoracion', 'compras', 'tecnologia', 'audifonos', 'celular nuevo']],
  ['Educación', ['curso', 'universidad', 'colegio', 'libro', 'libros', 'colegiatura', 'pension', 'udemy', 'coursera', 'platzi', 'matricula', 'clases', 'educacion', 'utiles']],
  ['Comisiones', ['comision', 'cargo bancario', 'mantenimiento de cuenta']],
]

const NUMEROS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100,
}
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

/** "12,50" · "12.50" · "12 dólares con 50" · "doce dólares" · "$1.234,56" */
function leerMonto(t: string): { valor: number | null; quitar: RegExp[] } {
  // "X dólares con Y (centavos)"
  let m = t.match(/(\d+)\s*(?:dolares?|usd|\$)\s*(?:con|y)\s*(\d{1,2})\b(?:\s*centavos?)?/)
  if (m) return { valor: Number(m[1]) + Number(m[2]) / 100, quitar: [new RegExp(m[0].replace(/[$.*+?^()|[\]\\]/g, '\\$&'))] }
  // número con decimales o miles
  m = t.match(/\$?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:dolares?|usd|\$)?/)
  if (m) {
    let tok = m[1]!
    const dec = tok.match(/[.,](\d{1,2})$/)
    const n = dec ? Number(tok.slice(0, -dec[0].length).replace(/[.,]/g, '') + '.' + dec[1]) : Number(tok.replace(/[.,]/g, ''))
    return { valor: Number.isFinite(n) ? n : null, quitar: [new RegExp(m[0].replace(/[$.*+?^()|[\]\\]/g, '\\$&'))] }
  }
  // número en palabras: "veinte dólares", "treinta y cinco"
  const palabras = Object.keys(NUMEROS).sort((a, b) => b.length - a.length).join('|')
  m = t.match(new RegExp(`\\b(${palabras})(?:\\s+y\\s+(${palabras}))?\\b\\s*(?:dolares?|usd)`))
  if (m) return { valor: NUMEROS[m[1]!]! + (m[2] ? NUMEROS[m[2]]! : 0), quitar: [new RegExp(m[0])] }
  return { valor: null, quitar: [] }
}

function leerFecha(t: string, hoyRef: Date): { fecha: string; quitar: RegExp | null } {
  const d = new Date(hoyRef)
  if (/\banteayer\b|\bantier\b/.test(t)) { d.setDate(d.getDate() - 2); return { fecha: iso(d), quitar: /\b(anteayer|antier)\b/ } }
  if (/\bayer\b/.test(t)) { d.setDate(d.getDate() - 1); return { fecha: iso(d), quitar: /\bayer\b/ } }
  const dia = t.match(/\b(?:el\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)(?:\s+pasado)?\b/)
  if (dia) {
    const objetivo = DIAS.indexOf(dia[1]!)
    let atras = (d.getDay() - objetivo + 7) % 7
    if (atras === 0) atras = 7 // "el lunes" dicho un lunes = el anterior
    d.setDate(d.getDate() - atras)
    return { fecha: iso(d), quitar: new RegExp(dia[0]) }
  }
  const num = t.match(/\bel\s+(\d{1,2})(?:\s+de\s+(?:este\s+mes)?)?\b(?!\s*(?:dolares?|usd|\$|[.,]\d))/)
  if (num) {
    const n = Number(num[1])
    if (n >= 1 && n <= 31) {
      const f = new Date(d.getFullYear(), d.getMonth(), n)
      if (f > d) f.setMonth(f.getMonth() - 1) // un día futuro = el del mes pasado
      return { fecha: iso(f), quitar: new RegExp(num[0]) }
    }
  }
  return { fecha: iso(d), quitar: /\bhoy\b/ }
}

/** Busca la cuenta mencionada: por nombre, por banco o por tipo ("la tarjeta", "en efectivo") */
function leerCuenta(t: string, cuentas: CuentaVoz[]): { cuentaId: string | null | undefined; quitar: RegExp[] } {
  const corto = (s: string) => norm(s).replace(/^(banco( de| del)?|cooperativa)\s+/, '')
  // nombres más largos primero ("Visa Produbanco" antes que "Produbanco")
  const GENERICAS = new Set(['banco', 'cuenta', 'tarjeta', 'credito', 'ahorros', 'ahorro', 'corriente', 'meta', 'poliza', 'inversion', 'club', 'mi'])
  // nombre completo y banco primero; después cada palabra suelta del nombre ("Visa" de "Visa Diners")
  const completos = cuentas.flatMap(c => [
    { c, txt: norm(c.name) },
    ...(c.entidad ? [{ c, txt: corto(c.entidad) }] : []),
  ]).filter(x => x.txt.length >= 3).sort((a, b) => b.txt.length - a.txt.length)
  const palabras = cuentas.flatMap(c => norm(c.name).split(' ').filter(w => w.length >= 4 && !GENERICAS.has(w)).map(w => ({ c, txt: w })))
  const candidatos = [...completos, ...palabras]
  for (const { c, txt } of candidatos) {
    const re = new RegExp(`(?:\\b(?:con|en|de|desde|por)\\s+(?:la|el|mi)?\\s*)?\\b${txt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    if (re.test(t)) return { cuentaId: c.id, quitar: [re] }
  }
  const creditos = cuentas.filter(c => c.subtipo === 'credito')
  if (creditos.length === 1 && /\b(?:con\s+(?:la|mi)\s+)?(?:tarjeta(?:\s+de\s+credito)?|credito)\b/.test(t)) {
    return { cuentaId: creditos[0]!.id, quitar: [/\b(?:con\s+(?:la|mi)\s+)?(?:tarjeta(?:\s+de\s+credito)?|credito)\b/] }
  }
  if (/\b(?:en\s+|con\s+)?efectivo\b|\bcash\b/.test(t)) {
    const ef = cuentas.find(c => c.subtipo === 'efectivo')
    return { cuentaId: ef ? ef.id : null, quitar: [/\b(?:en\s+|con\s+)?efectivo\b|\bcash\b/] }
  }
  return { cuentaId: undefined, quitar: [] }
}

function leerCategoria(t: string): string | null {
  for (const [cat, claves] of CLAVES) {
    if (norm(cat) && new RegExp(`\\b${norm(cat)}\\b`).test(t)) return cat
    for (const k of claves) if (new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')}\\b`).test(t)) return cat
  }
  return null
}

export function interpretarVoz(texto: string, cuentas: CuentaVoz[], hoyRef = new Date()): ResultadoVoz {
  let t = norm(texto).replace(/[¿?¡!]/g, '')
  const tipo: 'expense' | 'income' =
    /\b(me pagaron|recibi|cobre|gane|ingreso|me depositaron|me transfirieron|me llego|sueldo|salario|quincena)\b/.test(t) ? 'income' : 'expense'

  // primero la fecha ("el 15") para que no se confunda con el monto
  const fecha = leerFecha(t, hoyRef)
  if (fecha.quitar) t = t.replace(fecha.quitar, ' ')
  const monto = leerMonto(t)
  monto.quitar.forEach(r => { t = t.replace(r, ' ') })
  const cuenta = leerCuenta(t, cuentas)
  cuenta.quitar.forEach(r => { t = t.replace(r, ' ') })
  const categoria = tipo === 'income' ? (leerCategoria(t) ?? 'Otros') : leerCategoria(t)

  // descripción: lo que queda sin muletillas
  const desc = t
    .replace(/\b(yo|hoy|gaste|pague|compre|me pagaron|recibi|cobre|gane|me depositaron|me transfirieron|me llego|un|una|unos|unas|dolares?|usd|centavos?|por favor)\b/g, ' ')
    .replace(/^\s*(en|de|por|para|con|el|la|los|las)\s+/g, '')
    .replace(/\s+(en|de|por|para|con|el|la|los|las|y)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const limpia = desc.replace(/^(en|de|por|para|con|el|la)\s+/, '').trim()
  const descripcion = limpia ? limpia.charAt(0).toUpperCase() + limpia.slice(1) : (categoria ?? (tipo === 'income' ? 'Ingreso' : 'Gasto'))

  return { monto: monto.valor, tipo, categoria, cuentaId: cuenta.cuentaId, fecha: fecha.fecha, descripcion }
}
