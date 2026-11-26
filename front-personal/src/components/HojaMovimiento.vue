<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Icono from './Icono.vue'
import { useAuth } from '@/composables/useAuth'
import { useFinances, type Expense } from '@/composables/useFinances'
import { useApp } from '@/composables/useApp'
import { CATEGORIAS, SIN_CLASIFICAR, colorDe } from '@/lib/categorias'
import { hoy, ayer, fechaLarga, dinero } from '@/lib/fechas'
import { estadoPresupuesto, presupuestoDeGasto } from '@/lib/presupuesto'
import { infoSubtipo, esDeuda, deudaDe } from '@/lib/cuentas'
import { CATEGORIA_DIGITAL, ISD_EXENTO_ANUAL } from '@/lib/impuestos'

/**
 * Hoja global para tres usos:
 *  - 'clasificar': un gasto que llegó del atajo sin categoría → "¿En qué gastaste? ¿Cuándo?"
 *  - 'editar': cambiar un movimiento
 *  - 'nuevo': registrar a mano (botón + de la barra)
 */
const { user } = useAuth()
const { accounts, budgets, expenses, addExpense, updateExpense, removeExpense, comisionDe, ivaDigitalDe } = useFinances()
const { hoja, compartido, tienePareja, colaClasificar, siguienteDeCola, saltar, cerrarHoja } = useApp()

const tipo = ref<'expense' | 'income' | 'transfer'>('expense')
/** transferencias: cuenta de destino */
const hacia = ref<string | undefined>(undefined)
/** comisión interbancaria (solo al crear una transferencia) */
/** servicio digital / compra del exterior: cuenta para el ISD y puede llevar IVA aparte */
const exterior = ref(false)
const agregarIva = ref(false)
const cobrarComision = ref(false)
const montoComision = ref<number | null>(null)
const descripcion = ref('')
const monto = ref<number | null>(null)
const categoria = ref('')
const fecha = ref(hoy())
/** undefined = aún no eligió · null = efectivo / ninguna · id = cuenta */
const cuenta = ref<string | null | undefined>(undefined)
const metodoOriginal = ref<string | undefined>(undefined)
const otraFecha = ref(false)
const esCompartido = ref(false)
const error = ref('')
const guardando = ref(false)

const modo = computed(() => hoja.value?.modo ?? 'nuevo')
const mov = computed(() => hoja.value?.movimiento ?? null)

const cargar = () => {
  if (!hoja.value) return
  const m = mov.value
  const p = hoja.value.prellenado ?? {}
  tipo.value = (m?.type as 'expense' | 'income' | 'transfer') || (p.type as 'expense' | 'income' | 'transfer') || 'expense'
  hacia.value = m?.to_account_id ?? p.to_account_id ?? undefined
  cobrarComision.value = false
  montoComision.value = null
  exterior.value = m?.exterior ?? (categoria.value === CATEGORIA_DIGITAL)
  agregarIva.value = modo.value !== 'editar' && exterior.value
  descripcion.value = m && !m.needs_review ? m.description : (p.description ?? '')
  monto.value = m ? Number(m.amount) : (p.amount ?? null)
  categoria.value = m && m.category !== SIN_CLASIFICAR ? m.category : (p.category ?? '')
  fecha.value = m?.date ?? p.date ?? hoy()
  // en un gasto nuevo o por clasificar sin cuenta, hay que elegirla; al editar, sin cuenta = efectivo
  cuenta.value = m?.account_id ?? p.account_id ?? (modo.value === 'editar' ? null : undefined)
  metodoOriginal.value = m?.payment_method
  otraFecha.value = fecha.value !== hoy() && fecha.value !== ayer()
  esCompartido.value = m?.is_shared ?? p.is_shared ?? compartido.value
  error.value = ''
}
watch(() => [hoja.value, mov.value?.id], cargar, { immediate: true })

const titulo = computed(() => modo.value === 'clasificar' ? '¿En qué gastaste?'
  : tipo.value === 'transfer' ? (modo.value === 'editar' ? 'Editar transferencia' : 'Transferir') : modo.value === 'editar' ? 'Editar' : 'Nuevo')
const ORDEN = { disponible: 0, deuda: 1, ahorro: 2 } as const
const misCuentas = computed(() => accounts.value
  .filter(c => c.owner_id === user.value?.id)
  .sort((a, b) => ORDEN[infoSubtipo(a.subtipo).grupo] - ORDEN[infoSubtipo(b.subtipo).grupo] || a.name.localeCompare(b.name)))
const saldoDe = (c: typeof accounts.value[number]) => esDeuda(c) ? `debes $${dinero(deudaDe(c))}` : `$${dinero(Number(c.balance))}`
const cuentaElegida = computed(() => accounts.value.find(c => c.id === cuenta.value))

/** Cómo queda el presupuesto de la categoría elegida si guardas */
const impacto = computed(() => {
  if (tipo.value !== 'expense' || !categoria.value || !monto.value || !user.value) return null
  const owner = mov.value?.owner_id ?? user.value.id
  const b = presupuestoDeGasto(budgets.value, { category: categoria.value, is_shared: esCompartido.value, owner_id: owner })
  if (!b) return { sinPresupuesto: true as const }
  const simulado: Expense = {
    id: '__sim', owner_id: owner, account_id: null, is_shared: esCompartido.value,
    description: '', amount: monto.value, category: categoria.value, date: fecha.value,
    created_at: '', type: 'expense', needs_review: false,
  }
  const otros = expenses.value.filter(g => g.id !== mov.value?.id)
  const est = estadoPresupuesto(b, [...otros, simulado], new Date(fecha.value + 'T12:00:00'))
  return { sinPresupuesto: false as const, est }
})

/* Suscripciones → servicio digital del exterior (se puede apagar) */
watch(categoria, (c, antes) => {
  if (modo.value === 'editar' || c === antes) return
  exterior.value = c === CATEGORIA_DIGITAL
  agregarIva.value = exterior.value
})
watch(exterior, v => { if (!v) agregarIva.value = false })
const pctIva = computed(() => user.value ? ivaDigitalDe(user.value.id) : 15)
const montoIva = computed(() => Math.round(Number(monto.value || 0) * pctIva.value) / 100)
const fmtPct = (n: number) => n.toLocaleString('es-EC')

const elegirFecha = (f: 'hoy' | 'ayer' | 'otra') => {
  if (f === 'hoy') { fecha.value = hoy(); otraFecha.value = false }
  else if (f === 'ayer') { fecha.value = ayer(); otraFecha.value = false }
  else otraFecha.value = true
}

const guardar = async () => {
  error.value = ''
  if (!user.value || !hoja.value) return
  if (!monto.value || monto.value <= 0) { error.value = 'Pon un monto mayor a 0'; return }
  if (tipo.value === 'transfer') return guardarTransferencia()
  if (tipo.value === 'expense' && !categoria.value) { error.value = 'Elige en qué gastaste'; return }
  if (cuenta.value === undefined) { error.value = tipo.value === 'income' ? 'Elige a qué cuenta entró' : 'Elige de qué cuenta salió'; return }
  const metodo = metodoOriginal.value === 'apple_pay' ? 'apple_pay'
    : !cuentaElegida.value ? 'cash'
      : cuentaElegida.value.tipo === 'credito' ? 'credit' : 'debit'
  const datos = {
    type: tipo.value,
    description: descripcion.value.trim() || mov.value?.description || categoria.value || (tipo.value === 'income' ? 'Ingreso' : 'Gasto'),
    amount: monto.value,
    category: tipo.value === 'income' ? (categoria.value || 'Otros') : categoria.value,
    date: fecha.value,
    account_id: cuenta.value ?? null,
    to_account_id: null,
    is_shared: esCompartido.value,
    payment_method: metodo,
    exterior: tipo.value === 'expense' && exterior.value,
  }
  // IVA de servicio digital: gasto aparte en la misma categoría y cuenta (no se marca como exterior)
  const ivaExtra = tipo.value === 'expense' && exterior.value && agregarIva.value && modo.value !== 'editar' ? montoIva.value : 0
  const lineaIva = ivaExtra > 0 ? { ...datos, description: `IVA ${datos.description}`.slice(0, 200), amount: ivaExtra, exterior: false } : null
  guardando.value = true
  try {
    if (modo.value === 'nuevo') {
      await addExpense(user.value.id, datos)
      if (lineaIva) await addExpense(user.value.id, lineaIva)
      cerrarHoja()
    } else if (mov.value) {
      await updateExpense(mov.value.id, { ...datos, needs_review: false })
      if (lineaIva) await addExpense(user.value.id, lineaIva)
      if (modo.value === 'clasificar') siguienteDeCola()
      else cerrarHoja()
    }
  } catch (e: any) {
    error.value = 'No se pudo guardar: ' + (e.message ?? e)
  } finally {
    guardando.value = false
  }
}

/** Pago de tarjeta: cuánto se debe hoy en la cuenta de destino */
const deudaDestino = computed(() => {
  const b = accounts.value.find(c => c.id === hacia.value)
  return tipo.value === 'transfer' && b && esDeuda(b) ? deudaDe(b) : 0
})

const normEnt = (s?: string | null) => (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^(banco( de| del)?|cooperativa)\s+/, '').trim()
/** Las dos cuentas son de bancos distintos (y ninguna es efectivo) */
const esInterbancaria = computed(() => {
  const a = accounts.value.find(c => c.id === cuenta.value)
  const b = accounts.value.find(c => c.id === hacia.value)
  if (!a || !b || a.subtipo === 'efectivo' || b.subtipo === 'efectivo') return false
  const ea = normEnt(a.entidad), eb = normEnt(b.entidad)
  return !!ea && !!eb && ea !== eb
})
watch([cuenta, hacia, tipo], () => {
  if (tipo.value !== 'transfer' || modo.value !== 'nuevo') return
  cobrarComision.value = esInterbancaria.value
  if (montoComision.value == null && user.value) montoComision.value = comisionDe(user.value.id)
})

const guardarTransferencia = async () => {
  if (!user.value || !monto.value) return
  if (!cuenta.value) { error.value = 'Elige desde qué cuenta sale'; return }
  if (!hacia.value) { error.value = 'Elige a qué cuenta va'; return }
  if (cuenta.value === hacia.value) { error.value = 'Elige dos cuentas distintas'; return }
  const destino = accounts.value.find(c => c.id === hacia.value)
  const datos = {
    type: 'transfer',
    description: descripcion.value.trim() || (destino ? (esDeuda(destino) ? `Pago ${destino.name}` : `A ${destino.name}`) : 'Transferencia'),
    amount: monto.value,
    category: 'Transferencia',
    date: fecha.value,
    account_id: cuenta.value,
    to_account_id: hacia.value,
    is_shared: false,
    payment_method: 'transfer',
  }
  const comision = modo.value === 'nuevo' && cobrarComision.value ? Number(montoComision.value || 0) : 0
  const origen = accounts.value.find(c => c.id === cuenta.value)
  guardando.value = true
  try {
    if (modo.value === 'nuevo') {
      await addExpense(user.value.id, datos)
      // la comisión del banco va como un gasto aparte, desde la cuenta de origen
      if (comision > 0) {
        await addExpense(user.value.id, {
          type: 'expense', category: 'Comisiones', amount: comision, date: fecha.value,
          description: `Comisión transferencia ${origen?.name ?? ''} → ${destino?.name ?? ''}`.trim(),
          account_id: cuenta.value, to_account_id: null, is_shared: false, payment_method: 'transfer',
        })
      }
    } else if (mov.value) await updateExpense(mov.value.id, { ...datos, needs_review: false })
    cerrarHoja()
  } catch (e: any) {
    error.value = 'No se pudo guardar: ' + (e.message ?? e)
  } finally {
    guardando.value = false
  }
}

const borrar = async () => {
  const m = mov.value
  if (!m || !confirm('¿Borrar este movimiento?')) return
  await removeExpense(m.id)
  cerrarHoja()
}
</script>

<template>
  <div v-if="hoja" class="velo" @click.self="cerrarHoja">
    <form class="hoja" @submit.prevent="guardar" :aria-label="titulo">
      <div class="agarre"></div>

      <div class="cabecera">
        <h2 class="titulo-pagina" style="font-size: 24px">{{ titulo }}</h2>
        <span v-if="modo === 'clasificar' && colaClasificar.length > 1" class="cola">{{ colaClasificar.length }} por clasificar</span>
        <button type="button" class="btn-icono" aria-label="Cerrar" @click="cerrarHoja"><Icono nombre="cerrar" /></button>
      </div>

      <!-- Lo que llegó del atajo -->
      <div v-if="modo === 'clasificar' && mov" class="bloque amarillo llegada">
        <span class="cifra" style="font-size: 34px">−${{ dinero(Number(mov.amount)) }}</span>
        <span style="font-weight: 600">{{ mov.description }} · {{ fechaLarga(mov.date) }}</span>
      </div>

      <template v-else>
        <div class="seg">
          <button type="button" :class="{ on: tipo === 'expense' }" @click="tipo = 'expense'">Gasto</button>
          <button type="button" :class="{ on: tipo === 'income' }" @click="tipo = 'income'">Ingreso</button>
          <button type="button" :class="{ on: tipo === 'transfer' }" @click="tipo = 'transfer'">Transferir</button>
        </div>
        <label class="campo monto">
          {{ deudaDestino > 0 ? 'Monto a pagar' : 'Monto' }}
          <input v-model.number="monto" type="number" step="0.01" min="0.01" placeholder="$0,00" inputmode="decimal" />
        </label>
        <div v-if="deudaDestino > 0" class="chips" style="margin-top: -6px">
          <button type="button" class="chip" :class="{ on: monto === deudaDestino }" @click="monto = deudaDestino">Pagar todo (${{ dinero(deudaDestino) }})</button>
          <button type="button" class="chip" :class="{ on: !!monto && monto !== deudaDestino }" @click="monto = null">Otro monto</button>
        </div>
      </template>

      <div v-if="tipo !== 'transfer'">
        <p class="subtitulo" style="margin-bottom: 10px">{{ tipo === 'income' ? '¿De qué es?' : modo === 'clasificar' ? 'Categoría' : '¿En qué?' }}</p>
        <div class="chips">
          <button v-for="c in CATEGORIAS" :key="c.nombre" type="button" class="chip"
            :class="{ on: categoria === c.nombre }" @click="categoria = c.nombre">
            <span class="punto" :style="{ background: c.color }"><Icono :nombre="c.nombre" :tam="14" :grosor="2.4" /></span>
            {{ c.nombre }}
          </button>
        </div>
      </div>

      <label class="campo">
        Detalle (opcional)
        <input v-model="descripcion" type="text" :placeholder="mov?.description || (tipo === 'transfer' ? 'Ej: ahorro del mes, pago de la tarjeta' : 'Ej: almuerzo con el equipo')" />
      </label>

      <div>
        <p class="subtitulo" style="margin-bottom: 10px">¿Cuándo?</p>
        <div class="chips">
          <button type="button" class="chip" :class="{ on: !otraFecha && fecha === hoy() }" @click="elegirFecha('hoy')">Hoy</button>
          <button type="button" class="chip" :class="{ on: !otraFecha && fecha === ayer() }" @click="elegirFecha('ayer')">Ayer</button>
          <button type="button" class="chip" :class="{ on: otraFecha }" @click="elegirFecha('otra')">{{ otraFecha ? fechaLarga(fecha) : 'Otro día' }}</button>
        </div>
        <label v-if="otraFecha" class="campo" style="margin-top: 10px">
          Fecha
          <input v-model="fecha" type="date" :max="hoy()" />
        </label>
      </div>

      <div>
        <p class="subtitulo" style="margin-bottom: 10px">{{ tipo === 'transfer' ? '¿Desde qué cuenta?' : tipo === 'income' ? '¿A qué cuenta entró?' : '¿De qué cuenta salió?' }}</p>
        <div class="cuentas">
          <button v-for="c in misCuentas" :key="c.id" type="button" class="cuenta-op" :class="{ on: cuenta === c.id }" @click="cuenta = c.id">
            <span class="tipo" :class="infoSubtipo(c.subtipo).grupo">{{ infoSubtipo(c.subtipo).corto }}</span>
            <strong>{{ c.name }}</strong>
            <span class="saldo">{{ saldoDe(c) }}</span>
          </button>
          <button v-if="tipo !== 'transfer'" type="button" class="cuenta-op" :class="{ on: cuenta === null }" @click="cuenta = null">
            <span class="tipo">Efectivo</span>
            <strong>Efectivo / ninguna</strong>
            <span class="saldo">no descuenta saldo</span>
          </button>
        </div>
        <p v-if="!misCuentas.length" class="muted" style="margin: 8px 0 0">Agrega tus cuentas en Ajustes → Mis cuentas para elegir de cuál salió.</p>
      </div>

      <template v-if="tipo === 'transfer'">
        <span class="flecha-transfer" aria-hidden="true"><Icono nombre="transferencia" :tam="22" /></span>
        <div>
          <p class="subtitulo" style="margin-bottom: 10px">¿Hacia qué cuenta?</p>
          <div class="cuentas">
            <button v-for="c in misCuentas" :key="c.id" type="button" class="cuenta-op" :class="{ on: hacia === c.id }"
              :disabled="c.id === cuenta" @click="hacia = c.id">
              <span class="tipo" :class="infoSubtipo(c.subtipo).grupo">{{ infoSubtipo(c.subtipo).corto }}</span>
              <strong>{{ c.name }}</strong>
              <span class="saldo">{{ esDeuda(c) ? 'baja lo que debes' : saldoDe(c) }}</span>
            </button>
          </div>
        </div>
        <div v-if="modo === 'nuevo' && cuenta && hacia" class="bloque comision" :class="{ activa: cobrarComision }">
          <label class="interruptor">
            <input v-model="cobrarComision" type="checkbox" />
            <span class="pista" aria-hidden="true"></span>
            <span><strong>Comisión {{ esInterbancaria ? 'interbancaria' : 'del banco' }}</strong><br>
              <span class="muted">{{ esInterbancaria ? 'Son bancos distintos: se registra como gasto en "Comisiones".' : 'Mismo banco: normalmente no cobran.' }}</span></span>
          </label>
          <label v-if="cobrarComision" class="campo">
            Monto de la comisión ($)
            <input v-model.number="montoComision" type="number" step="0.01" min="0" inputmode="decimal" />
          </label>
        </div>
      </template>

      <div v-if="tipo === 'expense'" class="bloque exterior" :class="{ activa: exterior }">
        <label class="interruptor">
          <input v-model="exterior" type="checkbox" />
          <span class="pista" aria-hidden="true"></span>
          <span><strong>Servicio digital / del exterior</strong><br>
            <span class="muted">Netflix, Spotify, Apple, compras en el exterior. Cuenta para el límite del ISD (${{ dinero(ISD_EXENTO_ANUAL) }} al año).</span></span>
        </label>
        <label v-if="exterior && modo !== 'editar'" class="check-iva">
          <input v-model="agregarIva" type="checkbox" />
          <span>Agregar el IVA {{ fmtPct(pctIva) }}% que cobra el banco aparte<template v-if="monto"> (<strong>${{ dinero(montoIva) }}</strong>)</template></span>
        </label>
      </div>

      <label v-if="tienePareja && tipo !== 'transfer'" class="interruptor">
        <input v-model="esCompartido" type="checkbox" />
        <span class="pista" aria-hidden="true"></span>
        <span><strong>Compartido con mi pareja</strong><br><span class="muted">Cuenta en el presupuesto de los dos</span></span>
      </label>

      <div v-if="impacto && !impacto.sinPresupuesto" class="bloque impacto"
        :style="{ background: impacto.est.restante < 0 ? 'var(--durazno)' : colorDe(categoria) }">
        <div class="barra" :class="{ pasado: impacto.est.restante < 0 }"><div :style="{ width: Math.min(100, impacto.est.porcentaje * 100) + '%' }"></div></div>
        <span v-if="impacto.est.restante >= 0">
          {{ categoria }}: {{ esCompartido ? 'les' : 'te' }} quedarían <strong>${{ dinero(impacto.est.restante) }}</strong>
          de ${{ dinero(impacto.est.budget.amount) }} {{ impacto.est.budget.period === 'anual' ? 'este año' : 'este mes' }}
        </span>
        <span v-else class="rojo">
          {{ categoria }}: {{ esCompartido ? 'se pasarían' : 'te pasarías' }} <strong>${{ dinero(-impacto.est.restante) }}</strong>
        </span>
      </div>
      <p v-else-if="impacto?.sinPresupuesto" class="muted" style="margin: 0">{{ categoria }} aún no tiene presupuesto.</p>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="acciones">
        <button v-if="modo === 'clasificar'" type="button" class="btn" @click="saltar">Después</button>
        <button v-else-if="modo === 'editar'" type="button" class="btn peligro" @click="borrar">Borrar</button>
        <button type="submit" class="btn primario" :disabled="guardando">{{ modo === 'nuevo' ? 'Agregar' : 'Guardar' }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.cola { font-size: 13px; font-weight: 700; background: var(--amarillo); border: var(--borde); border-radius: 999px; padding: 4px 10px; margin-left: auto; }
.llegada { display: flex; flex-direction: column; gap: 4px; }
.monto input { font-family: var(--titulo); font-size: 28px; font-weight: 700; min-height: 60px; }
.punto { width: 24px; height: 24px; border-radius: 8px; border: 1.5px solid var(--tinta); display: inline-flex; align-items: center; justify-content: center; color: var(--tinta); }
.chip.on .punto { border-color: #fff; }
.interruptor { display: flex; align-items: center; gap: 12px; cursor: pointer; font-size: 15px; }
.interruptor input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.pista { flex: 0 0 auto; width: 52px; height: 30px; border: var(--borde); border-radius: 15px; background: var(--fondo); position: relative; }
.pista::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: var(--tinta); transition: transform 0.15s; }
.interruptor input:checked + .pista { background: var(--azul); }
.interruptor input:checked + .pista::after { transform: translateX(22px); background: #fff; }
.interruptor input:focus-visible + .pista { outline: 3px solid var(--azul); outline-offset: 2px; }
.cuentas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.cuenta-op { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-height: 76px; padding: 10px 12px; border: var(--borde); border-radius: 14px; background: var(--fondo); text-align: left; cursor: pointer; font: inherit; color: inherit; }
.cuenta-op strong { font-size: 15px; overflow: hidden; text-overflow: ellipsis; max-width: 100%; white-space: nowrap; }
.cuenta-op .saldo { font-size: 12px; color: var(--gris); }
.cuenta-op.on { background: var(--tinta); color: #fff; }
.cuenta-op:disabled { opacity: 0.35; cursor: not-allowed; }
.cuenta-op.on .saldo { color: #ddd; }
.tipo { font-size: 10px; font-weight: 800; text-transform: uppercase; border: 1.5px solid currentColor; border-radius: 6px; padding: 1px 5px; background: var(--neutro); color: var(--tinta); }
.tipo.disponible { background: var(--cielo); }
.tipo.ahorro { background: var(--lima); }
.tipo.deuda { background: var(--durazno); }
.exterior { display: flex; flex-direction: column; gap: 10px; }
.exterior.activa { background: var(--cielo); }
.check-iva { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; cursor: pointer; }
.check-iva input { width: 22px; height: 22px; flex: 0 0 auto; accent-color: var(--azul); }
.comision { display: flex; flex-direction: column; gap: 10px; }
.comision.activa { background: var(--neutro); }
.flecha-transfer { display: flex; justify-content: center; color: var(--gris); margin: -4px 0; }
.impacto { display: flex; flex-direction: column; gap: 10px; font-size: 14px; }
</style>
