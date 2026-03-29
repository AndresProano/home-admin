<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useFinances } from '@/composables/useFinances'

const router = useRouter()
const { user } = useAuth()
const {
  accounts, expenses, partner, apiKey,
  personalBalance, sharedBalance,
  loadPartner, createPartnerInvite, joinPartner, removePartner,
  loadAccounts, loadExpenses, addAccount, removeAccount, addExpense, removeExpense,
  loadApiKey, generateApiKey,
} = useFinances()

/* ─── View state ─── */
const timePeriod = ref<'week' | 'month' | 'year' | 'all'>('month')
const listFilter = ref<'personal' | 'shared'>('personal')
const showSettings = ref(false)
const showAddForm = ref(false)
const showSearch = ref(false)
const searchQuery = ref('')

/* ─── Apple Pay ─── */
const isApplePayAvailable = ref(false)
const showApplePayBanner = ref(false)

/* ─── Voice ─── */
const isListening = ref(false)

/* ─── Partner ─── */
const partnerMode = ref<'create' | 'join'>('join')
const partnerInviteCode = ref('')
const partnerError = ref('')

/* ─── Account form ─── */
const showAccountForm = ref(false)
const newAccountName = ref('')
const newAccountBalance = ref(0)

/* ─── Transaction form ─── */
const newExpDesc = ref('')
const newExpAmount = ref<number | null>(null)
const newExpCategory = ref('Food')
const newExpDate = ref(new Date().toISOString().slice(0, 10))
const newExpAccount = ref<string | null>(null)
const newExpType = ref<'expense' | 'income'>('expense')
const newExpPaymentMethod = ref('cash')

const categories = ['Food', 'Transport', 'Utilities', 'Rent', 'Entertainment', 'Health', 'Shopping', 'Education', 'Other']

const paymentMethods = computed(() => {
  const methods = [
    { value: 'cash', label: 'Cash' },
    { value: 'card', label: 'Card' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'other', label: 'Other' },
  ]
  if (isApplePayAvailable.value) {
    methods.splice(1, 0, { value: 'apple_pay', label: 'Apple Pay' })
  }
  return methods
})

/* ─── Computed ─── */
const currentBalance = computed(() =>
  periodIncomeTotal.value - periodExpenseTotal.value
)

const filteredByList = computed(() =>
  expenses.value.filter(e => listFilter.value === 'shared' ? e.is_shared : !e.is_shared)
)

const getTimeStart = () => {
  const now = new Date()
  switch (timePeriod.value) {
    case 'week': {
      const d = new Date(now)
      d.setDate(d.getDate() - d.getDay())
      d.setHours(0, 0, 0, 0)
      return d.toISOString().slice(0, 10)
    }
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    case 'year': return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
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

const filteredAccounts = computed(() =>
  accounts.value.filter(a => listFilter.value === 'shared' ? a.is_shared : !a.is_shared)
)

/* ─── Chart ─── */
const chartBars = computed(() => {
  const bars = [0, 0, 0, 0, 0]
  filteredByTime.value
    .filter(e => (e.type || 'expense') === 'expense')
    .forEach(e => {
      const d = new Date(e.date)
      const week = Math.min(4, Math.floor((d.getDate() - 1) / 7))
      bars[week] += Number(e.amount)
    })
  const max = Math.max(...bars, 1)
  return bars.map(v => ({ height: Math.max(5, (v / max) * 100), value: v }))
})

const hasData = computed(() => filteredByTime.value.length > 0)

/* ─── Apple Pay Detection ─── */
const detectApplePay = () => {
  try {
    const w = window as any
    if (w.ApplePaySession && w.ApplePaySession.canMakePayments()) {
      isApplePayAvailable.value = true
      showApplePayBanner.value = true
      newExpPaymentMethod.value = 'apple_pay'
    }
  } catch { /* not available */ }
}

/* ─── Voice Input ─── */
const startVoiceInput = () => {
  const w = window as any
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!SR) {
    alert('Voice input not supported in this browser.')
    return
  }
  const recognition = new SR()
  recognition.lang = 'en-US'
  recognition.interimResults = false
  isListening.value = true

  recognition.onresult = (event: any) => {
    const text = event.results[0][0].transcript
    parseVoiceInput(text)
    isListening.value = false
  }
  recognition.onerror = () => { isListening.value = false }
  recognition.onend = () => { isListening.value = false }
  recognition.start()
}

const parseVoiceInput = (text: string) => {
  const amountMatch = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:dollars?|bucks?|\$)?/i)
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : null
  const isIncome = /(?:received|earned|got|income|salary|payment received)/i.test(text)

  let desc = text
    .replace(amountMatch?.[0] || '', '')
    .replace(/^(?:i\s+)?(?:spent|paid|bought|earned|received|got)\s+/i, '')
    .replace(/(?:on|for|at)\s+/i, '')
    .trim()
  if (!desc) desc = text

  newExpDesc.value = desc.charAt(0).toUpperCase() + desc.slice(1)
  if (amount) newExpAmount.value = amount
  newExpType.value = isIncome ? 'income' : 'expense'
  showAddForm.value = true
}

/* ─── Lifecycle ─── */
onMounted(async () => {
  detectApplePay()
  if (user.value) {
    await loadPartner(user.value.id)
    await Promise.all([loadAccounts(), loadExpenses(), loadApiKey(user.value.id)])
  }
})

const handleGenerateApiKey = async () => {
  if (!user.value) return
  await generateApiKey(user.value.id)
}

const copyApiKey = () => {
  if (apiKey.value) navigator.clipboard.writeText(apiKey.value)
}

const copyAnonKey = () => {
  if (supabaseAnonKey) navigator.clipboard.writeText(supabaseAnonKey)
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/* ─── Handlers ─── */
const openAddForm = () => {
  newExpDesc.value = ''
  newExpAmount.value = null
  newExpCategory.value = 'Food'
  newExpDate.value = new Date().toISOString().slice(0, 10)
  newExpAccount.value = null
  newExpType.value = 'expense'
  newExpPaymentMethod.value = isApplePayAvailable.value ? 'apple_pay' : 'cash'
  showAddForm.value = true
}

const handleAddTransaction = async () => {
  if (!newExpDesc.value.trim() || !newExpAmount.value || newExpAmount.value <= 0 || !user.value) return
  await addExpense(user.value.id, {
    description: newExpDesc.value.trim(),
    amount: newExpAmount.value,
    category: newExpCategory.value,
    date: newExpDate.value,
    account_id: newExpAccount.value || null,
    is_shared: listFilter.value === 'shared',
    payment_method: newExpPaymentMethod.value,
    type: newExpType.value,
  })
  showAddForm.value = false
}

const handleRemoveExpense = async (id: string) => {
  if (confirm('Delete this transaction?')) await removeExpense(id)
}

const handleCreateInvite = async () => {
  partnerError.value = ''
  if (!user.value) return
  try { await createPartnerInvite(user.value.id) }
  catch (e: any) { partnerError.value = e.message }
}

const handleJoinPartner = async () => {
  partnerError.value = ''
  if (!partnerInviteCode.value.trim() || !user.value) return
  try { await joinPartner(partnerInviteCode.value.trim(), user.value.id) }
  catch (e: any) { partnerError.value = e.message }
}

const handleRemovePartner = async () => {
  if (confirm('Unlink your finance partner?')) await removePartner()
}

const copyPartnerCode = () => {
  if (partner.value) navigator.clipboard.writeText(partner.value.invite_code)
}

const handleAddAccount = async () => {
  if (!newAccountName.value.trim() || !user.value) return
  await addAccount(user.value.id, newAccountName.value.trim(), newAccountBalance.value, listFilter.value === 'shared')
  newAccountName.value = ''
  newAccountBalance.value = 0
  showAccountForm.value = false
}

const handleRemoveAccount = async (id: string, name: string) => {
  if (confirm(`Delete account "${name}"?`)) await removeAccount(id)
}

const isOwner = (ownerId: string) => ownerId === user.value?.id

const getPaymentMethodLabel = (method: string | undefined) => {
  if (!method || method === 'other') return ''
  const labels: Record<string, string> = { cash: 'Cash', card: 'Card', apple_pay: 'Apple Pay', bank_transfer: 'Transfer' }
  return labels[method] || method
}

const formatAmount = (n: number) =>
  Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
</script>

<template>
  <div class="finances-page">
    <!-- Search bar -->
    <div v-if="showSearch" class="search-bar">
      <input v-model="searchQuery" type="text" placeholder="Search transactions..." autofocus />
      <button @click="showSearch = false; searchQuery = ''">Cancel</button>
    </div>

    <!-- Header -->
    <header class="top-header">
      <button class="icon-btn" @click="router.push('/home')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      <button class="icon-btn settings-btn" @click="showSettings = true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
    </header>

    <!-- Total Section -->
    <section class="total-section">
      <span class="total-label">Total</span>
      <div class="total-amount-row">
        <span class="balance-dot" :class="{ negative: currentBalance <= 0, positive: currentBalance > 0 }"></span>
        <span class="big-amount">{{ Math.abs(Math.floor(currentBalance)).toLocaleString() }}</span>
        <span class="currency-symbol">$</span>
      </div>
    </section>

    <!-- Expense / Income amounts -->
    <div class="amount-toggle">
      <button class="amount-pill active">${{ formatAmount(periodExpenseTotal) }}</button>
      <button class="amount-pill">${{ formatAmount(periodIncomeTotal) }}</button>
    </div>

    <!-- Filters -->
    <div class="filters-row">
      <div class="filter-dropdown">
        <select v-model="timePeriod">
          <option value="week">this week</option>
          <option value="month">this month</option>
          <option value="year">this year</option>
          <option value="all">all time</option>
        </select>
      </div>
      <span class="filter-sep">in</span>
      <div class="filter-dropdown">
        <select v-model="listFilter">
          <option value="personal">Private list</option>
          <option value="shared">Shared list</option>
        </select>
      </div>
    </div>

    <!-- Chart -->
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

    <!-- Apple Pay Banner -->
    <div v-if="showApplePayBanner" class="apple-pay-banner" @click="showApplePayBanner = false">
      <div class="apple-pay-content">
        <svg class="apple-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 21.99 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09 21.99C7.79 22.03 6.8 20.68 5.96 19.47C4.25 16.97 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.89C10.1 6.87 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/></svg>
        <span>Apple Pay detected on this device</span>
        <span class="dismiss">&times;</span>
      </div>
    </div>

    <!-- Transactions -->
    <section class="transactions-section">
      <div v-if="!filteredTransactions.length" class="empty-state">
        <p>Your transactions will show up here</p>
      </div>
      <div v-else class="transaction-list">
        <div v-for="tx in filteredTransactions" :key="tx.id" class="transaction-item">
          <div class="tx-left">
            <div class="tx-icon-wrap" :class="tx.type || 'expense'">
              <svg v-if="tx.payment_method === 'apple_pay'" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 21.99 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09 21.99C7.79 22.03 6.8 20.68 5.96 19.47C4.25 16.97 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.89C10.1 6.87 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/></svg>
              <svg v-else-if="(tx.type || 'expense') === 'income'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
            </div>
            <div class="tx-info">
              <strong>{{ tx.description }}</strong>
              <div class="tx-meta">
                <span class="tx-category">{{ tx.category }}</span>
                <span>{{ tx.date }}</span>
                <span v-if="tx.payment_method && tx.payment_method !== 'other'" class="tx-method">{{ getPaymentMethodLabel(tx.payment_method) }}</span>
              </div>
            </div>
          </div>
          <div class="tx-right">
            <span class="tx-amount" :class="tx.type || 'expense'">
              {{ (tx.type || 'expense') === 'income' ? '+' : '-' }}${{ Number(tx.amount).toFixed(2) }}
            </span>
            <button v-if="isOwner(tx.owner_id)" class="tx-delete" @click="handleRemoveExpense(tx.id)">&times;</button>
          </div>
        </div>
      </div>
    </section>

    <!-- Bottom Toolbar -->
    <div class="bottom-toolbar">
      <div class="toolbar-left">
        <button class="toolbar-add-btn" @click="openAddForm">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button class="toolbar-search-btn" @click="showSearch = !showSearch">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        </button>
      </div>
      <button class="mic-btn" :class="{ listening: isListening }" @click="startVoiceInput">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18.5v3.5M8 22h8"/></svg>
      </button>
    </div>

    <!-- Settings Drawer -->
    <div v-if="showSettings" class="drawer-overlay" @click.self="showSettings = false">
      <div class="drawer">
        <div class="drawer-header">
          <h2>Settings</h2>
          <button class="icon-btn" @click="showSettings = false">&times;</button>
        </div>

        <!-- Partner -->
        <div class="drawer-section">
          <h3>Finance Partner</h3>
          <div v-if="partner && partner.status === 'active'" class="partner-active">
            <p>Partner linked</p>
            <button class="danger-btn" @click="handleRemovePartner">Unlink Partner</button>
          </div>
          <div v-else-if="partner && partner.status === 'pending'">
            <p class="muted">Waiting for partner. Share this code:</p>
            <div class="code-row">
              <code>{{ partner.invite_code }}</code>
              <button @click="copyPartnerCode">Copy</button>
            </div>
          </div>
          <div v-else>
            <div class="mini-tabs">
              <button :class="{ active: partnerMode === 'join' }" @click="partnerMode = 'join'">Join</button>
              <button :class="{ active: partnerMode === 'create' }" @click="partnerMode = 'create'">Create</button>
            </div>
            <div v-if="partnerMode === 'join'">
              <input v-model="partnerInviteCode" type="text" placeholder="Enter invite code" class="drawer-input" />
              <button class="primary-btn" @click="handleJoinPartner">Join</button>
            </div>
            <div v-else>
              <p class="muted">Create an invite code to share.</p>
              <button class="primary-btn" @click="handleCreateInvite">Generate Code</button>
            </div>
            <p v-if="partnerError" class="error">{{ partnerError }}</p>
          </div>
        </div>

        <!-- Accounts -->
        <div class="drawer-section">
          <div class="section-header">
            <h3>Accounts</h3>
            <button class="add-small-btn" @click="showAccountForm = !showAccountForm">+</button>
          </div>
          <div v-if="showAccountForm" class="account-form">
            <input v-model="newAccountName" type="text" placeholder="Account name" class="drawer-input" />
            <input v-model.number="newAccountBalance" type="number" step="0.01" placeholder="Balance" class="drawer-input" />
            <button class="primary-btn" @click="handleAddAccount">Add Account</button>
          </div>
          <div v-for="acc in filteredAccounts" :key="acc.id" class="account-item">
            <div>
              <strong>{{ acc.name }}</strong>
              <small v-if="!isOwner(acc.owner_id)" class="partner-tag">Partner's</small>
            </div>
            <div class="account-right">
              <span :class="{ negative: Number(acc.balance) < 0 }">${{ Number(acc.balance).toFixed(2) }}</span>
              <button v-if="isOwner(acc.owner_id)" class="remove-btn" @click="handleRemoveAccount(acc.id, acc.name)">&times;</button>
            </div>
          </div>
          <p v-if="!filteredAccounts.length" class="muted">No accounts yet.</p>
        </div>

        <!-- Apple Pay Shortcut -->
        <div class="drawer-section">
          <h3>Apple Pay Shortcut</h3>
          <p class="muted">Auto-log Apple Pay transactions using iOS Shortcuts.</p>
          <div v-if="apiKey">
            <p class="muted" style="margin-bottom:4px">Your API Key:</p>
            <div class="code-row">
              <code class="api-key-code">{{ apiKey.slice(0, 8) }}...{{ apiKey.slice(-4) }}</code>
              <button @click="copyApiKey">Copy</button>
            </div>
            <div class="shortcut-instructions">
              <p class="muted" style="margin-top:12px;margin-bottom:8px"><strong style="color:#e0e0e0">Shortcut setup:</strong></p>
              <ol class="setup-steps">
                <li>Open <strong>Shortcuts</strong> app on iPhone</li>
                <li>Go to <strong>Automation</strong> tab</li>
                <li>Tap <strong>+</strong> &rarr; <strong>Transaction</strong></li>
                <li>Add action: <strong>Get Contents of URL</strong></li>
                <li>URL: <code>{{ supabaseUrl }}/rest/v1/rpc/add_expense_via_api_key</code></li>
                <li>Method: <strong>POST</strong></li>
                <li>Headers:<br/>
                  <code>apikey</code>: <code>{{ supabaseAnonKey?.slice(0, 12) }}...</code> <button class="copy-inline" @click="copyAnonKey">copy</button><br/>
                  <code>Content-Type</code>: <code>application/json</code>
                </li>
                <li>Body (JSON):<br/>
                  <code>{"p_api_key":"{{ apiKey }}", "p_amount": Amount, "p_merchant": Merchant}</code>
                </li>
              </ol>
              <p class="muted" style="margin-top:8px">Use the <strong>Amount</strong> and <strong>Merchant</strong> variables from the Transaction trigger.</p>
            </div>
          </div>
          <div v-else>
            <button class="primary-btn" @click="handleGenerateApiKey">Generate API Key</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Transaction Modal -->
    <div v-if="showAddForm" class="modal-overlay" @click.self="showAddForm = false">
      <form class="modal-sheet" @submit.prevent="handleAddTransaction">
        <div class="sheet-handle"></div>
        <h2>New Transaction</h2>

        <div class="type-toggle">
          <button type="button" :class="{ active: newExpType === 'expense' }" @click="newExpType = 'expense'">Expense</button>
          <button type="button" :class="{ active: newExpType === 'income' }" @click="newExpType = 'income'">Income</button>
        </div>

        <label>
          Description
          <input v-model="newExpDesc" type="text" placeholder="What was it for?" required />
        </label>

        <div class="form-row">
          <label>
            Amount ($)
            <input v-model.number="newExpAmount" type="number" step="0.01" min="0.01" placeholder="0.00" required />
          </label>
          <label>
            Date
            <input v-model="newExpDate" type="date" required />
          </label>
        </div>

        <label>
          Category
          <select v-model="newExpCategory">
            <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </label>

        <label>
          Payment Method
          <select v-model="newExpPaymentMethod">
            <option v-for="m in paymentMethods" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
        </label>

        <label>
          From Account
          <select v-model="newExpAccount">
            <option :value="null">None (cash)</option>
            <option v-for="acc in filteredAccounts.filter(a => isOwner(a.owner_id))" :key="acc.id" :value="acc.id">{{ acc.name }}</option>
          </select>
        </label>

        <div class="form-actions">
          <button type="button" @click="showAddForm = false">Cancel</button>
          <button type="submit" class="primary">Add</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.finances-page {
  padding: 20px 16px;
  padding-bottom: 100px;
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
  padding: 24px;
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
</style>
