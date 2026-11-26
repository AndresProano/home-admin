<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute, RouterLink } from 'vue-router'
import Icono from '@/components/Icono.vue'
import Avatar from '@/components/Avatar.vue'
import { useAuth } from '@/composables/useAuth'
import { useFinances, type Expense } from '@/composables/useFinances'
import { useApp } from '@/composables/useApp'
import { TOTAL, SIN_CLASIFICAR, colorDe, nombreCategoria } from '@/lib/categorias'
import { interpretarVoz } from '@/lib/voz'
import { CATEGORIA_DIGITAL } from '@/lib/impuestos'
import { aISO, hoy, ayer, fechaLarga, dinero } from '@/lib/fechas'
import { estadoPresupuesto } from '@/lib/presupuesto'

const router = useRouter()
const route = useRoute()
const { user } = useAuth()
const { accounts, expenses, budgets, pendingReview, getDisplayName, addExpense, removeExpense, ivaDigitalDe } = useFinances()
const { lista, compartido, tienePareja, cargar, abrirClasificar, abrirNuevo, abrirMovimiento, nombreDe, fotoDe } = useApp()

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
const foto = computed(() => user.value ? fotoDe(user.value.id) : null)

/* Lo de la lista activa (mío / compartido) */
const enLista = (e: { is_shared: boolean }) => e.is_shared === compartido.value
const inicioMes = computed(() => { const d = new Date(); return aISO(new Date(d.getFullYear(), d.getMonth(), 1)) })
const delMes = computed(() => expenses.value.filter(e => enLista(e) && e.date >= inicioMes.value))
const gastadoMes = computed(() => delMes.value.filter(e => (e.type || 'expense') === 'expense').reduce((s, e) => s + Number(e.amount), 0))
const ingresoMes = computed(() => delMes.value.filter(e => e.type === 'income').reduce((s, e) => s + Number(e.amount), 0))
const cuentasLista = computed(() => accounts.value.filter(a => a.is_shared === compartido.value))
const saldo = computed(() => cuentasLista.value.filter(a => a.tipo !== 'credito').reduce((s, a) => s + Number(a.balance), 0))
const esTransfer = (e: Expense) => e.type === 'transfer'
const nombreCuenta = (id: string | null | undefined) => (id ? accounts.value.find(a => a.id === id)?.name : '') ?? ''
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
const detalle = (e: Expense) => esTransfer(e) ? `${etiquetaFecha(e.date)} · ${nombreCuenta(e.account_id)} → ${nombreCuenta(e.to_account_id)}` : [
  etiquetaFecha(e.date),
  e.needs_review ? 'toca para clasificar' : e.category,
  compartido.value && e.owner_id !== user.value?.id ? nombreDe(e.owner_id) : '',
].filter(Boolean).join(' · ')

/* ---------- Dictar: "gasté 12,50 en almuerzo con la visa" → se guarda solo ---------- */
const escuchando = ref(false)
const dictar = () => {
  const w = window as any
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!SR) { alert('Este navegador no permite dictar. Usa el micrófono del teclado del iPhone en el botón +.'); return }
  const r = new SR()
  r.lang = 'es-EC'
  r.interimResults = false
  escuchando.value = true
  r.onresult = (ev: any) => { escuchando.value = false; guardarDictado(ev.results[0][0].transcript) }
  r.onerror = () => { escuchando.value = false }
  r.onend = () => { escuchando.value = false }
  r.start()
}

interface AvisoVoz { oido: string; mov: Expense; iva: Expense | null; resumen: string; falta: string }
const aviso = ref<AvisoVoz | null>(null)
let timerAviso: ReturnType<typeof setTimeout> | undefined
const mostrarAviso = (a: AvisoVoz) => {
  aviso.value = a
  clearTimeout(timerAviso)
  timerAviso = setTimeout(() => { aviso.value = null }, 12000)
}

/** La última cuenta propia que usaste en un gasto (para cuando no la dices) */
const ultimaCuenta = () => {
  const mias = new Set(accounts.value.filter(a => a.owner_id === user.value?.id).map(a => a.id))
  return expenses.value.find(e => e.owner_id === user.value?.id && e.account_id && mias.has(e.account_id) && e.type !== 'transfer')?.account_id ?? null
}

const guardarDictado = async (texto: string) => {
  if (!user.value) return
  const mias = accounts.value.filter(a => a.owner_id === user.value?.id)
  const r = interpretarVoz(texto, mias)

  // sin monto: abrir la hoja con lo que se entendió
  if (!r.monto || r.monto <= 0) {
    abrirNuevo({ description: r.descripcion, type: r.tipo, category: r.categoria ?? undefined, date: r.fecha,
      account_id: r.cuentaId === undefined ? undefined : r.cuentaId })
    return
  }

  const cuentaId = r.cuentaId !== undefined ? r.cuentaId : ultimaCuenta()
  const cta = accounts.value.find(a => a.id === cuentaId)
  const categoria = r.categoria ?? SIN_CLASIFICAR
  const exterior = r.tipo === 'expense' && categoria === CATEGORIA_DIGITAL
  const datos = {
    type: r.tipo, description: r.descripcion, amount: Math.round(r.monto * 100) / 100, category: categoria,
    date: r.fecha, account_id: cuentaId, to_account_id: null, is_shared: compartido.value,
    payment_method: !cta ? 'cash' : cta.subtipo === 'credito' ? 'credit' : 'debit',
    exterior, needs_review: !r.categoria,
  }
  try {
    const mov = await addExpense(user.value.id, datos) as Expense
    let iva: Expense | null = null
    if (exterior) {
      const montoIva = Math.round(datos.amount * ivaDigitalDe(user.value.id)) / 100
      if (montoIva > 0) iva = await addExpense(user.value.id, { ...datos, description: `IVA ${datos.description}`.slice(0, 200), amount: montoIva, exterior: false }) as Expense
    }
    const cuandoTxt = r.fecha === hoy() ? 'hoy' : r.fecha === ayer() ? 'ayer' : fechaLarga(r.fecha)
    mostrarAviso({
      oido: texto,
      mov, iva,
      resumen: [
        `${r.descripcion} ${r.tipo === 'income' ? '+' : '−'}$${dinero(datos.amount)}${iva ? ` + IVA $${dinero(Number(iva.amount))}` : ''}`,
        r.categoria ?? '',
        cta ? cta.name : 'efectivo',
        cuandoTxt,
      ].filter(Boolean).join(' · '),
      falta: r.categoria ? '' : 'Falta la categoría',
    })
  } catch (e: any) {
    alert('No se pudo guardar: ' + (e.message ?? e))
  }
}

const editarDictado = () => {
  if (!aviso.value) return
  const m = expenses.value.find(e => e.id === aviso.value!.mov.id) ?? aviso.value.mov
  aviso.value = null
  abrirMovimiento(m)
}
const deshacerDictado = async () => {
  const a = aviso.value
  if (!a) return
  aviso.value = null
  await removeExpense(a.mov.id)
  if (a.iva) await removeExpense(a.iva.id)
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
        <RouterLink to="/ajustes" class="enlace-avatar" aria-label="Ajustes"><Avatar :foto="foto" :nombre="nombre" /></RouterLink>
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
          <RouterLink to="/cuentas" class="pastilla">Tienes ${{ dinero(saldo) }} ›</RouterLink>
          <RouterLink v-if="deuda > 0" to="/cuentas" class="pastilla">Debes ${{ dinero(deuda) }} en tarjetas ›</RouterLink>
        </div>
      </template>
      <template v-else>
        <span class="etiqueta">{{ compartido ? 'Gastaron este mes' : 'Gastaste este mes' }}</span>
        <span class="cifra grande">${{ dinero(gastadoMes) }}</span>
        <div class="pastillas">
          <span class="pastilla blanca">Entró ${{ dinero(ingresoMes) }}</span>
          <RouterLink to="/cuentas" class="pastilla">Tienes ${{ dinero(saldo) }} ›</RouterLink>
          <RouterLink v-if="deuda > 0" to="/cuentas" class="pastilla">Debes ${{ dinero(deuda) }} en tarjetas ›</RouterLink>
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
        <span class="icono-cat" :style="{ background: esTransfer(e) ? 'var(--neutro)' : e.type === 'income' ? 'var(--menta)' : colorDe(e.needs_review ? 'Sin clasificar' : e.category) }">
          <Icono :nombre="esTransfer(e) ? 'transferencia' : e.type === 'income' ? 'ingreso' : e.needs_review ? 'Sin clasificar' : e.category" :tam="18" />
        </span>
        <span class="mov-info"><strong>{{ e.description }}</strong><span>{{ detalle(e) }}</span></span>
        <span class="mov-monto" :class="{ ingreso: e.type === 'income' }">{{ esTransfer(e) ? '' : e.type === 'income' ? '+' : '−' }}${{ dinero(Number(e.amount)) }}</span>
      </button>
    </div>
    <!-- Aviso de lo que se guardó por voz -->
    <div v-if="aviso" class="aviso-voz bloque sombra" role="status" aria-live="polite">
      <span class="muted oido">“{{ aviso.oido }}”</span>
      <strong>Guardado: {{ aviso.resumen }}</strong>
      <span v-if="aviso.falta" class="rojo" style="font-size: 13px; font-weight: 600">{{ aviso.falta }}</span>
      <div class="acciones">
        <button class="btn" @click="deshacerDictado">Deshacer</button>
        <button class="btn primario" @click="editarDictado">{{ aviso.falta ? 'Clasificar' : 'Editar' }}</button>
      </div>
      <button class="cerrar-aviso" aria-label="Cerrar" @click="aviso = null"><Icono nombre="cerrar" :tam="16" /></button>
    </div>
  </main>
</template>

<style scoped>
.aviso-voz {
  position: fixed; left: 12px; right: 12px; bottom: calc(96px + env(safe-area-inset-bottom)); z-index: 60;
  max-width: 496px; margin: 0 auto; background: var(--amarillo);
  display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; animation: subir 0.2s ease;
}
.aviso-voz .oido { color: var(--tinta); font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 28px; }
.aviso-voz .btn { min-height: 42px; }
.cerrar-aviso { position: absolute; top: 8px; right: 8px; width: 32px; height: 32px; border: none; background: none; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.enlace-avatar { display: inline-flex; text-decoration: none; border-radius: 50%; }
.heroe { display: flex; flex-direction: column; gap: 10px; padding: 18px; }
.etiqueta { font-size: 14px; font-weight: 600; }
.grande { font-size: 46px; line-height: 1; letter-spacing: -1.5px; }
.grande.pasado { color: var(--amarillo); }
.pastillas { display: flex; flex-wrap: wrap; gap: 8px; }
.pastilla { border-radius: 999px; padding: 6px 10px; font-size: 13px; font-weight: 600; background: rgba(255, 255, 255, 0.18); }
a.pastilla { color: #fff; text-decoration: none; }
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
