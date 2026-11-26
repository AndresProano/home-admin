// Debe coincidir con v_categorias en las migraciones SQL (función add_expense_via_api_key)
export const CATEGORIAS = [
  { nombre: 'Comida', color: 'var(--lima)' },
  { nombre: 'Supermercado', color: 'var(--cielo)' },
  { nombre: 'Transporte', color: 'var(--amarillo)' },
  { nombre: 'Servicios', color: 'var(--menta)' },
  { nombre: 'Arriendo', color: 'var(--lila)' },
  { nombre: 'Entretenimiento', color: 'var(--rosa)' },
  { nombre: 'Salidas', color: 'var(--lila)' },
  { nombre: 'Salud', color: 'var(--menta)' },
  { nombre: 'Compras', color: 'var(--rosa)' },
  { nombre: 'Educación', color: 'var(--cielo)' },
  { nombre: 'Suscripciones', color: 'var(--amarillo)' },
  { nombre: 'Comisiones', color: 'var(--neutro)' },
  { nombre: 'Otros', color: 'var(--neutro)' },
] as const

export const SIN_CLASIFICAR = 'Sin clasificar'
export const TOTAL = 'Total'

/** Color de fondo del bloque/ícono de una categoría */
export const colorDe = (categoria: string) =>
  categoria === TOTAL ? 'var(--azul)'
    : categoria === SIN_CLASIFICAR ? 'var(--amarillo)'
      : CATEGORIAS.find(c => c.nombre === categoria)?.color ?? 'var(--neutro)'

/** Nombre para mostrar ('Total' → 'Todo el gasto') */
export const nombreCategoria = (categoria: string) => categoria === TOTAL ? 'Todo el gasto' : categoria
