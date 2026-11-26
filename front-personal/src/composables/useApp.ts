import { ref, computed, watch } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useFinances, type Expense, type NewExpense } from '@/composables/useFinances'

/* Estado global de la app (compartido entre pantallas) */

const leer = (k: string, def: string) => { try { return localStorage.getItem(k) || def } catch { return def } }
const guardarLS = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sin storage */ } }

/** Lista activa: lo mío o lo compartido con la pareja */
const lista = ref<'personal' | 'shared'>(leer('fin_listFilter', 'personal') as 'personal' | 'shared')
watch(lista, v => guardarLS('fin_listFilter', v))

export type Hoja = { modo: 'nuevo' | 'editar' | 'clasificar'; movimiento: Expense | null; prellenado?: Partial<NewExpense> }
const hoja = ref<Hoja | null>(null)
const saltados = ref<Set<string>>(new Set())

let carga: Promise<void> | null = null

export function useApp() {
  const fin = useFinances()
  const { user, waitForAuth } = useAuth()

  const parejaId = computed(() => {
    const p = fin.partner.value
    if (!p || p.status !== 'active' || !user.value) return null
    return (p.user_a === user.value.id ? p.user_b : p.user_a) ?? null
  })
  const tienePareja = computed(() => !!parejaId.value)
  const compartido = computed(() => lista.value === 'shared' && tienePareja.value)

  /** Carga todo una sola vez (cada pantalla la llama; solo la primera pega a la red) */
  const cargar = (forzar = false) => {
    if (!carga || forzar) {
      carga = (async () => {
        await waitForAuth()
        if (!user.value) return
        await fin.loadProfile(user.value.id)
        await fin.loadPartner(user.value.id)
        await Promise.all([fin.loadAccounts(), fin.loadExpenses(), fin.loadBudgets(), fin.loadApiKey(user.value.id)])
        if (parejaId.value) await fin.loadProfile(parejaId.value)
      })()
    }
    return carga
  }
  const olvidarCarga = () => { carga = null }

  /** Foto de Google de un usuario (la propia sale de la sesión; la de la pareja, de su perfil) */
  const fotoDe = (id: string) => {
    const meta = id === user.value?.id ? (user.value?.user_metadata ?? {}) : {}
    return (fin.profilesCache.value[id]?.avatar_url as string | null | undefined)
      ?? (meta.avatar_url as string | undefined) ?? (meta.picture as string | undefined) ?? null
  }

  const nombreDe = (id: string) => id === user.value?.id ? 'Tú' : fin.getDisplayName(id).split(' ')[0] ?? ''
  const esMio = (ownerId: string) => ownerId === user.value?.id

  /* Hoja de movimiento */
  const colaClasificar = computed(() => fin.pendingReview.value.filter(e => !saltados.value.has(e.id)))

  const abrirClasificar = () => {
    saltados.value = new Set()
    const primero = colaClasificar.value[0]
    if (primero) hoja.value = { modo: 'clasificar', movimiento: primero }
  }
  const siguienteDeCola = () => {
    const sig = colaClasificar.value[0]
    hoja.value = sig ? { modo: 'clasificar', movimiento: sig } : null
  }
  const abrirNuevo = (prellenado?: Partial<NewExpense>) => { hoja.value = { modo: 'nuevo', movimiento: null, prellenado } }
  const abrirMovimiento = (tx: Expense) => {
    if (!esMio(tx.owner_id)) return
    hoja.value = { modo: tx.needs_review ? 'clasificar' : 'editar', movimiento: tx }
  }
  const saltar = () => {
    if (hoja.value?.movimiento) saltados.value.add(hoja.value.movimiento.id)
    siguienteDeCola()
  }
  const cerrarHoja = () => { hoja.value = null }

  return {
    lista, compartido, parejaId, tienePareja, cargar, olvidarCarga, nombreDe, fotoDe, esMio,
    hoja, colaClasificar, abrirClasificar, siguienteDeCola, abrirNuevo, abrirMovimiento, saltar, cerrarHoja,
  }
}
