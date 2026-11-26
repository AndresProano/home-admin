<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Expense, NewExpense, BankAccount, Budget } from '@/composables/useFinances'
import { CATEGORIAS, SIN_CLASIFICAR } from '@/lib/categorias'
import { hoy, ayer, fechaLarga, dinero } from '@/lib/fechas'
import { estadoPresupuesto, presupuestoDeGasto } from '@/lib/presupuesto'

/**
 * Una sola hoja para tres usos:
 *  - 'clasificar': un gasto que llegó del atajo sin categoría → "¿En qué gastaste? ¿Cuándo?"
 *  - 'editar': cambiar un movimiento existente
 *  - 'nuevo': registrar a mano
 */
const props = defineProps<{
  modo: 'clasificar' | 'editar' | 'nuevo'
  movimiento?: Expense | null
  pendientesRestantes?: number
  cuentas: BankAccount[]
  presupuestos: Budget[]
  gastos: Expense[]
  userId: string
  compartido: boolean
  tienePareja?: boolean
  prellenado?: Partial<NewExpense>
}>()

const emit = defineEmits<{
  (e: 'guardar', datos: NewExpense & { needs_review: boolean }): void
  (e: 'saltar'): void
  (e: 'borrar'): void
  (e: 'cerrar'): void
}>()

const tipo = ref<'expense' | 'income'>('expense')
const descripcion = ref('')
const monto = ref<number | null>(null)
const categoria = ref<string>('')
const fecha = ref(hoy())
const cuenta = ref<string | null>(null)
const metodo = ref('card')
const otraFecha = ref(false)
const esCompartido = ref(false)
const error = ref('')

const cargar = () => {
  const m = props.movimiento
  const p = props.prellenado ?? {}
  tipo.value = (m?.type as any) || (p.type as any) || 'expense'
  descripcion.value = m?.description ?? p.description ?? ''
  monto.value = m ? Number(m.amount) : (p.amount ?? null)
  categoria.value = m && m.category !== SIN_CLASIFICAR ? m.category : (p.category ?? '')
  fecha.value = m?.date ?? p.date ?? hoy()
  cuenta.value = m?.account_id ?? p.account_id ?? null
  metodo.value = m?.payment_method ?? p.payment_method ?? 'card'
  otraFecha.value = fecha.value !== hoy() && fecha.value !== ayer()
  esCompartido.value = m?.is_shared ?? p.is_shared ?? props.compartido
  error.value = ''
}
watch(() => props.movimiento?.id, cargar, { immediate: true })

const titulo = computed(() => ({
  clasificar: 'Gasto nuevo',
  editar: 'Editar movimiento',
  nuevo: 'Nuevo movimiento',
}[props.modo]))

// cualquier cuenta tuya (personal o compartida) puede pagar un gasto compartido
const misCuentas = computed(() => props.cuentas.filter(c => c.owner_id === props.userId))

/** Cómo queda el presupuesto de la categoría elegida si guardas */
const impacto = computed(() => {
  if (tipo.value !== 'expense' || !categoria.value || !monto.value) return null
  const owner = props.movimiento?.owner_id ?? props.userId
  const b = presupuestoDeGasto(props.presupuestos, { category: categoria.value, is_shared: esCompartido.value, owner_id: owner })
  if (!b) return { sinPresupuesto: true as const }
  const simulado: Expense = {
    id: '__sim', owner_id: owner, account_id: null, is_shared: esCompartido.value,
    description: '', amount: monto.value, category: categoria.value, date: fecha.value,
    created_at: '', type: 'expense', needs_review: false,
  }
  const otros = props.gastos.filter(g => g.id !== props.movimiento?.id)
  const est = estadoPresupuesto(b, [...otros, simulado], new Date(fecha.value + 'T12:00:00'))
  return { sinPresupuesto: false as const, est }
})

const guardar = () => {
  error.value = ''
  if (!monto.value || monto.value <= 0) { error.value = 'Pon un monto mayor a 0'; return }
  if (tipo.value === 'expense' && !categoria.value) { error.value = 'Elige en qué gastaste'; return }
  emit('guardar', {
    type: tipo.value,
    description: descripcion.value.trim() || categoria.value || (tipo.value === 'income' ? 'Ingreso' : 'Gasto'),
    amount: monto.value,
    category: tipo.value === 'income' ? (categoria.value || 'Otros') : categoria.value,
    date: fecha.value,
    account_id: cuenta.value,
    is_shared: esCompartido.value,
    payment_method: metodo.value,
    needs_review: false,
  })
}

const elegirFecha = (f: 'hoy' | 'ayer' | 'otra') => {
  if (f === 'hoy') { fecha.value = hoy(); otraFecha.value = false }
  else if (f === 'ayer') { fecha.value = ayer(); otraFecha.value = false }
  else otraFecha.value = true
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cerrar')">
    <form class="modal-sheet" @submit.prevent="guardar">
      <div class="sheet-handle"></div>

      <div class="sheet-top">
        <h2>{{ titulo }}</h2>
        <span v-if="modo === 'clasificar' && pendientesRestantes" class="cola">
          {{ pendientesRestantes }} por clasificar
        </span>
      </div>

      <!-- Resumen del gasto que llegó del atajo -->
      <div v-if="modo === 'clasificar' && movimiento" class="llegada">
        <span class="llegada-monto">-${{ dinero(Number(movimiento.amount)) }}</span>
        <span class="llegada-desc">{{ movimiento.description }} · {{ fechaLarga(movimiento.date) }}</span>
      </div>

      <div v-if="modo !== 'clasificar'" class="type-toggle">
        <button type="button" :class="{ active: tipo === 'expense' }" @click="tipo = 'expense'">Gasto</button>
        <button type="button" :class="{ active: tipo === 'income' }" @click="tipo = 'income'">Ingreso</button>
      </div>

      <div v-if="modo !== 'clasificar'" class="form-row">
        <label>
          Monto ($)
          <input v-model.number="monto" type="number" step="0.01" min="0.01" placeholder="0,00" inputmode="decimal" />
        </label>
      </div>

      <!-- ¿En qué? -->
      <div class="pregunta">{{ tipo === 'income' ? '¿De qué es?' : '¿En qué gastaste?' }}</div>
      <div class="chips">
        <button v-for="c in CATEGORIAS" :key="c.nombre" type="button" class="chip"
          :class="{ on: categoria === c.nombre }" @click="categoria = c.nombre">
          <span>{{ c.icono }}</span>{{ c.nombre }}
        </button>
      </div>

      <label>
        Detalle <small>(opcional)</small>
        <input v-model="descripcion" type="text" placeholder="Ej: almuerzo con el equipo" />
      </label>

      <!-- ¿Cuándo? -->
      <div class="pregunta">¿Cuándo?</div>
      <div class="chips">
        <button type="button" class="chip" :class="{ on: !otraFecha && fecha === hoy() }" @click="elegirFecha('hoy')">Hoy</button>
        <button type="button" class="chip" :class="{ on: !otraFecha && fecha === ayer() }" @click="elegirFecha('ayer')">Ayer</button>
        <button type="button" class="chip" :class="{ on: otraFecha }" @click="elegirFecha('otra')">
          {{ otraFecha ? fechaLarga(fecha) : 'Otro día' }}
        </button>
      </div>
      <input v-if="otraFecha" v-model="fecha" type="date" class="fecha-input" :max="hoy()" />

      <div class="form-row">
        <label>
          Cuenta
          <select v-model="cuenta">
            <option :value="null">Ninguna (efectivo)</option>
            <option v-for="c in misCuentas" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label>
          Pago
          <select v-model="metodo">
            <option value="card">Tarjeta</option>
            <option value="apple_pay">Apple Pay</option>
            <option value="cash">Efectivo</option>
            <option value="bank_transfer">Transferencia</option>
            <option value="other">Otro</option>
          </select>
        </label>
      </div>

      <label v-if="tienePareja" class="switch">
        <input v-model="esCompartido" type="checkbox" />
        <span class="switch-ui"></span>
        <span>Compartido con mi pareja <small>(cuenta en el presupuesto de los dos)</small></span>
      </label>

      <!-- Impacto en el presupuesto -->
      <div v-if="impacto && !impacto.sinPresupuesto" class="impacto" :class="impacto.est.nivel">
        <div class="impacto-barra"><div :style="{ width: Math.min(100, impacto.est.porcentaje * 100) + '%' }"></div></div>
        <span v-if="impacto.est.restante >= 0">
          {{ categoria }}{{ esCompartido ? ' (compartido)' : '' }}: {{ esCompartido ? 'les' : 'te' }} quedarían <strong>${{ dinero(impacto.est.restante) }}</strong>
          de ${{ dinero(impacto.est.budget.amount) }} {{ impacto.est.budget.period === 'anual' ? 'este año' : 'este mes' }}
        </span>
        <span v-else>
          {{ categoria }}{{ esCompartido ? ' (compartido)' : '' }}: {{ esCompartido ? 'se pasarían' : 'te pasarías' }} <strong>${{ dinero(-impacto.est.restante) }}</strong>
          del presupuesto {{ impacto.est.budget.period === 'anual' ? 'anual' : 'del mes' }}
        </span>
      </div>
      <div v-else-if="impacto?.sinPresupuesto" class="impacto sin">
        {{ categoria }} no tiene presupuesto todavía.
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="form-actions">
        <button v-if="modo === 'clasificar'" type="button" @click="emit('saltar')">Después</button>
        <button v-else-if="modo === 'editar'" type="button" class="borrar" @click="emit('borrar')">Borrar</button>
        <button v-else type="button" @click="emit('cerrar')">Cancelar</button>
        <button type="submit" class="primary">{{ modo === 'nuevo' ? 'Agregar' : 'Guardar' }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6);
  display: flex; align-items: flex-end; justify-content: center; z-index: 100;
}
.modal-sheet {
  background: #16213e; border-radius: 24px 24px 0 0;
  padding: 20px 20px calc(24px + env(safe-area-inset-bottom));
  width: 100%; max-width: 500px; max-height: 92vh; overflow-y: auto;
  animation: sheetUp 0.3s ease;
}
@keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
.sheet-handle { width: 36px; height: 4px; background: #2a2a4a; border-radius: 2px; margin: 0 auto 16px; }
.sheet-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.sheet-top h2 { color: #e0e0e0; margin: 0 0 14px; font-size: 1.2rem; }
.cola { font-size: 0.8rem; color: #ffb347; white-space: nowrap; }
.llegada {
  display: flex; flex-direction: column; gap: 2px; background: #1a1a2e;
  border-radius: 14px; padding: 12px 14px; margin-bottom: 14px;
}
.llegada-monto { font-size: 1.8rem; font-weight: 800; color: #ff6b6b; }
.llegada-desc { color: #8a8a9a; font-size: 0.9rem; }
.type-toggle { display: flex; background: #1a1a2e; border-radius: 12px; padding: 3px; margin-bottom: 14px; }
.type-toggle button {
  flex: 1; padding: 10px; border: none; background: transparent; border-radius: 10px;
  color: #6a6a8a; font-size: 0.95rem; cursor: pointer;
}
.type-toggle button.active:first-child { background: #ff6b6b; color: white; }
.type-toggle button.active:last-child { background: #4ecdc4; color: white; }
.pregunta { color: #e0e0e0; font-weight: 600; font-size: 0.95rem; margin: 4px 0 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.chip {
  display: inline-flex; align-items: center; gap: 5px; padding: 8px 12px; border-radius: 999px;
  border: 1px solid #2a2a4a; background: #1a1a2e; color: #c0c0d0; font-size: 0.88rem; cursor: pointer;
}
.chip.on { background: #6c63ff; border-color: #6c63ff; color: white; }
label { display: block; margin-bottom: 12px; font-size: 0.85rem; color: #8a8a9a; }
label small { color: #5a5a7a; }
input, select {
  display: block; width: 100%; padding: 10px 12px; background: #1a1a2e; border: 1px solid #2a2a4a;
  border-radius: 10px; color: #e0e0e0; font-size: 16px; margin-top: 4px; box-sizing: border-box;
}
input:focus, select:focus { outline: none; border-color: #6c63ff; }
.fecha-input { margin: -6px 0 14px; }
.switch { display: flex; align-items: center; gap: 10px; color: #e0e0e0; font-size: 0.9rem; cursor: pointer; margin-bottom: 14px; }
.switch small { color: #6a6a8a; }
.switch input { position: absolute; opacity: 0; width: 0; height: 0; margin: 0; }
.switch-ui { flex: 0 0 auto; width: 42px; height: 24px; border-radius: 12px; background: #2a2a4a; position: relative; transition: background 0.2s; }
.switch-ui::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #e0e0e0; transition: transform 0.2s; }
.switch input:checked + .switch-ui { background: #6c63ff; }
.switch input:checked + .switch-ui::after { transform: translateX(18px); }
.form-row { display: flex; gap: 12px; }
.form-row label { flex: 1; min-width: 0; }
.impacto {
  background: #1a1a2e; border-radius: 12px; padding: 10px 12px; font-size: 0.85rem; color: #c0c0d0;
  border-left: 3px solid #4ecdc4;
}
.impacto.alerta { border-left-color: #ffb347; }
.impacto.pasado { border-left-color: #ff6b6b; }
.impacto.sin { border-left-color: #2a2a4a; color: #6a6a8a; }
.impacto-barra { height: 6px; background: #2a2a4a; border-radius: 3px; overflow: hidden; margin-bottom: 8px; }
.impacto-barra div { height: 100%; background: #4ecdc4; }
.impacto.alerta .impacto-barra div { background: #ffb347; }
.impacto.pasado .impacto-barra div { background: #ff6b6b; }
.error { color: #ff6b6b; font-size: 0.85rem; margin: 10px 0 0; }
.form-actions { display: flex; gap: 12px; margin-top: 16px; }
.form-actions button {
  flex: 1; padding: 12px; border-radius: 12px; border: 1px solid #2a2a4a;
  background: #1a1a2e; color: #e0e0e0; font-size: 0.95rem; cursor: pointer;
}
.form-actions .primary { background: linear-gradient(135deg, #3a0ca3, #6c63ff); color: white; border: none; }
.form-actions .borrar { color: #ff6b6b; }
</style>
