<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import Icono from '@/components/Icono.vue'
import SelectorPareja from '@/components/SelectorPareja.vue'
import { useAuth } from '@/composables/useAuth'
import { useFinances, type Expense } from '@/composables/useFinances'
import { useApp } from '@/composables/useApp'
import { colorDe } from '@/lib/categorias'
import { infoSubtipo } from '@/lib/cuentas'
import { aISO, hoy, ayer, fechaLarga, dinero } from '@/lib/fechas'

const { user } = useAuth()
const { expenses, accounts } = useFinances()
const { compartido, cargar, abrirMovimiento, nombreDe } = useApp()

onMounted(() => cargar())

const leer = (k: string, def: string) => { try { return localStorage.getItem(k) || def } catch { return def } }
type Periodo = 'week' | 'month' | 'year' | 'all'
const periodo = ref<Periodo>(leer('fin_timePeriod', 'month') as Periodo)
watch(periodo, v => { try { localStorage.setItem('fin_timePeriod', v) } catch { /* sin storage */ } })
const busqueda = ref('')

const desde = computed(() => {
  const d = new Date()
  if (periodo.value === 'week') { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return aISO(d) }
  if (periodo.value === 'month') return aISO(new Date(d.getFullYear(), d.getMonth(), 1))
  if (periodo.value === 'year') return aISO(new Date(d.getFullYear(), 0, 1))
  return '1900-01-01'
})

const filtrados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return expenses.value.filter(e =>
    e.is_shared === compartido.value && e.date >= desde.value &&
    (!q || e.description.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)))
})
const gastado = computed(() => filtrados.value.filter(e => (e.type || 'expense') === 'expense').reduce((s, e) => s + Number(e.amount), 0))
const ingresado = computed(() => filtrados.value.filter(e => e.type === 'income').reduce((s, e) => s + Number(e.amount), 0))

const grupos = computed(() => {
  const out: { fecha: string; etiqueta: string; items: Expense[] }[] = []
  for (const e of filtrados.value) {
    const ultimo = out[out.length - 1]
    if (ultimo && ultimo.fecha === e.date) ultimo.items.push(e)
    else out.push({ fecha: e.date, etiqueta: e.date === hoy() ? 'Hoy' : e.date === ayer() ? 'Ayer' : fechaLarga(e.date), items: [e] })
  }
  return out
})

const nombreCuenta = (id: string | null) => {
  const a = id ? accounts.value.find(x => x.id === id) : undefined
  return a ? `${a.name} (${infoSubtipo(a.subtipo).corto.toLowerCase()})` : ''
}
const METODOS: Record<string, string> = { cash: 'Efectivo', apple_pay: 'Apple Pay', bank_transfer: 'Transferencia' }
const esTransfer = (e: Expense) => e.type === 'transfer'
const soloNombre = (id: string | null | undefined) => (id ? accounts.value.find(a => a.id === id)?.name : '') ?? '?'
const detalle = (e: Expense) => esTransfer(e) ? `Transferencia · ${soloNombre(e.account_id)} → ${soloNombre(e.to_account_id)}` : [
  e.needs_review ? 'Toca para clasificar' : e.category,
  e.exterior ? 'Exterior' : '',
  METODOS[e.payment_method ?? ''] ?? '',
  nombreCuenta(e.account_id),
  compartido.value && e.owner_id !== user.value?.id ? nombreDe(e.owner_id) : '',
].filter(Boolean).join(' · ')
</script>

<template>
  <main class="pagina">
    <header class="cabecera">
      <h1 class="titulo-pagina">Movimientos</h1>
      <SelectorPareja />
    </header>

    <div class="seg">
      <button :class="{ on: periodo === 'week' }" @click="periodo = 'week'">Semana</button>
      <button :class="{ on: periodo === 'month' }" @click="periodo = 'month'">Mes</button>
      <button :class="{ on: periodo === 'year' }" @click="periodo = 'year'">Año</button>
      <button :class="{ on: periodo === 'all' }" @click="periodo = 'all'">Todo</button>
    </div>

    <label class="campo buscar">
      <span class="sr">Buscar</span>
      <Icono nombre="buscar" :tam="18" class="lupa" />
      <input v-model="busqueda" type="search" placeholder="Buscar por nombre o categoría" />
    </label>

    <div class="totales">
      <div class="bloque" style="background: var(--durazno)">
        <span class="muted" style="color: var(--tinta)">Gastado</span>
        <span class="cifra" style="font-size: 24px">${{ dinero(gastado) }}</span>
      </div>
      <div class="bloque" style="background: var(--menta)">
        <span class="muted" style="color: var(--tinta)">Ingresos</span>
        <span class="cifra" style="font-size: 24px">${{ dinero(ingresado) }}</span>
      </div>
    </div>

    <div v-if="!grupos.length" class="bloque punteado vacio">
      <strong>{{ busqueda ? 'Nada coincide con tu búsqueda' : 'No hay movimientos en este periodo' }}</strong>
    </div>

    <section v-for="g in grupos" :key="g.fecha">
      <h2 class="fecha-grupo">{{ g.etiqueta }}</h2>
      <button v-for="e in g.items" :key="e.id" class="mov" @click="abrirMovimiento(e)">
        <span class="icono-cat" :style="{ background: esTransfer(e) ? 'var(--neutro)' : e.type === 'income' ? 'var(--menta)' : colorDe(e.needs_review ? 'Sin clasificar' : e.category) }">
          <Icono :nombre="esTransfer(e) ? 'transferencia' : e.type === 'income' ? 'ingreso' : e.needs_review ? 'Sin clasificar' : e.category" :tam="18" />
        </span>
        <span class="mov-info"><strong>{{ e.description }}</strong><span>{{ detalle(e) }}</span></span>
        <span class="mov-monto" :class="{ ingreso: e.type === 'income' }">{{ esTransfer(e) ? '' : e.type === 'income' ? '+' : '−' }}${{ dinero(Number(e.amount)) }}</span>
      </button>
    </section>
  </main>
</template>

<style scoped>
.buscar { position: relative; }
.buscar input { padding-left: 42px; }
.lupa { position: absolute; left: 14px; top: 15px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.totales { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.totales .bloque { display: flex; flex-direction: column; gap: 4px; }
</style>
