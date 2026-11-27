<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icono from '@/components/Icono.vue'
import VincularPareja from '@/components/VincularPareja.vue'
import { useAuth } from '@/composables/useAuth'
import { useFinances, type Budget } from '@/composables/useFinances'
import { useApp } from '@/composables/useApp'
import { CATEGORIAS, TOTAL, colorDe, nombreCategoria } from '@/lib/categorias'
import { nombreMes, dinero } from '@/lib/fechas'
import { estadoPresupuesto, rangoPeriodo, gastoCuenta, type Periodo } from '@/lib/presupuesto'

const router = useRouter()
const { user } = useAuth()
const { expenses, budgets, saveBudget, removeBudget } = useFinances()
const { lista, compartido, parejaId, tienePareja, cargar, nombreDe } = useApp()

onMounted(() => cargar())

/** Eligió "Con mi pareja" pero todavía no se vinculan */
const pidePareja = computed(() => lista.value === 'shared' && !tienePareja.value)

const leer = (k: string, def: string) => { try { return localStorage.getItem(k) || def } catch { return def } }
const periodo = ref<Periodo>(leer('fin_periodoPresupuesto', 'mensual') as Periodo)
watch(periodo, v => { try { localStorage.setItem('fin_periodoPresupuesto', v) } catch { /* sin storage */ } })

/* Navegación de periodo */
const ref_ = ref(new Date())
const mover = (paso: number) => {
  const d = new Date(ref_.value)
  if (periodo.value === 'mensual') d.setMonth(d.getMonth() + paso, 1)
  else d.setFullYear(d.getFullYear() + paso, 0, 1)
  ref_.value = d
}
const cambiarPeriodo = (p: Periodo) => { periodo.value = p; ref_.value = new Date() }
const esActual = computed(() => {
  const a = new Date()
  return periodo.value === 'anual'
    ? a.getFullYear() === ref_.value.getFullYear()
    : a.getFullYear() === ref_.value.getFullYear() && a.getMonth() === ref_.value.getMonth()
})
const etiquetaPeriodo = computed(() => periodo.value === 'anual'
  ? String(ref_.value.getFullYear())
  : `${nombreMes(ref_.value.getMonth())} ${ref_.value.getFullYear()}`)

/* Presupuestos visibles */
const delModo = computed(() => budgets.value.filter(b =>
  b.period === periodo.value && b.is_shared === compartido.value &&
  (compartido.value || b.owner_id === user.value?.id)))

const estados = computed(() => delModo.value
  .map(b => estadoPresupuesto(b, expenses.value, ref_.value))
  .sort((a, b) => b.porcentaje - a.porcentaje))

const total = computed(() => estados.value.find(e => e.budget.category === TOTAL) ?? null)
const porCategoria = computed(() => estados.value.filter(e => e.budget.category !== TOTAL))

const resumen = computed(() => {
  const presupuestado = porCategoria.value.reduce((s, e) => s + Number(e.budget.amount), 0)
  const gastado = porCategoria.value.reduce((s, e) => s + e.gastado, 0)
  return { presupuestado, gastado, restante: presupuestado - gastado }
})

/* Gasto del periodo en categorías sin presupuesto */
const sinPresupuesto = computed(() => {
  const { inicio, fin } = rangoPeriodo(periodo.value, ref_.value)
  const conPresupuesto = new Set(budgets.value
    .filter(b => b.is_shared === compartido.value && (compartido.value || b.owner_id === user.value?.id))
    .map(b => b.category))
  const molde: Budget = { id: '', owner_id: user.value?.id ?? '', is_shared: compartido.value,
    category: TOTAL, period: periodo.value, amount: 0, aportes: {} }
  const suma: Record<string, number> = {}
  for (const e of expenses.value) {
    if (e.date < inicio || e.date >= fin || !gastoCuenta(molde, e) || conPresupuesto.has(e.category)) continue
    suma[e.category] = (suma[e.category] ?? 0) + Number(e.amount)
  }
  return Object.entries(suma).sort((a, b) => b[1] - a[1])
})

const pendientes = computed(() => expenses.value.filter(e => e.needs_review).length)

/* Formulario */
const form = ref<{ abierto: boolean; id: string | null; categoria: string; monto: number | null; periodo: Periodo
  miParte: number | null; suParte: number | null }>(
  { abierto: false, id: null, categoria: '', monto: null, periodo: 'mensual', miParte: null, suParte: null })
const totalForm = computed(() => compartido.value
  ? Number(form.value.miParte || 0) + Number(form.value.suParte || 0)
  : Number(form.value.monto || 0))
const error = ref('')

const abrirNuevo = (categoria = '') => {
  form.value = { abierto: true, id: null, categoria, monto: null, periodo: periodo.value, miParte: null, suParte: null }
  error.value = ''
}
const abrirEditar = (b: Budget) => {
  const yo = user.value?.id ?? ''
  const ella = parejaId.value ?? ''
  const tieneAportes = Object.keys(b.aportes ?? {}).length > 0
  form.value = {
    abierto: true, id: b.id, categoria: b.category, monto: Number(b.amount), periodo: b.period,
    // si un compartido viejo no tiene aportes, se reparte a la mitad
    miParte: tieneAportes ? Number(b.aportes[yo] ?? 0) : Number(b.amount) / 2,
    suParte: tieneAportes ? Number(b.aportes[ella] ?? 0) : Number(b.amount) / 2,
  }
  error.value = ''
}
const equivalente = computed(() => {
  const m = totalForm.value
  if (!m) return ''
  return form.value.periodo === 'anual' ? `≈ $${dinero(m / 12)} al mes` : `≈ $${dinero(m * 12)} al año`
})

const guardar = async () => {
  error.value = ''
  if (!user.value) return
  if (!form.value.categoria) { error.value = 'Elige para qué es'; return }
  if (totalForm.value <= 0) { error.value = 'Pon un monto mayor a 0'; return }
  const aportes: Record<string, number> = compartido.value && parejaId.value
    ? { [user.value.id]: Number(form.value.miParte || 0), [parejaId.value]: Number(form.value.suParte || 0) }
    : {}
  try {
    await saveBudget(user.value.id, {
      category: form.value.categoria, period: form.value.periodo,
      amount: totalForm.value, is_shared: compartido.value, aportes,
    }, form.value.id)
    periodo.value = form.value.periodo
    form.value.abierto = false
  } catch (e: any) { error.value = e.message ?? 'No se pudo guardar' }
}
const borrar = async () => {
  if (!form.value.id || !confirm('¿Borrar este presupuesto?')) return
  await removeBudget(form.value.id)
  form.value.abierto = false
}
</script>

<template>
  <main class="pagina">
    <header class="cabecera">
      <h1 class="titulo-pagina">Presupuestos</h1>
      <button v-if="!pidePareja" class="btn-icono amarillo" aria-label="Nuevo presupuesto" @click="abrirNuevo()"><Icono nombre="mas" :grosor="2.8" /></button>
    </header>

    <div class="seg">
      <button :class="{ on: lista === 'personal' }" @click="lista = 'personal'">Mío</button>
      <button :class="{ on: lista === 'shared' }" @click="lista = 'shared'">Con mi pareja</button>
    </div>

    <section v-if="pidePareja" class="bloque seccion-pareja" style="background: var(--lila)">
      <h2 class="subtitulo" style="margin: 0">Presupuesto en pareja</h2>
      <p style="margin: 0">Primero vincúlense: uno genera un código y el otro lo pone en su app (los dos entran con su cuenta de Google). Después arman juntos presupuestos como "Salidas: $100 cada uno" y ven cuánto lleva gastado cada quien.</p>
      <VincularPareja />
    </section>

    <template v-else>
    <div class="seg">
      <button :class="{ on: periodo === 'mensual' }" @click="cambiarPeriodo('mensual')">Mes</button>
      <button :class="{ on: periodo === 'anual' }" @click="cambiarPeriodo('anual')">Año</button>
    </div>

    <div class="navegador">
      <button class="btn-icono" aria-label="Anterior" @click="mover(-1)"><Icono nombre="atras" /></button>
      <span class="cifra" style="font-size: 18px; text-transform: capitalize">{{ etiquetaPeriodo }}</span>
      <button class="btn-icono" aria-label="Siguiente" @click="mover(1)"><Icono nombre="adelante" /></button>
    </div>
    <button v-if="!esActual" class="btn" style="min-height: 40px" @click="ref_ = new Date()">Volver a hoy</button>

    <button v-if="pendientes" class="bloque amarillo aviso" @click="router.push({ path: '/finances', query: { clasificar: '1' } })">
      <strong>{{ pendientes }} sin clasificar</strong> no cuentan aquí hasta que les pongas categoría →
    </button>

    <!-- Todo el gasto -->
    <button v-if="total" class="bloque azul sombra fila-total" @click="abrirEditar(total.budget)">
      <span class="fila-texto">
        <span style="font-weight: 700"><Icono nombre="Total" :tam="16" :grosor="2.4" /> Todo el gasto</span>
        <span class="barra" style="background: rgba(255,255,255,.3)"><div :style="{ width: Math.min(100, total.porcentaje * 100) + '%', background: '#fff' }"></div></span>
        <span style="font-size: 13px">${{ dinero(total.gastado) }} de ${{ dinero(total.budget.amount) }}<template v-if="esActual && total.restante >= 0"> · ${{ dinero(total.porUnidad) }} por {{ total.unidad }}</template></span>
      </span>
      <span class="cifra monto" :style="total.restante < 0 ? 'color: var(--amarillo)' : ''">{{ total.restante < 0 ? '−' : '' }}${{ dinero(total.restante) }}</span>
    </button>

    <div v-if="porCategoria.length" class="resumen">
      <div class="bloque"><span class="muted">Presupuesto</span><span class="cifra">${{ dinero(resumen.presupuestado) }}</span></div>
      <div class="bloque"><span class="muted">Gastado</span><span class="cifra">${{ dinero(resumen.gastado) }}</span></div>
      <div class="bloque" :style="{ background: resumen.restante < 0 ? 'var(--durazno)' : 'var(--lima)' }">
        <span class="muted" style="color: var(--tinta)">{{ resumen.restante >= 0 ? 'Queda' : 'Pasado' }}</span>
        <span class="cifra" :class="{ rojo: resumen.restante < 0 }">${{ dinero(resumen.restante) }}</span>
      </div>
    </div>

    <!-- Por categoría -->
    <button v-for="e in porCategoria" :key="e.budget.id" class="bloque fila-cat" :class="{ sombra: e.budget.is_shared }"
      :style="{ background: e.restante < 0 ? 'var(--durazno)' : colorDe(e.budget.category) }" @click="abrirEditar(e.budget)">
      <span class="fila-arriba">
        <span class="fila-texto">
          <span style="font-weight: 700; display: flex; align-items: center; gap: 6px"><Icono :nombre="e.budget.category" :tam="16" :grosor="2.4" />{{ e.budget.category }}</span>
          <span class="barra" :class="{ pasado: e.restante < 0 }"><div :style="{ width: Math.min(100, e.porcentaje * 100) + '%' }"></div></span>
          <span style="font-size: 13px; font-weight: 500" :class="{ rojo: e.restante < 0 }">
            ${{ dinero(e.gastado) }} de ${{ dinero(e.budget.amount) }}<template v-if="e.restante < 0"> · {{ compartido ? 'se pasaron' : 'te pasaste' }}</template><template v-else-if="esActual"> · ${{ dinero(e.porUnidad) }} por {{ e.unidad }}</template>
          </span>
        </span>
        <span class="cifra monto" :class="{ rojo: e.restante < 0 }">{{ e.restante < 0 ? '−' : '' }}${{ dinero(e.restante) }}</span>
      </span>
      <span v-if="e.porPersona.length" class="personas">
        <span v-for="p in e.porPersona" :key="p.userId" class="persona">
          <strong style="font-size: 13px">{{ nombreDe(p.userId) }}</strong>
          <span style="font-size: 13px" :class="{ rojo: p.aporte > 0 && p.gastado > p.aporte }">${{ dinero(p.gastado) }}<template v-if="p.aporte"> de ${{ dinero(p.aporte) }}</template></span>
          <span class="barra" :class="{ pasado: p.aporte > 0 && p.gastado > p.aporte }" style="height: 6px"><div :style="{ width: (p.aporte ? Math.min(100, p.gastado / p.aporte * 100) : 0) + '%' }"></div></span>
        </span>
      </span>
    </button>

    <div v-if="!estados.length" class="bloque punteado vacio">
      <strong>No {{ compartido ? 'tienen' : 'tienes' }} presupuestos {{ compartido ? 'compartidos ' : '' }}{{ periodo === 'anual' ? 'anuales' : 'mensuales' }}</strong>
      <span class="muted">{{ compartido
        ? 'Ej: Salidas $100 cada uno = $200 al mes entre los dos. Cuentan los gastos marcados como compartidos.'
        : periodo === 'anual'
          ? 'Para gastos grandes o irregulares: ropa, viajes, regalos, seguro, matrícula.'
          : 'Para el día a día: comida, transporte, salidas, suscripciones.' }}</span>
      <button class="btn primario" @click="abrirNuevo()">Crear presupuesto</button>
    </div>

    <section v-if="sinPresupuesto.length">
      <h2 class="subtitulo">Gastado sin presupuesto</h2>
      <div v-for="[cat, monto] in sinPresupuesto" :key="cat" class="mov" style="cursor: default">
        <span class="icono-cat" :style="{ background: colorDe(cat) }"><Icono :nombre="cat" :tam="18" /></span>
        <span class="mov-info"><strong>{{ cat }}</strong><span>${{ dinero(monto) }} {{ periodo === 'anual' ? 'este año' : 'este mes' }}</span></span>
        <button v-if="cat !== 'Sin clasificar'" class="btn" style="min-height: 38px; font-size: 13px; padding: 0 12px" @click="abrirNuevo(cat)">+ Presupuesto</button>
      </div>
    </section>

    </template>

    <!-- Formulario -->
    <div v-if="form.abierto" class="velo" @click.self="form.abierto = false">
      <form class="hoja" @submit.prevent="guardar">
        <div class="agarre"></div>
        <div class="cabecera">
          <h2 class="titulo-pagina" style="font-size: 24px">{{ form.id ? 'Editar' : 'Nuevo' }} presupuesto{{ compartido ? ' compartido' : '' }}</h2>
          <button type="button" class="btn-icono" aria-label="Cerrar" @click="form.abierto = false"><Icono nombre="cerrar" /></button>
        </div>

        <div class="seg">
          <button type="button" :class="{ on: form.periodo === 'mensual' }" @click="form.periodo = 'mensual'">Cada mes</button>
          <button type="button" :class="{ on: form.periodo === 'anual' }" @click="form.periodo = 'anual'">Todo el año</button>
        </div>

        <div>
          <p class="subtitulo" style="margin-bottom: 10px">¿Para qué?</p>
          <div class="chips">
            <button type="button" class="chip" :class="{ on: form.categoria === TOTAL }" @click="form.categoria = TOTAL">
              <Icono nombre="Total" :tam="16" /> {{ nombreCategoria(TOTAL) }}
            </button>
            <button v-for="c in CATEGORIAS" :key="c.nombre" type="button" class="chip" :class="{ on: form.categoria === c.nombre }" @click="form.categoria = c.nombre">
              <Icono :nombre="c.nombre" :tam="16" /> {{ c.nombre }}
            </button>
          </div>
        </div>

        <template v-if="compartido && parejaId">
          <p class="subtitulo" style="margin: 0">¿Cuánto pone cada uno {{ form.periodo === 'anual' ? 'al año' : 'al mes' }}?</p>
          <div class="fila">
            <label class="campo">Tu parte ($)<input v-model.number="form.miParte" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0,00" /></label>
            <label class="campo">Parte de {{ nombreDe(parejaId) }} ($)<input v-model.number="form.suParte" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0,00" /></label>
          </div>
          <div class="bloque" style="background: var(--lila)">
            Presupuesto compartido: <span class="cifra">${{ dinero(totalForm) }}</span> <span class="muted" style="color: var(--tinta)">{{ equivalente }}</span>
          </div>
        </template>
        <label v-else class="campo">
          Monto {{ form.periodo === 'anual' ? 'para todo el año' : 'por mes' }} ($)
          <input v-model.number="form.monto" type="number" step="0.01" min="1" inputmode="decimal" placeholder="0,00" />
          <span class="muted" style="font-weight: 500">{{ equivalente }}</span>
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <div class="acciones">
          <button v-if="form.id" type="button" class="btn peligro" @click="borrar">Borrar</button>
          <button v-else type="button" class="btn" @click="form.abierto = false">Cancelar</button>
          <button type="submit" class="btn primario">Guardar</button>
        </div>
      </form>
    </div>
  </main>
</template>

<style scoped>
.seccion-pareja { display: flex; flex-direction: column; gap: 12px; }
.navegador { display: flex; align-items: center; justify-content: space-between; }
.aviso { text-align: left; font: inherit; font-size: 14px; cursor: pointer; color: var(--tinta); }
.fila-total, .fila-cat { display: flex; flex-direction: column; gap: 10px; text-align: left; font: inherit; cursor: pointer; width: 100%; color: inherit; }
.fila-total { flex-direction: row; align-items: center; gap: 14px; color: #fff; }
.fila-arriba { display: flex; align-items: center; gap: 14px; }
.fila-texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.monto { font-size: 26px; white-space: nowrap; }
.resumen { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.resumen .bloque { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; }
.resumen .cifra { font-size: 17px; }
.personas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.persona { background: #fff; border: var(--borde); border-radius: 12px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
</style>
