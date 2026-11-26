<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useFinances, type Budget } from '@/composables/useFinances'
import { CATEGORIAS, TOTAL, iconoDe } from '@/lib/categorias'
import { nombreMes, dinero } from '@/lib/fechas'
import { estadoPresupuesto, rangoPeriodo, gastoCuenta, type Periodo } from '@/lib/presupuesto'

const router = useRouter()
const { user, waitForAuth } = useAuth()
const { expenses, budgets, partner, loadExpenses, loadBudgets, loadPartner, saveBudget, removeBudget } = useFinances()

const leer = (k: string, def: string) => { try { return localStorage.getItem(k) || def } catch { return def } }
const guardarLS = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sin storage */ } }

const periodo = ref<Periodo>(leer('fin_periodoPresupuesto', 'mensual') as Periodo)
const lista = ref<'personal' | 'shared'>(leer('fin_listFilter', 'personal') as any)
watch(periodo, v => guardarLS('fin_periodoPresupuesto', v))
watch(lista, v => guardarLS('fin_listFilter', v))

/* Navegación de periodo */
const ref_ = ref(new Date())
const mover = (paso: number) => {
  const d = new Date(ref_.value)
  if (periodo.value === 'mensual') d.setMonth(d.getMonth() + paso, 1)
  else d.setFullYear(d.getFullYear() + paso, 0, 1)
  ref_.value = d
}
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
const compartido = computed(() => lista.value === 'shared')
const delModo = computed(() => budgets.value.filter(b =>
  b.period === periodo.value && b.is_shared === compartido.value &&
  (compartido.value || b.owner_id === user.value?.id)))

const estados = computed(() => delModo.value
  .map(b => estadoPresupuesto(b, expenses.value, ref_.value))
  .sort((a, b) => (a.budget.category === TOTAL ? -1 : b.budget.category === TOTAL ? 1 : b.porcentaje - a.porcentaje)))

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
  // categorías que ya tienen presupuesto (mensual o anual) no se listan aquí
  const conPresupuesto = new Set(budgets.value
    .filter(b => b.is_shared === compartido.value && (compartido.value || b.owner_id === user.value?.id))
    .map(b => b.category))
  const molde: Budget = { id: '', owner_id: user.value?.id ?? '', is_shared: compartido.value,
    category: TOTAL, period: periodo.value, amount: 0 }
  const suma: Record<string, number> = {}
  for (const e of expenses.value) {
    if (e.date < inicio || e.date >= fin || !gastoCuenta(molde, e) || conPresupuesto.has(e.category)) continue
    suma[e.category] = (suma[e.category] ?? 0) + Number(e.amount)
  }
  return Object.entries(suma).sort((a, b) => b[1] - a[1])
})

const pendientes = computed(() => expenses.value.filter(e => e.needs_review).length)

/* Formulario */
const form = ref<{ abierto: boolean; id: string | null; categoria: string; monto: number | null; periodo: Periodo }>(
  { abierto: false, id: null, categoria: '', monto: null, periodo: 'mensual' })
const error = ref('')

const abrirNuevo = (categoria = '') => {
  form.value = { abierto: true, id: null, categoria, monto: null, periodo: periodo.value }
  error.value = ''
}
const abrirEditar = (b: Budget) => {
  form.value = { abierto: true, id: b.id, categoria: b.category, monto: Number(b.amount), periodo: b.period }
  error.value = ''
}
const equivalente = computed(() => {
  const m = form.value.monto
  if (!m) return ''
  return form.value.periodo === 'anual' ? `≈ $${dinero(m / 12)} al mes` : `≈ $${dinero(m * 12)} al año`
})

/** Si es nuevo y ya existe uno igual, se reemplaza (upsert); si cambiaste categoría/periodo de uno existente, se borra el viejo */
const guardar = async () => {
  error.value = ''
  if (!user.value) return
  if (!form.value.categoria) { error.value = 'Elige una categoría'; return }
  if (!form.value.monto || form.value.monto <= 0) { error.value = 'Pon un monto mayor a 0'; return }
  try {
    const anterior = form.value.id ? budgets.value.find(b => b.id === form.value.id) : null
    const guardado = await saveBudget(user.value.id, {
      category: form.value.categoria, period: form.value.periodo,
      amount: form.value.monto, is_shared: compartido.value,
    })
    if (anterior && anterior.id !== guardado.id) await removeBudget(anterior.id)
    periodo.value = form.value.periodo
    form.value.abierto = false
  } catch (e: any) { error.value = e.message ?? 'No se pudo guardar' }
}
const borrar = async () => {
  if (!form.value.id || !confirm('¿Borrar este presupuesto?')) return
  await removeBudget(form.value.id)
  form.value.abierto = false
}

onMounted(async () => {
  await waitForAuth()
  if (!user.value) return
  await loadPartner(user.value.id)
  await Promise.all([loadExpenses(), loadBudgets()])
})
</script>

<template>
  <div class="page">
    <header class="top">
      <button class="icon-btn" @click="router.push('/finances')" aria-label="Volver">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      <h1>Presupuestos</h1>
      <button class="add-btn" @click="abrirNuevo()" aria-label="Nuevo presupuesto">+</button>
    </header>

    <div class="seg">
      <button :class="{ on: periodo === 'mensual' }" @click="periodo = 'mensual'; ref_ = new Date()">Mensual</button>
      <button :class="{ on: periodo === 'anual' }" @click="periodo = 'anual'; ref_ = new Date()">Anual</button>
    </div>

    <div class="nav">
      <button @click="mover(-1)" aria-label="Anterior">‹</button>
      <span>{{ etiquetaPeriodo }}<small v-if="!esActual" class="volver" @click="ref_ = new Date()"> · ir a hoy</small></span>
      <button @click="mover(1)" aria-label="Siguiente">›</button>
    </div>

    <div v-if="partner?.status === 'active'" class="lista-toggle">
      <button :class="{ on: lista === 'personal' }" @click="lista = 'personal'">Mío</button>
      <button :class="{ on: lista === 'shared' }" @click="lista = 'shared'">Compartido</button>
    </div>

    <button v-if="pendientes" class="aviso" @click="router.push({ path: '/finances', query: { clasificar: '1' } })">
      Tienes {{ pendientes }} gasto{{ pendientes > 1 ? 's' : '' }} sin clasificar: no cuentan en los presupuestos hasta que los clasifiques →
    </button>

    <!-- Presupuesto Total -->
    <div v-if="total" class="card total" :class="total.nivel" @click="abrirEditar(total.budget)">
      <div class="card-head">
        <span>💰 Gasto total</span>
        <span class="cifra">${{ dinero(total.gastado) }} <small>/ ${{ dinero(total.budget.amount) }}</small></span>
      </div>
      <div class="barra">
        <div class="lleno" :style="{ width: Math.min(100, total.porcentaje * 100) + '%' }"></div>
        <div v-if="esActual" class="ritmo" :style="{ left: Math.min(100, total.esperado / total.budget.amount * 100) + '%' }"></div>
      </div>
      <div class="pie">
        <template v-if="total.restante >= 0">Quedan ${{ dinero(total.restante) }}<template v-if="esActual"> · ${{ dinero(total.porUnidad) }} por {{ total.unidad }}</template></template>
        <template v-else>Te pasaste ${{ dinero(-total.restante) }}</template>
      </div>
    </div>

    <!-- Resumen de categorías -->
    <div v-if="porCategoria.length" class="resumen">
      <div><small>Presupuestado</small><strong>${{ dinero(resumen.presupuestado) }}</strong></div>
      <div><small>Gastado</small><strong>${{ dinero(resumen.gastado) }}</strong></div>
      <div><small>{{ resumen.restante >= 0 ? 'Queda' : 'Pasado' }}</small><strong :class="{ neg: resumen.restante < 0 }">${{ dinero(resumen.restante) }}</strong></div>
    </div>

    <div v-for="e in porCategoria" :key="e.budget.id" class="card" :class="e.nivel" @click="abrirEditar(e.budget)">
      <div class="card-head">
        <span>{{ iconoDe(e.budget.category) }} {{ e.budget.category }}</span>
        <span class="cifra">${{ dinero(e.gastado) }} <small>/ ${{ dinero(e.budget.amount) }}</small></span>
      </div>
      <div class="barra">
        <div class="lleno" :style="{ width: Math.min(100, e.porcentaje * 100) + '%' }"></div>
        <div v-if="esActual" class="ritmo" :style="{ left: Math.min(100, e.esperado / e.budget.amount * 100) + '%' }"></div>
      </div>
      <div class="pie">
        <template v-if="e.restante >= 0">
          Quedan ${{ dinero(e.restante) }}<template v-if="esActual"> · ${{ dinero(e.porUnidad) }} por {{ e.unidad }}</template>
        </template>
        <template v-else>Te pasaste ${{ dinero(-e.restante) }}</template>
      </div>
    </div>

    <div v-if="!estados.length" class="vacio">
      <p>No tienes presupuestos {{ periodo === 'anual' ? 'anuales' : 'mensuales' }} todavía.</p>
      <p class="muted">
        {{ periodo === 'anual'
          ? 'Úsalo para gastos grandes o irregulares: ropa, viajes, regalos, seguro, matrícula.'
          : 'Úsalo para lo del día a día: comida, transporte, salidas, suscripciones.' }}
      </p>
      <button class="primary-btn" @click="abrirNuevo()">Crear presupuesto {{ periodo }}</button>
    </div>

    <!-- Gasto sin presupuesto -->
    <div v-if="sinPresupuesto.length" class="sin">
      <h3>Gastado sin presupuesto {{ periodo === 'anual' ? 'este año' : 'este mes' }}</h3>
      <div v-for="[cat, monto] in sinPresupuesto" :key="cat" class="sin-item">
        <span>{{ iconoDe(cat) }} {{ cat }}</span>
        <span>${{ dinero(monto) }}</span>
        <button v-if="cat !== 'Sin clasificar'" @click="abrirNuevo(cat)">+ presupuesto</button>
      </div>
    </div>

    <p class="nota muted">
      La línea blanca marca cuánto “deberías” llevar gastado a esta altura del {{ periodo === 'anual' ? 'año' : 'mes' }}.
      Si una categoría tiene presupuesto mensual y anual, el gasto cuenta en los dos.
    </p>

    <!-- Formulario -->
    <div v-if="form.abierto" class="modal-overlay" @click.self="form.abierto = false">
      <form class="modal-sheet" @submit.prevent="guardar">
        <div class="sheet-handle"></div>
        <h2>{{ form.id ? 'Editar presupuesto' : 'Nuevo presupuesto' }}</h2>

        <div class="seg">
          <button type="button" :class="{ on: form.periodo === 'mensual' }" @click="form.periodo = 'mensual'">Mensual</button>
          <button type="button" :class="{ on: form.periodo === 'anual' }" @click="form.periodo = 'anual'">Anual</button>
        </div>

        <div class="pregunta">¿Para qué?</div>
        <div class="chips">
          <button type="button" class="chip" :class="{ on: form.categoria === TOTAL }" @click="form.categoria = TOTAL">💰 Todo el gasto</button>
          <button v-for="c in CATEGORIAS" :key="c.nombre" type="button" class="chip"
            :class="{ on: form.categoria === c.nombre }" @click="form.categoria = c.nombre">
            {{ c.icono }} {{ c.nombre }}
          </button>
        </div>

        <label>
          Monto {{ form.periodo === 'anual' ? 'para todo el año' : 'por mes' }} ($)
          <input v-model.number="form.monto" type="number" step="0.01" min="1" inputmode="decimal" placeholder="0,00" />
          <small v-if="equivalente" class="muted">{{ equivalente }}</small>
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <div class="form-actions">
          <button v-if="form.id" type="button" class="borrar" @click="borrar">Borrar</button>
          <button v-else type="button" @click="form.abierto = false">Cancelar</button>
          <button type="submit" class="primary">Guardar</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 20px 16px 60px; min-height: 100vh; }
.top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.top h1 { margin: 0; font-size: 1.3rem; color: #f0f0f0; }
.icon-btn { background: none; border: none; color: #8a8a9a; cursor: pointer; padding: 8px; display: flex; }
.add-btn {
  width: 40px; height: 40px; border-radius: 50%; border: none; font-size: 1.4rem; cursor: pointer;
  background: linear-gradient(135deg, #3a0ca3, #6c63ff); color: white;
}
.seg, .lista-toggle { display: flex; background: #16213e; border-radius: 12px; padding: 3px; margin-bottom: 12px; }
.seg button, .lista-toggle button {
  flex: 1; padding: 9px; border: none; background: transparent; border-radius: 10px;
  color: #6a6a8a; font-size: 0.92rem; cursor: pointer;
}
.seg button.on, .lista-toggle button.on { background: #6c63ff; color: white; }
.lista-toggle button.on { background: #2a2a4a; }
.nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; color: #e0e0e0; text-transform: capitalize; }
.nav button { background: #16213e; border: none; color: #c0c0d0; width: 36px; height: 36px; border-radius: 50%; font-size: 1.3rem; cursor: pointer; }
.volver { color: #6c63ff; cursor: pointer; text-transform: none; }
.aviso {
  display: block; width: 100%; text-align: left; background: rgba(255, 179, 71, 0.12); color: #ffb347;
  border: 1px solid rgba(255, 179, 71, 0.35); border-radius: 12px; padding: 10px 12px; margin-bottom: 14px;
  font-size: 0.85rem; cursor: pointer;
}
.resumen { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.resumen div { background: #16213e; border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 2px; }
.resumen small { color: #6a6a8a; font-size: 0.75rem; }
.resumen strong { color: #f0f0f0; font-size: 0.98rem; }
.resumen .neg { color: #ff6b6b; }
.card { background: #16213e; border-radius: 14px; padding: 12px 14px; margin-bottom: 8px; cursor: pointer; }
.card.total { border: 1px solid #2a2a4a; margin-bottom: 14px; }
.card-head { display: flex; justify-content: space-between; gap: 8px; color: #e0e0e0; font-size: 0.95rem; }
.cifra { font-weight: 600; white-space: nowrap; }
.cifra small { color: #6a6a8a; font-weight: 400; }
.barra { position: relative; height: 8px; background: #2a2a4a; border-radius: 4px; margin: 10px 0 8px; overflow: visible; }
.lleno { height: 100%; border-radius: 4px; background: #4ecdc4; transition: width 0.3s; }
.alerta .lleno { background: #ffb347; }
.pasado .lleno { background: #ff6b6b; }
.ritmo { position: absolute; top: -3px; width: 2px; height: 14px; background: #f0f0f0; border-radius: 1px; opacity: 0.7; }
.pie { font-size: 0.82rem; color: #8a8a9a; }
.pasado .pie { color: #ff6b6b; }
.vacio { text-align: center; padding: 24px 8px; color: #c0c0d0; }
.muted { color: #6a6a8a; font-size: 0.85rem; }
.primary-btn {
  margin-top: 8px; padding: 12px 18px; border: none; border-radius: 12px; cursor: pointer;
  background: linear-gradient(135deg, #3a0ca3, #6c63ff); color: white; font-size: 0.95rem;
}
.sin { margin-top: 18px; }
.sin h3 { font-size: 0.9rem; color: #8a8a9a; font-weight: 500; margin: 0 0 8px; }
.sin-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #22223a; color: #c0c0d0; font-size: 0.9rem; }
.sin-item span:first-child { flex: 1; }
.sin-item button { background: none; border: 1px solid #2a2a4a; color: #6c63ff; border-radius: 8px; padding: 4px 8px; font-size: 0.8rem; cursor: pointer; }
.nota { margin-top: 18px; line-height: 1.4; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); display: flex; align-items: flex-end; justify-content: center; z-index: 100; }
.modal-sheet {
  background: #16213e; border-radius: 24px 24px 0 0; padding: 20px 20px calc(24px + env(safe-area-inset-bottom));
  width: 100%; max-width: 500px; max-height: 92vh; overflow-y: auto;
}
.modal-sheet .seg { background: #1a1a2e; }
.sheet-handle { width: 36px; height: 4px; background: #2a2a4a; border-radius: 2px; margin: 0 auto 16px; }
.modal-sheet h2 { color: #e0e0e0; margin: 0 0 14px; font-size: 1.2rem; }
.pregunta { color: #e0e0e0; font-weight: 600; font-size: 0.95rem; margin: 4px 0 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.chip { padding: 8px 12px; border-radius: 999px; border: 1px solid #2a2a4a; background: #1a1a2e; color: #c0c0d0; font-size: 0.88rem; cursor: pointer; }
.chip.on { background: #6c63ff; border-color: #6c63ff; color: white; }
label { display: block; margin-bottom: 12px; font-size: 0.85rem; color: #8a8a9a; }
input { display: block; width: 100%; padding: 10px 12px; background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 10px; color: #e0e0e0; font-size: 16px; margin: 4px 0; box-sizing: border-box; }
input:focus { outline: none; border-color: #6c63ff; }
.error { color: #ff6b6b; font-size: 0.85rem; }
.form-actions { display: flex; gap: 12px; margin-top: 16px; }
.form-actions button { flex: 1; padding: 12px; border-radius: 12px; border: 1px solid #2a2a4a; background: #1a1a2e; color: #e0e0e0; font-size: 0.95rem; cursor: pointer; }
.form-actions .primary { background: linear-gradient(135deg, #3a0ca3, #6c63ff); color: white; border: none; }
.form-actions .borrar { color: #ff6b6b; }
</style>
