<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute, RouterLink } from 'vue-router'
import Icono from '@/components/Icono.vue'
import { useAuth } from '@/composables/useAuth'
import { useFinances, type Expense } from '@/composables/useFinances'
import { useApp } from '@/composables/useApp'
import { TOTAL, colorDe, nombreCategoria } from '@/lib/categorias'
import { aISO, hoy, ayer, fechaLarga, dinero } from '@/lib/fechas'
import { estadoPresupuesto } from '@/lib/presupuesto'

const router = useRouter()
const route = useRoute()
const { user } = useAuth()
const { accounts, expenses, budgets, pendingReview, getDisplayName } = useFinances()
const { lista, compartido, tienePareja, cargar, abrirClasificar, abrirNuevo, abrirMovimiento, nombreDe } = useApp()

const cargando = ref(true)
onMounted(async () => {
  await cargar()
  cargando.value = false
  // El atajo puede abrir .../finances?clasificar=1 para preguntarte de una
  if (route.query.clasificar) {
    router.replace({ query: {} })
    abrirClasificar()
  }
})

const nombre = computed(() => user.value ? getDisplayName(user.value.id).split(' ')[0] : '')
const inicial = computed(() => (nombre.value || '?').charAt(0).toUpperCase())

/* Lo de la lista activa (mío / compartido) */
const enLista = (e: { is_shared: boolean }) => e.is_shared === compartido.value
const inicioMes = computed(() => { const d = new Date(); return aISO(new Date(d.getFullYear(), d.getMonth(), 1)) })
const delMes = computed(() => expenses.value.filter(e => enLista(e) && e.date >= inicioMes.value))
const gastadoMes = computed(() => delMes.value.filter(e => (e.type || 'expense') === 'expense').reduce((s, e) => s + Number(e.amount), 0))
const ingresoMes = computed(() => delMes.value.filter(e => e.type === 'income').reduce((s, e) => s + Number(e.amount), 0))
const cuentasLista = computed(() => accounts.value.filter(a => a.is_shared === compartido.value))
const saldo = computed(() => cuentasLista.value.filter(a => a.tipo !== 'credito').reduce((s, a) => s + Number(a.balance), 0))
const deuda = computed(() => -cuentasLista.value.filter(a => a.tipo === 'credito').reduce((s, a) => s + Number(a.balance), 0))

/* Presupuestos visibles */
const misPresupuestos = computed(() => budgets.value.filter(b =>
  b.is_shared === compartido.value && (compartido.value || b.owner_id === user.value?.id)))
const estados = computed(() => misPresupuestos.value.map(b => estadoPresupuesto(b, expenses.value, new Date())))

/** Bloque azul: cuánto te queda este mes */
const heroe = computed(() => {
  const mensuales = estados.value.filter(e => e.budget.period === 'mensual')
  const total = mensuales.find(e => e.budget.category === TOTAL)
  if (total) return { restante: total.restante, de: Number(total.budget.amount), porDia: total.porUnidad }
  const cats = mensuales.filter(e => e.budget.category !== TOTAL)
  if (!cats.length) return null
  const de = cats.reduce((s, e) => s + Number(e.budget.amount), 0)
  const restante = de - cats.reduce((s, e) => s + e.gastado, 0)
  const ahora = new Date()
  const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1)
  const dias = Math.max(1, Math.ceil((finMes.getTime() - ahora.getTime()) / 86400000))
  return { restante, de, porDia: restante / dias }
})

/** Fichas: las 3 más apretadas (sin el Total) */
const fichas = computed(() => estados.value
  .filter(e => e.budget.category !== TOTAL)
  .sort((a, b) => b.porcentaje - a.porcentaje)
  .slice(0, 3))

/** Últimos movimientos de la lista */
const ultimos = computed(() => expenses.value.filter(enLista).slice(0, 5))
const etiquetaFecha = (d: string) => d === hoy() ? 'Hoy' : d === ayer() ? 'Ayer' : fechaLarga(d)
const detalle = (e: Expense) => [
  etiquetaFecha(e.date),
  e.needs_review ? 'toca para clasificar' : e.category,
  compartido.value && e.owner_id !== user.value?.id ? nombreDe(e.owner_id) : '',
].filter(Boolean).join(' · ')

/* Dictar un gasto: "gasté 12,50 en almuerzo" */
const escuchando = ref(false)
const dictar = () => {
  const w = window as any
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!SR) { alert('Este navegador no permite dictar.'); return }
  const r = new SR()
  r.lang = 'es-EC'
  r.interimResults = false
  escuchando.value = true
  r.onresult = (ev: any) => { interpretar(ev.results[0][0].transcript); escuchando.value = false }
  r.onerror = () => { escuchando.value = false }
  r.onend = () => { escuchando.value = false }
  r.start()
}
const interpretar = (texto: string) => {
  const m = texto.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:d[oó]lares?|\$)?/i)
  const amount = m?.[1] ? parseFloat(m[1].replace(',', '.')) : undefined
  const ingreso = /(?:me pagaron|recib[ií]|cobr[eé]|gan[eé]|ingreso|sueldo|salario)/i.test(texto)
  let desc = texto.replace(m?.[0] || '', '')
    .replace(/^(?:yo\s+)?(?:gast[eé]|pagu[eé]|compr[eé]|me pagaron|recib[ií]|cobr[eé]|gan[eé])\s*/i, '')
    .replace(/^(?:en|de|por|para)\s+/i, '').trim()
  if (!desc) desc = texto
  abrirNuevo({ description: desc.charAt(0).toUpperCase() + desc.slice(1), amount, type: ingreso ? 'income' : 'expense' })
}
</script>

<template>
  <main class="pagina">
    <header class="cabecera">
      <div>
        <p class="muted" style="margin: 0">Hola{{ nombre ? `, ${nombre}` : '' }}</p>
        <h1 class="titulo-pagina">Mis Finanzas</h1>
      </div>
      <div style="display: flex; gap: 8px">
        <button class="btn-icono" :class="{ amarillo: escuchando }" aria-label="Dictar un gasto" @click="dictar"><Icono nombre="mic" /></button>
        <RouterLink to="/ajustes" class="btn-icono avatar" aria-label="Ajustes">{{ inicial }}</RouterLink>
      </div>
    </header>

    <div v-if="tienePareja" class="seg" role="tablist" aria-label="Lista">
      <button role="tab" :aria-selected="lista === 'personal'" :class="{ on: lista === 'personal' }" @click="lista = 'personal'">Mío</button>
      <button role="tab" :aria-selected="lista === 'shared'" :class="{ on: lista === 'shared' }" @click="lista = 'shared'">Con mi pareja</button>
    </div>

    <!-- Bloque azul -->
    <section class="bloque azul sombra heroe" aria-live="polite">
      <template v-if="heroe">
        <span class="etiqueta">{{ compartido ? 'Les quedan este mes' : 'Te quedan este mes' }}</span>
        <span class="cifra grande" :class="{ pasado: heroe.restante < 0 }">{{ heroe.restante < 0 ? '−' : '' }}${{ dinero(heroe.restante) }}</span>
        <div class="pastillas">
          <span class="pastilla blanca">{{ heroe.restante >= 0 ? `$${dinero(heroe.porDia)} por día` : '¡Se acabó el presupuesto!' }}</span>
          <span class="pastilla">de ${{ dinero(heroe.de) }}</span>
          <span class="pastilla">Tienes ${{ dinero(saldo) }}</span>
          <span v-if="deuda > 0" class="pastilla">Debes ${{ dinero(deuda) }} en tarjetas</span>
        </div>
      </template>
      <template v-else>
        <span class="etiqueta">{{ compartido ? 'Gastaron este mes' : 'Gastaste este mes' }}</span>
        <span class="cifra grande">${{ dinero(gastadoMes) }}</span>
        <div class="pastillas">
          <span class="pastilla blanca">Entró ${{ dinero(ingresoMes) }}</span>
          <span class="pastilla">Tienes ${{ dinero(saldo) }}</span>
          <span v-if="deuda > 0" class="pastilla">Debes ${{ dinero(deuda) }} en tarjetas</span>
        </div>
      </template>
    </section>

    <!-- Por clasificar -->
    <button v-if="pendingReview.length" class="bloque amarillo pendientes" @click="abrirClasificar">
      <span class="cifra" style="font-size: 30px">{{ pendingReview.length }}</span>
      <span class="pend-texto">
        <strong>{{ pendingReview.length === 1 ? 'gasto por clasificar' : 'gastos por clasificar' }}</strong>
        <span>{{ pendingReview.slice(0, 3).map(e => e.description).join(' · ') }}</span>
      </span>
      <span class="btn negro" style="min-height: 38px; padding: 0 12px; font-size: 13px">Clasificar</span>
    </button>

    <!-- Fichas de presupuesto -->
    <h2 class="subtitulo">Presupuestos</h2>
    <div class="fichas">
      <RouterLink v-for="e in fichas" :key="e.budget.id" to="/presupuestos" class="bloque ficha"
        :style="{ background: e.restante < 0 ? 'var(--durazno)' : colorDe(e.budget.category) }">
        <span class="ficha-nombre"><Icono :nombre="e.budget.category" :tam="16" :grosor="2.4" />{{ nombreCategoria(e.budget.category) }}</span>
        <span class="cifra ficha-cifra" :class="{ rojo: e.restante < 0 }">{{ e.restante < 0 ? '−' : '' }}${{ dinero(e.restante) }}</span>
        <span class="ficha-pie" :class="{ rojo: e.restante < 0 }">{{ e.restante < 0 ? 'te pasaste' : `quedan de $${dinero(Number(e.budget.amount))}` }}{{ e.budget.period === 'anual' ? ' (año)' : '' }}</span>
        <div class="barra" :class="{ pasado: e.restante < 0 }"><div :style="{ width: Math.min(100, e.porcentaje * 100) + '%' }"></div></div>
      </RouterLink>
      <RouterLink to="/presupuestos" class="bloque punteado ficha ficha-ver">
        <Icono :nombre="fichas.length ? 'flecha' : 'mas'" :tam="24" :grosor="2.5" />
        <strong>{{ fichas.length ? 'Ver todos' : 'Crear presupuesto' }}</strong>
      </RouterLink>
    </div>

    <!-- Últimos movimientos -->
    <div class="cabecera" style="min-height: 0">
      <h2 class="subtitulo">Últimos movimientos</h2>
      <RouterLink to="/movimientos" style="font-weight: 700; font-size: 14px">Ver todos</RouterLink>
    </div>
    <div v-if="!cargando && !ultimos.length" class="bloque punteado vacio">
      <strong>Aún no hay movimientos</strong>
      <span class="muted">Toca el botón amarillo <b>+</b> o paga con Apple Pay si configuraste el atajo.</span>
    </div>
    <div v-else>
      <button v-for="e in ultimos" :key="e.id" class="mov" @click="abrirMovimiento(e)">
        <span class="icono-cat" :style="{ background: e.type === 'income' ? 'var(--menta)' : colorDe(e.needs_review ? 'Sin clasificar' : e.category) }">
          <Icono :nombre="e.type === 'income' ? 'ingreso' : e.needs_review ? 'Sin clasificar' : e.category" :tam="18" />
        </span>
        <span class="mov-info"><strong>{{ e.description }}</strong><span>{{ detalle(e) }}</span></span>
        <span class="mov-monto" :class="{ ingreso: e.type === 'income' }">{{ e.type === 'income' ? '+' : '−' }}${{ dinero(Number(e.amount)) }}</span>
      </button>
    </div>
  </main>
</template>

<style scoped>
.avatar { font-family: var(--titulo); font-weight: 700; font-size: 18px; text-decoration: none; border-radius: 50%; }
.heroe { display: flex; flex-direction: column; gap: 10px; padding: 18px; }
.etiqueta { font-size: 14px; font-weight: 600; }
.grande { font-size: 46px; line-height: 1; letter-spacing: -1.5px; }
.grande.pasado { color: var(--amarillo); }
.pastillas { display: flex; flex-wrap: wrap; gap: 8px; }
.pastilla { border-radius: 999px; padding: 6px 10px; font-size: 13px; font-weight: 600; background: rgba(255, 255, 255, 0.18); }
.pastilla.blanca { background: #fff; color: var(--tinta); }
.pendientes { display: flex; align-items: center; gap: 12px; text-align: left; cursor: pointer; width: 100%; font: inherit; color: inherit; }
.pend-texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pend-texto strong { font-size: 15px; }
.pend-texto span { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fichas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.ficha { display: flex; flex-direction: column; gap: 6px; text-decoration: none; color: var(--tinta); min-height: 132px; }
.ficha-nombre { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 700; }
.ficha-cifra { font-size: 28px; line-height: 1; }
.ficha-pie { font-size: 12px; font-weight: 500; }
.ficha .barra { margin-top: auto; height: 8px; }
.ficha-ver { align-items: center; justify-content: center; gap: 8px; }
</style>
