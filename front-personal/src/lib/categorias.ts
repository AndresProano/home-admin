// Debe coincidir con v_categorias en migration-presupuestos.sql
export const CATEGORIAS = [
  { nombre: 'Comida', icono: '🍔' },
  { nombre: 'Supermercado', icono: '🛒' },
  { nombre: 'Transporte', icono: '🚕' },
  { nombre: 'Servicios', icono: '💡' },
  { nombre: 'Arriendo', icono: '🏠' },
  { nombre: 'Entretenimiento', icono: '🎬' },
  { nombre: 'Salidas', icono: '🍻' },
  { nombre: 'Salud', icono: '💊' },
  { nombre: 'Compras', icono: '🛍️' },
  { nombre: 'Educación', icono: '📚' },
  { nombre: 'Suscripciones', icono: '🔁' },
  { nombre: 'Otros', icono: '📦' },
] as const

export const SIN_CLASIFICAR = 'Sin clasificar'
export const TOTAL = 'Total'

export const iconoDe = (categoria: string) =>
  categoria === TOTAL ? '💰' : CATEGORIAS.find(c => c.nombre === categoria)?.icono ?? '❔'
