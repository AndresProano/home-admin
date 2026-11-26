<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useFinances, type Expense, type NewExpense } from '@/composables/useFinances'
import MovimientoSheet from '@/components/MovimientoSheet.vue'
import { iconoDe, TOTAL } from '@/lib/categorias'
import { aISO, hoy, ayer, fechaLarga, dinero } from '@/lib/fechas'
import { estadoPresupuesto } from '@/lib/presupuesto'

const router = useRouter()
const route = useRoute()
const { user, waitForAuth } = useAuth()
const {
  accounts, expenses, budgets, partner, apiKey, pendingReview,
  loadPartner, createPartnerInvite, joinPartner, removePartner,
  loadAccounts, loadExpenses, loadBudgets, addAccount, removeAccount,
  addExpense, updateExpense, removeExpense,
  loadApiKey, generateApiKey,
  loadProfile, getDisplayName,
} = useFinances()

/* ─── localStorage seguro (modo privado de Safari puede fallar) ─── */
const leer = (k: string, def: string) => { try { return localStorage.getItem(k) || def } catch { return def } }
const guardarLS = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sin storage */ } }

/* ─── Estado de la vista ─── */
const timePeriod = ref<'week' | 'month' | 'year' | 'all'>(leer('fin_timePeriod', 'month') as any)
const listFilter = ref<'personal' | 'shared'>(leer('fin_listFilter', 'personal') as any)
const showSettings = ref(false)
const showSearch = ref(false)
const searchQuery = ref('')

watch(timePeriod, v => guardarLS('fin_timePeriod', v))
watch(listFilter, v => guardarLS('fin_listFilter', v))

/* ─── Hoja de movimiento (nuevo / editar / clasificar) ─── */
const hoja = ref<{ modo: 'nuevo' | 'editar' | 'clasificar'; movimiento: Expense | null; prellenado?: Partial<NewExpense> } | null>(null)
const saltados = ref<Set<string>>(new Set())

const colaClasificar = computed(() => pendingReview.value.filter(e => !saltados.value.has(e.id)))

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
  if (!isOwner(tx.owner_id)) return
  hoja.value = { modo: tx.needs_review ? 'clasificar' : 'editar', movimiento: tx }
}

const onGuardar = async (datos: NewExpense & { needs_review: boolean }) => {
  if (!user.value || !hoja.value) return
  const { modo, movimiento } = hoja.value
  try {
    if (modo === 'nuevo') {
      await addExpense(user.value.id, datos)
      hoja.value = null
    } else if (movimiento) {
      await updateExpense(movimiento.id, datos)
      if (modo === 'clasificar') siguienteDeCola()
      else hoja.value = null
    }
  } catch (e: any) {
    alert('No se pudo guardar: ' + (e.message ?? e))
  }
}
const onSaltar = () => {
  if (hoja.value?.movimiento) saltados.value.add(hoja.value.movimiento.id)
  siguienteDeCola()
}
const onBorrar = async () => {
  const m = hoja.value?.movimiento
  if (!m || !confirm('¿Borrar este movimiento?')) return
  await removeExpense(m.id)
  hoja.value = null
}

/* ─── Voz ─── */
const isListening = ref(false)

/* ─── Pareja ─── */
const partnerMode = ref<'create' | 'join'>('join')
const partnerInviteCode = ref('')
const partnerError = ref('')

/* ─── Cuentas ─── */
const showAccountForm = ref(false)
const newAccountName = ref('')
const newAccountBalance = ref(0)

/* ─── Cálculos ─── */
const filteredAccounts = computed(() =>
  accounts.value.filter(a => listFilter.value === 'shared' ? a.is_shared : !a.is_shared)
)
const accountsTotal = computed(() =>
  filteredAccounts.value.reduce((sum, a) => sum + Number(a.balance), 0)
)

const filteredByList = computed(() =>
  expenses.value.filter(e => listFilter.value === 'shared' ? e.is_shared : !e.is_shared)
)

const getTimeStart = () => {
  const now = new Date()
  switch (timePeriod.value) {
    case 'week': {
      const d = new Date(now)
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // semana empieza el lunes
      return aISO(d)
    }
    case 'month': return aISO(new Date(now.getFullYear(), now.getMonth(), 1))
    case 'year': return aISO(new Date(now.getFullYear(), 0, 1))
    case 'all': return '1900-01-01'
  }
}

const filteredByTime = computed(() => {
  const start = getTimeStart()
  return filteredByList.value.filter(e => e.date >= start)
})

const filteredTransactions = computed(() => {
  if (!searchQuery.value) return filteredByTime.value
  const q = searchQuery.value.toLowerCase()
  return filteredByTime.value.filter(e =>
    e.description.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
  )
})

const groupedTransactions = computed(() => {
  const groups: { date: string; label: string; transactions: Expense[] }[] = []
  const h = hoy(), a = ayer()
  for (const tx of filteredTransactions.value) {
    const last = groups[groups.length - 1]
    if (last && last.date === tx.date) {
      last.transactions.push(tx)
    } else {
      const label = tx.date === h ? 'Hoy' : tx.date === a ? 'Ayer' : fechaLarga(tx.date)
      groups.push({ date: tx.date, label, transactions: [tx] })
    }
  }
  return groups
})

const periodExpenseTotal = computed(() =>
  filteredByTime.value
    .filter(e => (e.type || 'expense') === 'expense')
    .reduce((sum, e) => sum + Number(e.amount), 0)
)
const periodIncomeTotal = computed(() =>
  filteredByTime.value
    .filter(e => (e.type || 'expense') === 'income')
    .reduce((sum, e) => sum + Number(e.amount), 0)
)
const periodNet = computed(() => periodIncomeTotal.value - periodExpenseTotal.value)

const etiquetaPeriodo = computed(() => ({
  week: 'esta semana', month: 'este mes', year: 'este año', all: 'en total',
}[timePeriod.value]))

/* ─── Presupuestos más ajustados (tarjeta) ─── */
const presupuestosTop = computed(() => {
  const compartido = listFilter.value === 'shared'
  return budgets.value
    .filter(b => b.is_shared === compartido && (compartido || b.owner_id === user.value?.id))
    .map(b => estadoPresupuesto(b, expenses.value, new Date()))
    .sort((a, b) => (a.budget.category === TOTAL ? -1 : b.budget.category === TOTAL ? 1 : b.porcentaje - a.porcentaje))
    .slice(0, 3)
})

/* ─── Gráfico (semanas del mes) ─── */
const chartBars = computed(() => {
  const bars = [0, 0, 0, 0, 0]
  filteredByTime.value
    .filter(e => (e.type || 'expense') === 'expense')
    .forEach(e => {
      const dia = Number(e.date.slice(8, 10))
      bars[Math.min(4, Math.floor((dia - 1) / 7))] += Number(e.amount)
    })
  const max = Math.max(...bars, 1)
  return bars.map(v => ({ height: Math.max(5, (v / max) * 100), value: v }))
})
const hasData = computed(() => filteredByTime.value.length > 0)

/* ─── Entrada por voz ─── */
const startVoiceInput = () => {
  const w = window as any
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!SR) {
    alert('Este navegador no permite dictar.')
    return
  }
  const recognition = new SR()
  recognition.lang = 'es-EC'
  recognition.interimResults = false
  isListening.value = true

  recognition.onresult = (event: any) => {
    parseVoiceInput(event.results[0][0].transcript)
    isListening.value = false
  }
  recognition.onerror = () => { isListening.value = false }
  recognition.onend = () => { isListening.value = false }
  recognition.start()
}

// "gasté 12,50 en almuerzo" · "me pagaron 500 de sueldo"
const parseVoiceInput = (text: string) => {
  const amountMatch = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:d[oó]lares?|\$)?/i)
  const amount = amountMatch?.[1] ? parseFloat(amountMatch[1].replace(',', '.')) : undefined
  const isIncome = /(?:me pagaron|recib[ií]|cobr[eé]|gan[eé]|ingreso|sueldo|salario)/i.test(text)

  let desc = text
    .replace(amountMatch?.[0] || '', '')
    .replace(/^(?:yo\s+)?(?:gast[eé]|pagu[eé]|compr[eé]|me pagaron|recib[ií]|cobr[eé]|gan[eé])\s*/i, '')
    .replace(/^(?:en|de|por|para)\s+/i, '')
    .trim()
  if (!desc) desc = text

  abrirNuevo({
    description: desc.charAt(0).toUpperCase() + desc.slice(1),
    amount,
    type: isIncome ? 'income' : 'expense',
  })
}

/* ─── Inicio ─── */
onMounted(async () => {
  await waitForAuth()
  if (!user.value) return
  await loadProfile(user.value.id)
  await loadPartner(user.value.id)
  await Promise.all([loadAccounts(), loadExpenses(), loadBudgets(), loadApiKey(user.value.id)])
  if (partner.value) {
    const partnerId = partner.value.user_a === user.value.id ? partner.value.user_b : partner.value.user_a
    if (partnerId) await loadProfile(partnerId)
  }
  // El atajo puede abrir .../finances?clasificar=1 para preguntarte de una
  if (route.query.clasificar) {
    router.replace({ query: {} })
    abrirClasificar()
  }
})

/* ─── Atajo de iPhone ─── */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const appUrl = `${window.location.origin}${import.meta.env.BASE_URL}finances?clasificar=1`

const copiar = (texto: string | null | undefined) => { if (texto) navigator.clipboard.writeText(texto) }

const handleGenerateApiKey = async () => {
  if (!user.value) return
  await generateApiKey(user.value.id)
}

/* ─── Pareja y cuentas ─── */
const handleCreateInvite = async () => {
  partnerError.value = ''
  if (!user.value) return
  try { await createPartnerInvite(user.value.id) }
  catch (e: any) { partnerError.value = e.message }
}

const handleJoinPartner = async () => {
  partnerError.value = ''
  if (!partnerInviteCode.value.trim() || !user.value) return
  try { await joinPartner(partnerInviteCode.value.trim()) }
  catch (e: any) { partnerError.value = e.message }
}

const handleRemovePartner = async () => {
  if (confirm('¿Desvincular a tu pareja de finanzas?')) await removePartner()
}

const handleAddAccount = async () => {
  if (!newAccountName.value.trim() || !user.value) return
  await addAccount(user.value.id, newAccountName.value.trim(), newAccountBalance.value, listFilter.value === 'shared')
  newAccountName.value = ''
  newAccountBalance.value = 0
  showAccountForm.value = false
}

const handleRemoveAccount = async (id: string, name: string) => {
  if (confirm(`¿Borrar la cuenta "${name}"?`)) await removeAccount(id)
}

const isOwner = (ownerId: string) => ownerId === user.value?.id

const getAccountName = (accountId: string | null) => {
  if (!accountId) return ''
  return accounts.value.find(a => a.id === accountId)?.name ?? ''
}

const getPaymentMethodLabel = (method: string | undefined) => {
  if (!method || method === 'other') return ''
  const labels: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', apple_pay: 'Apple Pay', bank_transfer: 'Transferencia' }
  return labels[method] || method
}
</script>

<template>
  <div class="finances-page">
    <!-- Búsqueda -->
    <div v-if="showSearch" class="search-bar">
      <input v-model="searchQuery" type="text" placeholder="Buscar movimientos..." autofocus />
      <button @click="showSearch = false; searchQuery = ''">Cancelar</button>
    </div>

    <!-- Encabezado -->
    <header class="top-header">
      <button class="icon-btn" @click="router.push('/home')" aria-label="Inicio">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      <button class="icon-btn settings-btn" @click="showSettings = true" aria-label="Ajustes">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
    </header>

    <!-- Total -->
    <section class="total-section">
      <span class="total-label">Saldo en cuentas</span>
      <div class="total-amount-row">
        <span class="balance-dot" :class="{ negative: accountsTotal <= 0, positive: accountsTotal > 0 }"></span>
        <span class="big-amount">{{ Math.abs(Math.floor(accountsTotal)).toLocaleString('es-EC') }}</span>
        <span class="currency-symbol">$</span>
      </div>
      <div class="period-net" :class="{ negative: periodNet < 0, positive: periodNet > 0 }">
        {{ periodNet >= 0 ? '+' : '-' }}${{ dinero(periodNet) }} {{ etiquetaPeriodo }}
      </div>
    </section>

    <!-- Por clasificar -->
    <button v-if="pendingReview.length" class="pendientes" @click="abrirClasificar">
      <span class="pend-num">{{ pendingReview.length }}</span>
      <span>
        <strong>{{ pendingReview.length === 1 ? 'Un gasto' : `${pendingReview.length} gastos` }} por clasificar</strong>
        <small>Dime en qué gastaste para descontarlo de tu presupuesto</small>
      </span>
      <span class="pend-go">›</span>
    </button>

    <!-- Gastado / ingresado -->
    <div class="amount-toggle">
      <span class="amount-pill active">−${{ dinero(periodExpenseTotal) }}</span>
      <span class="amount-pill">+${{ dinero(periodIncomeTotal) }}</span>
    </div>

    <!-- Filtros -->
    <div class="filters-row">
      <div class="filter-dropdown">
        <select v-model="timePeriod">
          <option value="week">esta semana</option>
          <option value="month">este mes</option>
          <option value="year">este año</option>
          <option value="all">todo</option>
        </select>
      </div>
      <span class="filter-sep">en</span>
      <div class="filter-dropdown">
        <select v-model="listFilter">
          <option value="personal">mi lista</option>
          <option value="shared">lista compartida</option>
        </select>
      </div>
    </div>

    <!-- Presupuestos -->
    <section class="budget-card" @click="router.push('/presupuestos')">
      <div class="budget-card-head">
        <span>Presupuestos</span>
        <span class="budget-link">{{ presupuestosTop.length ? 'Ver todos ›' : 'Crear ›' }}</span>
      </div>
      <p v-if="!presupuestosTop.length" class="muted budget-empty">
        Pon cuánto quieres gastar al mes o al año en cada cosa y la app te lo irá descontando.
      </p>
      <div v-for="e in presupuestosTop" :key="e.budget.id" class="budget-row" :class="e.nivel">
        <div class="budget-row-top">
          <span>{{ e.budget.category === TOTAL ? '💰 Total' : `${iconoDe(e.budget.category)} ${e.budget.category}` }}
            <small>{{ e.budget.period === 'anual' ? 'año' : 'mes' }}</small></span>
          <span>{{ e.restante >= 0 ? `quedan $${dinero(e.restante)}` : `pasado $${dinero(-e.restante)}` }}</span>
        </div>
        <div class="budget-bar"><div :style="{ width: Math.min(100, e.porcentaje * 100) + '%' }"></div></div>
      </div>
    </section>

    <!-- Gráfico -->
    <div class="chart-section">
      <div class="chart-bars">
        <div v-for="(bar, i) in chartBars" :key="i" class="chart-bar-wrap">
          <div
            class="chart-bar"
            :class="{ empty: !hasData }"
            :style="{ height: (hasData ? bar.height : [85, 45, 65, 55, 40][i]) + '%' }"
          ></div>
        </div>
      </div>
    </div>

    <!-- Movimientos -->
    <section class="transactions-section">
      <div v-if="!filteredTransactions.length" class="empty-state">
        <p>Tus movimientos aparecerán aquí</p>
      </div>
      <div v-else class="transaction-list">
        <template v-for="group in groupedTransactions" :key="group.date">
          <div class="date-header">{{ group.label }}</div>
          <div v-for="tx in group.transactions" :key="tx.id" class="transaction-item"
            :class="{ revisar: tx.needs_review, editable: isOwner(tx.owner_id) }" @click="abrirMovimiento(tx)">
            <div class="tx-left">
              <div class="tx-icon-wrap" :class="tx.type || 'expense'">
                <span v-if="(tx.type || 'expense') === 'expense'" class="tx-emoji">{{ iconoDe(tx.category) }}</span>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
              </div>
              <div class="tx-info">
                <strong>{{ tx.description }}</strong>
                <div class="tx-meta">
                  <span class="tx-category" :class="{ pendiente: tx.needs_review }">{{ tx.needs_review ? 'Toca para clasificar' : tx.category }}</span>
                  <span v-if="tx.payment_method && tx.payment_method !== 'other'" class="tx-method">{{ getPaymentMethodLabel(tx.payment_method) }}</span>
                  <span v-if="getAccountName(tx.account_id)" class="tx-account">{{ getAccountName(tx.account_id) }}</span>
                  <span v-if="!isOwner(tx.owner_id)" class="tx-account">{{ getDisplayName(tx.owner_id) }}</span>
                </div>
              </div>
            </div>
            <div class="tx-right">
              <span class="tx-amount" :class="tx.type || 'expense'">
                {{ (tx.type || 'expense') === 'income' ? '+' : '-' }}${{ dinero(Number(tx.amount)) }}
              </span>
            </div>
          </div>
        </template>
      </div>
    </section>

    <!-- Barra inferior -->
    <div class="bottom-toolbar">
      <div class="toolbar-left">
        <button class="toolbar-add-btn" @click="abrirNuevo()" aria-label="Nuevo movimiento">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button class="toolbar-search-btn" @click="showSearch = !showSearch" aria-label="Buscar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        </button>
      </div>
      <button class="mic-btn" :class="{ listening: isListening }" @click="startVoiceInput" aria-label="Dictar">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18.5v3.5M8 22h8"/></svg>
      </button>
    </div>

    <!-- Ajustes -->
    <div v-if="showSettings" class="drawer-overlay" @click.self="showSettings = false">
      <div class="drawer">
        <div class="drawer-header">
          <h2>Ajustes</h2>
          <button class="icon-btn" @click="showSettings = false">&times;</button>
        </div>

        <!-- Cuentas -->
        <div class="drawer-section">
          <div class="section-header">
            <h3>Cuentas</h3>
            <button class="add-small-btn" @click="showAccountForm = !showAccountForm">+</button>
          </div>
          <div v-if="showAccountForm" class="account-form">
            <input v-model="newAccountName" type="text" placeholder="Nombre (ej: Pichincha)" class="drawer-input" />
            <input v-model.number="newAccountBalance" type="number" step="0.01" placeholder="Saldo actual" class="drawer-input" />
            <button class="primary-btn" @click="handleAddAccount">Agregar cuenta</button>
          </div>
          <div v-for="acc in filteredAccounts" :key="acc.id" class="account-item">
            <div>
              <strong>{{ acc.name }}</strong>
              <small v-if="!isOwner(acc.owner_id)" class="partner-tag">{{ getDisplayName(acc.owner_id) }}</small>
            </div>
            <div class="account-right">
              <span :class="{ negative: Number(acc.balance) < 0 }">${{ dinero(Number(acc.balance)) }}</span>
              <button v-if="isOwner(acc.owner_id)" class="remove-btn" @click="handleRemoveAccount(acc.id, acc.name)">&times;</button>
            </div>
          </div>
          <p v-if="!filteredAccounts.length" class="muted">Todavía no hay cuentas.</p>
        </div>

        <!-- Atajo -->
        <div class="drawer-section">
          <h3>Atajo de iPhone (Apple Pay)</h3>
          <p class="muted">Cada vez que pagas con Apple Pay, el atajo registra el gasto, te pregunta en qué fue y te avisa cuánto te queda del presupuesto.</p>
          <div v-if="apiKey">
            <p class="muted" style="margin-bottom:4px">Tu API key (no la compartas):</p>
            <div class="code-row">
              <code class="api-key-code">{{ apiKey.slice(0, 8) }}...{{ apiKey.slice(-4) }}</code>
              <button @click="copiar(apiKey)">Copiar</button>
            </div>
            <div class="shortcut-instructions">
              <ol class="setup-steps">
                <li>App <strong>Atajos</strong> → pestaña <strong>Automatización</strong> → <strong>+</strong> → <strong>Transacción</strong>. Elige tus tarjetas y marca <strong>Ejecutar inmediatamente</strong>.</li>
                <li>Acción <strong>Elegir del menú</strong> con el texto “¿En qué gastaste?” y estas opciones:
                  <code>Comida, Supermercado, Transporte, Servicios, Arriendo, Entretenimiento, Salud, Compras, Educación, Suscripciones, Otros, Después</code>.
                  En cada opción pon <strong>Texto</strong> con el mismo nombre (en “Después” déjalo vacío).</li>
                <li>Acción <strong>Obtener contenido de URL</strong>:
                  <br/>URL: <code>{{ supabaseUrl }}/rest/v1/rpc/add_expense_via_api_key</code>
                  <button class="copy-inline" @click="copiar(`${supabaseUrl}/rest/v1/rpc/add_expense_via_api_key`)">copiar</button>
                  <br/>Método: <strong>POST</strong>
                  <br/>Encabezados: <code>apikey</code> = <code>{{ supabaseAnonKey?.slice(0, 12) }}...</code>
                  <button class="copy-inline" @click="copiar(supabaseAnonKey)">copiar</button>
                  y <code>Content-Type</code> = <code>application/json</code>
                  <br/>Cuerpo JSON:
                  <code>p_api_key</code> (texto) = tu API key
                  <button class="copy-inline" @click="copiar(apiKey)">copiar</button>,
                  <code>p_amount</code> (número) = <strong>Importe</strong>,
                  <code>p_merchant</code> (texto) = <strong>Comercio</strong>,
                  <code>p_category</code> (texto) = <strong>Elemento elegido del menú</strong>,
                  y si quieres que descuente del saldo <code>p_account_name</code> (texto) = el nombre exacto de tu cuenta.</li>
                <li>Acción <strong>Obtener valor del diccionario</strong>: clave <code>mensaje</code>.</li>
                <li>Acción <strong>Mostrar notificación</strong> con ese valor. Te dirá, por ejemplo, “$12,50 en Comida. Te quedan $87,50 de $100 este mes.”</li>
              </ol>
              <p class="muted" style="margin-top:8px">
                Si eliges “Después”, el gasto queda <strong>por clasificar</strong> y la app te lo pregunta al abrirla.
                Para abrirla directo ahí, agrega al final <strong>Abrir URL</strong>:
                <code>{{ appUrl }}</code> <button class="copy-inline" @click="copiar(appUrl)">copiar</button>
              </p>
            </div>
          </div>
          <div v-else>
            <button class="primary-btn" @click="handleGenerateApiKey">Generar API key</button>
          </div>
        </div>

        <!-- Pareja -->
        <div class="drawer-section">
          <h3>Finanzas en pareja</h3>
          <div v-if="partner && partner.status === 'active'" class="partner-active">
            <p>Vinculado con {{ getDisplayName((partner.user_a === user?.id ? partner.user_b : partner.user_a) ?? '') }}</p>
            <button class="danger-btn" @click="handleRemovePartner">Desvincular</button>
          </div>
          <div v-else-if="partner && partner.status === 'pending'">
            <p class="muted">Esperando a tu pareja. Comparte este código:</p>
            <div class="code-row">
              <code>{{ partner.invite_code }}</code>
              <button @click="copiar(partner.invite_code)">Copiar</button>
            </div>
          </div>
          <div v-else>
            <div class="mini-tabs">
              <button :class="{ active: partnerMode === 'join' }" @click="partnerMode = 'join'">Unirme</button>
              <button :class="{ active: partnerMode === 'create' }" @click="partnerMode = 'create'">Invitar</button>
            </div>
            <div v-if="partnerMode === 'join'">
              <input v-model="partnerInviteCode" type="text" placeholder="Código de invitación" class="drawer-input" />
              <button class="primary-btn" @click="handleJoinPartner">Unirme</button>
            </div>
            <div v-else>
              <p class="muted">Crea un código para compartir.</p>
              <button class="primary-btn" @click="handleCreateInvite">Generar código</button>
            </div>
            <p v-if="partnerError" class="error">{{ partnerError }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Hoja de movimiento -->
    <MovimientoSheet
      v-if="hoja && user"
      :modo="hoja.modo"
      :movimiento="hoja.movimiento"
      :prellenado="hoja.prellenado"
      :pendientes-restantes="colaClasificar.length"
      :cuentas="accounts"
      :presupuestos="budgets"
      :gastos="expenses"
      :user-id="user.id"
      :compartido="listFilter === 'shared'"
      @guardar="onGuardar"
      @saltar="onSaltar"
      @borrar="onBorrar"
      @cerrar="hoja = null"
    />
  </div>
</template>

<style scoped>
.finances-page {
  padding: 20px 16px;
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
  min-height: 100vh;
}

/* ── Header ── */
.top-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28px;
}
.icon-btn {
  background: none;
  border: none;
  color: #8a8a9a;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.settings-btn {
  background: #1a1a2e;
  border-radius: 50%;
  width: 44px;
  height: 44px;
}

/* ── Total ── */
.total-section { margin-bottom: 16px; }
.period-net {
  font-size: 0.9rem;
  margin-top: 6px;
  color: #6a6a8a;
}
.period-net.negative { color: #ff6b6b; }
.period-net.positive { color: #4ecdc4; }
.total-label {
  font-size: 0.95rem;
  color: #6a6a8a;
  display: block;
  margin-bottom: 4px;
}
.total-amount-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.balance-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}
.balance-dot.negative { background: #ff6b6b; }
.balance-dot.positive { background: #4ecdc4; }
.big-amount {
  font-size: 4rem;
  font-weight: 800;
  color: #f0f0f0;
  line-height: 1;
  letter-spacing: -2px;
}
.currency-symbol {
  font-size: 1.8rem;
  color: #6a6a8a;
  font-weight: 300;
  align-self: flex-end;
  margin-bottom: 8px;
}

/* ── Amount Toggle ── */
.amount-toggle {
  display: inline-flex;
  background: #1a1a2e;
  border-radius: 20px;
  padding: 3px;
  margin-bottom: 16px;
}
.amount-pill {
  padding: 8px 16px;
  border: none;
  border-radius: 18px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  background: transparent;
  color: #6a6a8a;
  transition: all 0.2s;
}
.amount-pill.active {
  background: #2a2a4a;
  color: #f0f0f0;
}

/* ── Filters ── */
.filters-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}
.filter-dropdown select {
  background: none;
  border: 1px solid #2a2a4a;
  color: #e0e0e0;
  padding: 6px 28px 6px 12px;
  border-radius: 12px;
  font-size: 0.85rem;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236a6a8a' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}
.filter-dropdown select option {
  background: #1a1a2e;
  color: #e0e0e0;
}
.filter-sep {
  color: #6a6a8a;
  font-size: 0.85rem;
}

/* ── Chart ── */
.chart-section {
  margin-bottom: 20px;
  padding: 0 8px;
}
.chart-bars {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  height: 180px;
}
.chart-bar-wrap {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: flex-end;
}
.chart-bar {
  width: 100%;
  background: linear-gradient(180deg, #2a2a4a 0%, #1a1a2e 100%);
  border-radius: 14px 14px 8px 8px;
  transition: height 0.4s ease;
  min-height: 8px;
}
.chart-bar.empty {
  background: linear-gradient(180deg, #1e1e35 0%, #16162a 100%);
  opacity: 0.4;
}

/* ── Apple Pay ── */
.apple-pay-banner {
  margin-bottom: 16px;
  cursor: pointer;
}
.apple-pay-content {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #1a1a2e 0%, #1e2a3e 100%);
  border: 1px solid #2a3a5a;
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 0.85rem;
  color: #a0b0c0;
}
.apple-icon { color: #f0f0f0; }
.dismiss { margin-left: auto; color: #6a6a8a; font-size: 1.1rem; }

/* ── Transactions ── */
.transactions-section { margin-bottom: 20px; }
.empty-state {
  text-align: center;
  padding: 32px 20px;
  color: #6a6a8a;
  font-size: 1rem;
}
.date-header {
  font-size: 0.8rem;
  font-weight: 600;
  color: #6a6a8a;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 12px 4px 6px;
}
.tx-account {
  background: rgba(108, 99, 255, 0.1);
  color: #8a8aff;
  padding: 1px 8px;
  border-radius: 6px;
}
.transaction-list { display: flex; flex-direction: column; gap: 6px; }
.transaction-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #16213e;
  border-radius: 14px;
  padding: 14px;
}
.tx-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}
.tx-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.tx-icon-wrap.expense { background: rgba(255, 107, 107, 0.15); color: #ff6b6b; }
.tx-icon-wrap.income { background: rgba(78, 205, 196, 0.15); color: #4ecdc4; }
.tx-info { min-width: 0; }
.tx-info strong {
  display: block;
  color: #e0e0e0;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tx-meta {
  display: flex;
  gap: 6px;
  margin-top: 3px;
  font-size: 0.75rem;
  color: #6a6a8a;
  flex-wrap: wrap;
}
.tx-category {
  background: rgba(108, 99, 255, 0.15);
  color: #6c63ff;
  padding: 1px 8px;
  border-radius: 6px;
}
.tx-method {
  background: rgba(78, 205, 196, 0.1);
  color: #4ecdc4;
  padding: 1px 8px;
  border-radius: 6px;
}
.tx-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.tx-amount { font-weight: 600; font-size: 0.95rem; }
.tx-amount.expense { color: #ff6b6b; }
.tx-amount.income { color: #4ecdc4; }
.tx-delete {
  background: none;
  border: none;
  color: #555;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px;
}

/* ── Bottom Toolbar ── */
.bottom-toolbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(180deg, transparent 0%, #0f0f1a 30%);
  padding-top: 32px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.toolbar-add-btn, .toolbar-search-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s;
}
.toolbar-add-btn {
  background: #1a1a2e;
  color: #e0e0e0;
  border: 1px solid #2a2a4a;
}
.toolbar-search-btn {
  background: none;
  color: #6a6a8a;
}
.toolbar-add-btn:active, .toolbar-search-btn:active { transform: scale(0.92); }
.mic-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: #ff6b6b;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(255, 107, 107, 0.4);
  transition: all 0.2s;
}
.mic-btn:active { transform: scale(0.92); }
.mic-btn.listening {
  animation: pulse 1.5s infinite;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.7); }
  70% { box-shadow: 0 0 0 16px rgba(255, 107, 107, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 107, 107, 0); }
}

/* ── Search ── */
.search-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  animation: slideDown 0.2s ease;
}
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
.search-bar input {
  flex: 1;
  padding: 10px 14px;
  background: #1a1a2e;
  border: 1px solid #2a2a4a;
  border-radius: 12px;
  color: #e0e0e0;
  font-size: 0.95rem;
}
.search-bar input:focus { outline: none; border-color: #6c63ff; }
.search-bar button {
  padding: 10px 14px;
  background: none;
  border: none;
  color: #6c63ff;
  font-size: 0.9rem;
  cursor: pointer;
}

/* ── Settings Drawer ── */
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
  display: flex;
  justify-content: flex-end;
}
.drawer {
  width: 85%;
  max-width: 380px;
  background: #12121f;
  height: 100%;
  padding: calc(24px + env(safe-area-inset-top)) 24px calc(24px + env(safe-area-inset-bottom));
  overflow-y: auto;
  animation: slideIn 0.25s ease;
}
@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.drawer-header h2 { color: #e0e0e0; margin: 0; font-size: 1.3rem; }
.drawer-section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #1e1e35;
}
.drawer-section h3 {
  color: #8a8a9a;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 12px;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.add-small-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #6c63ff;
  color: white;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.drawer-input {
  display: block;
  width: 100%;
  padding: 10px 12px;
  background: #1a1a2e;
  border: 1px solid #2a2a4a;
  border-radius: 10px;
  color: #e0e0e0;
  font-size: 0.95rem;
  margin-bottom: 8px;
  box-sizing: border-box;
}
.drawer-input:focus { outline: none; border-color: #6c63ff; }
.primary-btn {
  width: 100%;
  padding: 10px;
  background: #6c63ff;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 0.95rem;
  cursor: pointer;
  margin-top: 4px;
}
.danger-btn {
  width: 100%;
  padding: 10px;
  border: 1px solid #ff6b6b;
  border-radius: 10px;
  background: transparent;
  color: #ff6b6b;
  cursor: pointer;
}
.partner-active p { color: #4ecdc4; font-weight: 600; margin: 0 0 12px; }
.code-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}
.code-row code {
  background: #1a1a2e;
  padding: 8px 14px;
  border-radius: 8px;
  color: #6c63ff;
  letter-spacing: 2px;
  font-size: 1rem;
}
.code-row button {
  padding: 8px 14px;
  border: 1px solid #2a2a4a;
  border-radius: 8px;
  background: #1a1a2e;
  color: #e0e0e0;
  cursor: pointer;
}
.mini-tabs {
  display: flex;
  background: #1a1a2e;
  border-radius: 10px;
  padding: 3px;
  margin-bottom: 12px;
}
.mini-tabs button {
  flex: 1;
  padding: 8px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: #6a6a8a;
  cursor: pointer;
  font-size: 0.85rem;
}
.mini-tabs button.active { background: #6c63ff; color: white; }
.muted { color: #6a6a8a; font-size: 0.9rem; margin: 0 0 8px; }
.error { color: #ff6b6b; font-size: 0.85rem; margin-top: 8px; }
.account-form {
  margin-bottom: 12px;
  padding: 12px;
  background: #16213e;
  border-radius: 10px;
}
.account-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background: #1a1a2e;
  border-radius: 10px;
  margin-bottom: 6px;
}
.account-item strong { color: #e0e0e0; font-size: 0.9rem; }
.account-right {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #e0e0e0;
  font-size: 0.9rem;
}
.partner-tag {
  background: rgba(108, 99, 255, 0.15);
  color: #6c63ff;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 0.7rem;
  margin-left: 6px;
}
.remove-btn {
  background: none;
  border: none;
  color: #555;
  font-size: 1.1rem;
  cursor: pointer;
}
.negative { color: #ff6b6b; }
.api-key-code {
  background: #1a1a2e;
  padding: 8px 14px;
  border-radius: 8px;
  color: #4ecdc4;
  letter-spacing: 1px;
  font-size: 0.85rem;
}
.shortcut-instructions ol {
  padding-left: 16px;
  margin: 0;
}
.setup-steps li {
  color: #8a8a9a;
  font-size: 0.8rem;
  margin-bottom: 6px;
  line-height: 1.5;
}
.setup-steps code {
  background: #1a1a2e;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
  color: #6c63ff;
  word-break: break-all;
}
.setup-steps strong { color: #e0e0e0; }
.copy-inline {
  background: none;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #6c63ff;
  font-size: 0.7rem;
  padding: 1px 6px;
  cursor: pointer;
}

/* ── Add Transaction Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
}
.modal-sheet {
  background: #16213e;
  border-radius: 24px 24px 0 0;
  padding: 20px 24px 32px;
  width: 100%;
  max-width: 500px;
  animation: sheetUp 0.3s ease;
}
@keyframes sheetUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.sheet-handle {
  width: 36px;
  height: 4px;
  background: #2a2a4a;
  border-radius: 2px;
  margin: 0 auto 16px;
}
.modal-sheet h2 { color: #e0e0e0; margin: 0 0 16px; font-size: 1.2rem; }
.type-toggle {
  display: flex;
  background: #1a1a2e;
  border-radius: 12px;
  padding: 3px;
  margin-bottom: 16px;
}
.type-toggle button {
  flex: 1;
  padding: 10px;
  border: none;
  background: transparent;
  border-radius: 10px;
  color: #6a6a8a;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
}
.type-toggle button.active:first-child { background: #ff6b6b; color: white; }
.type-toggle button.active:last-child { background: #4ecdc4; color: white; }
.modal-sheet label {
  display: block;
  margin-bottom: 12px;
  font-size: 0.85rem;
  color: #8a8a9a;
}
.modal-sheet input, .modal-sheet select {
  display: block;
  width: 100%;
  padding: 10px 12px;
  background: #1a1a2e;
  border: 1px solid #2a2a4a;
  border-radius: 10px;
  color: #e0e0e0;
  font-size: 0.95rem;
  margin-top: 4px;
  box-sizing: border-box;
}
.modal-sheet input:focus, .modal-sheet select:focus { outline: none; border-color: #6c63ff; }
.form-row { display: flex; gap: 12px; }
.form-row label { flex: 1; }
.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}
.form-actions button {
  flex: 1;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #2a2a4a;
  background: #1a1a2e;
  color: #e0e0e0;
  font-size: 0.95rem;
  cursor: pointer;
}
.form-actions .primary {
  background: linear-gradient(135deg, #3a0ca3, #6c63ff);
  color: white;
  border: none;
}

/* ── Por clasificar ── */
.pendientes {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; cursor: pointer;
  background: rgba(255, 179, 71, 0.12); border: 1px solid rgba(255, 179, 71, 0.4);
  border-radius: 16px; padding: 12px 14px; margin-bottom: 16px; color: #f0f0f0;
}
.pendientes strong { display: block; font-size: 0.95rem; }
.pendientes small { color: #c0a070; font-size: 0.8rem; }
.pend-num {
  min-width: 32px; height: 32px; border-radius: 50%; background: #ffb347; color: #1a1a2e;
  display: flex; align-items: center; justify-content: center; font-weight: 800;
}
.pend-go { margin-left: auto; color: #ffb347; font-size: 1.4rem; }

/* ── Tarjeta de presupuestos ── */
.budget-card { background: #16213e; border-radius: 16px; padding: 14px; margin-bottom: 18px; cursor: pointer; }
.budget-card-head { display: flex; justify-content: space-between; color: #e0e0e0; font-weight: 600; margin-bottom: 8px; }
.budget-link { color: #6c63ff; font-weight: 500; font-size: 0.85rem; }
.budget-empty { margin: 0; }
.budget-row { margin-top: 10px; }
.budget-row-top { display: flex; justify-content: space-between; font-size: 0.85rem; color: #c0c0d0; }
.budget-row-top small { color: #6a6a8a; margin-left: 4px; }
.budget-row.pasado .budget-row-top span:last-child { color: #ff6b6b; }
.budget-bar { height: 6px; background: #2a2a4a; border-radius: 3px; margin-top: 6px; overflow: hidden; }
.budget-bar div { height: 100%; background: #4ecdc4; border-radius: 3px; }
.budget-row.alerta .budget-bar div { background: #ffb347; }
.budget-row.pasado .budget-bar div { background: #ff6b6b; }

/* ── Movimientos ── */
.transaction-item.editable { cursor: pointer; }
.transaction-item.revisar { border: 1px dashed rgba(255, 179, 71, 0.5); }
.tx-category.pendiente { color: #ffb347; }
.tx-emoji { font-size: 1rem; line-height: 1; }
span.amount-pill { display: inline-block; }
</style>
