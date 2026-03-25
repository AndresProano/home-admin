<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useFinances } from '@/composables/useFinances'

const router = useRouter()
const { user } = useAuth()
const {
  accounts, expenses, partner,
  personalBalance, sharedBalance, totalBalance,
  loadPartner, createPartnerInvite, joinPartner, removePartner,
  loadAccounts, loadExpenses, addAccount, removeAccount, addExpense, removeExpense,
} = useFinances()

const view = ref<'shared' | 'personal'>('shared')
const activeTab = ref<'expenses' | 'accounts'>('expenses')

// Partner setup
const showPartnerSetup = ref(false)
const partnerMode = ref<'create' | 'join'>('join')
const partnerInviteCode = ref('')
const partnerError = ref('')

// Account form
const showAccountForm = ref(false)
const newAccountName = ref('')
const newAccountBalance = ref(0)

// Expense form
const showExpenseForm = ref(false)
const newExpDesc = ref('')
const newExpAmount = ref(0)
const newExpCategory = ref('Food')
const newExpDate = ref(new Date().toISOString().slice(0, 10))
const newExpAccount = ref<string | null>(null)
const newExpShared = ref(true)

const expenseCategories = ['Food', 'Transport', 'Utilities', 'Rent', 'Entertainment', 'Health', 'Shopping', 'Education', 'Other']

// Filtered data based on shared/personal view
const filteredAccounts = computed(() =>
  accounts.value.filter(a => view.value === 'shared' ? a.is_shared : !a.is_shared)
)

const filteredExpenses = computed(() =>
  expenses.value.filter(e => view.value === 'shared' ? e.is_shared : !e.is_shared)
)

const currentBalance = computed(() =>
  view.value === 'shared' ? sharedBalance.value : personalBalance.value
)

const lowBalanceAccounts = computed(() =>
  filteredAccounts.value.filter(a => Number(a.balance) < 30)
)

const monthlyTotal = computed(() => {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  return filteredExpenses.value
    .filter(e => e.date >= monthStart)
    .reduce((sum, e) => sum + Number(e.amount), 0)
})

onMounted(async () => {
  if (user.value) {
    await loadPartner(user.value.id)
    await Promise.all([loadAccounts(), loadExpenses()])
  }
})

// Partner actions
const handleCreateInvite = async () => {
  partnerError.value = ''
  if (!user.value) return
  try {
    await createPartnerInvite(user.value.id)
  } catch (e: any) {
    partnerError.value = e.message
  }
}

const handleJoinPartner = async () => {
  partnerError.value = ''
  if (!partnerInviteCode.value.trim() || !user.value) return
  try {
    await joinPartner(partnerInviteCode.value.trim(), user.value.id)
    showPartnerSetup.value = false
  } catch (e: any) {
    partnerError.value = e.message
  }
}

const handleRemovePartner = async () => {
  if (confirm('Unlink your finance partner? You will no longer see shared finances.')) {
    await removePartner()
  }
}

const copyPartnerCode = () => {
  if (partner.value) {
    navigator.clipboard.writeText(partner.value.invite_code)
    alert('Invite code copied! Share it with your partner.')
  }
}

// Account actions
const handleAddAccount = async () => {
  if (!newAccountName.value.trim() || !user.value) return
  const isShared = view.value === 'shared'
  await addAccount(user.value.id, newAccountName.value.trim(), newAccountBalance.value, isShared)
  newAccountName.value = ''
  newAccountBalance.value = 0
  showAccountForm.value = false
}

const handleAddExpense = async () => {
  if (!newExpDesc.value.trim() || newExpAmount.value <= 0 || !user.value) return
  await addExpense(user.value.id, {
    description: newExpDesc.value.trim(),
    amount: newExpAmount.value,
    category: newExpCategory.value,
    date: newExpDate.value,
    account_id: newExpAccount.value || null,
    is_shared: view.value === 'shared',
  })
  newExpDesc.value = ''
  newExpAmount.value = 0
  newExpCategory.value = 'Food'
  newExpDate.value = new Date().toISOString().slice(0, 10)
  newExpAccount.value = null
  showExpenseForm.value = false
}

const handleRemoveAccount = async (id: string, name: string) => {
  if (confirm(`Delete account "${name}"?`)) {
    await removeAccount(id)
  }
}

const handleRemoveExpense = async (id: string) => {
  if (confirm('Delete this expense? The amount will be refunded to the linked account.')) {
    await removeExpense(id)
  }
}

const getAccountName = (accountId: string | null) => {
  if (!accountId) return '—'
  return accounts.value.find(a => a.id === accountId)?.name ?? '—'
}

const isOwner = (ownerId: string) => ownerId === user.value?.id
</script>

<template>
  <div class="finances-page">
    <header class="page-header">
      <button class="back-btn" @click="router.push('/home')">&larr;</button>
      <h1>Finances</h1>
      <button class="partner-btn" @click="showPartnerSetup = !showPartnerSetup">
        {{ partner ? 'Partner' : 'Link Partner' }}
      </button>
    </header>

    <!-- Partner Setup Panel -->
    <div v-if="showPartnerSetup" class="partner-panel">
      <div v-if="partner && partner.status === 'active'">
        <p class="partner-status">Partner linked</p>
        <button class="danger-btn" @click="handleRemovePartner">Unlink Partner</button>
      </div>
      <div v-else-if="partner && partner.status === 'pending'">
        <p>Waiting for your partner to join. Share this code:</p>
        <div class="invite-row">
          <code>{{ partner.invite_code }}</code>
          <button @click="copyPartnerCode">Copy</button>
        </div>
      </div>
      <div v-else>
        <div class="tabs" style="margin-bottom:12px">
          <button :class="{ active: partnerMode === 'join' }" @click="partnerMode = 'join'">Join</button>
          <button :class="{ active: partnerMode === 'create' }" @click="partnerMode = 'create'">Create</button>
        </div>
        <div v-if="partnerMode === 'join'">
          <label>
            Partner's Invite Code
            <input v-model="partnerInviteCode" type="text" placeholder="Enter code" />
          </label>
          <button class="primary-btn" @click="handleJoinPartner">Join</button>
        </div>
        <div v-else>
          <p>Create an invite code to share with your partner.</p>
          <button class="primary-btn" @click="handleCreateInvite">Generate Code</button>
        </div>
        <p v-if="partnerError" class="error">{{ partnerError }}</p>
      </div>
    </div>

    <!-- Shared / Personal toggle -->
    <div class="view-toggle">
      <button :class="{ active: view === 'shared' }" @click="view = 'shared'">Shared</button>
      <button :class="{ active: view === 'personal' }" @click="view = 'personal'">Personal</button>
    </div>

    <!-- Summary cards -->
    <div class="summary-row">
      <div class="summary-card">
        <small>{{ view === 'shared' ? 'Shared Balance' : 'Personal Balance' }}</small>
        <strong :class="{ negative: currentBalance < 0 }">${{ currentBalance.toFixed(2) }}</strong>
      </div>
      <div class="summary-card">
        <small>This Month</small>
        <strong class="spent">-${{ monthlyTotal.toFixed(2) }}</strong>
      </div>
    </div>

    <!-- Low balance alert -->
    <div v-if="lowBalanceAccounts.length" class="alert">
      <strong>Low balance:</strong> {{ lowBalanceAccounts.map(a => `${a.name} ($${Number(a.balance).toFixed(2)})`).join(', ') }}
    </div>

    <!-- Expenses / Accounts tabs -->
    <div class="tabs">
      <button :class="{ active: activeTab === 'expenses' }" @click="activeTab = 'expenses'">Expenses</button>
      <button :class="{ active: activeTab === 'accounts' }" @click="activeTab = 'accounts'">Accounts</button>
    </div>

    <!-- Accounts tab -->
    <div v-if="activeTab === 'accounts'">
      <div v-if="!filteredAccounts.length" class="empty-state">
        <p>No {{ view }} accounts yet. Add one!</p>
      </div>
      <div v-for="account in filteredAccounts" :key="account.id" class="list-item">
        <div>
          <strong>{{ account.name }}</strong>
          <small v-if="view === 'shared' && !isOwner(account.owner_id)" class="partner-label">Partner's</small>
        </div>
        <div class="list-item-right">
          <span :class="{ negative: Number(account.balance) < 0 }">${{ Number(account.balance).toFixed(2) }}</span>
          <button v-if="isOwner(account.owner_id)" class="remove-btn" @click="handleRemoveAccount(account.id, account.name)">&times;</button>
        </div>
      </div>
    </div>

    <!-- Expenses tab -->
    <div v-if="activeTab === 'expenses'">
      <div v-if="!filteredExpenses.length" class="empty-state">
        <p>No {{ view }} expenses yet.</p>
      </div>
      <div v-for="expense in filteredExpenses" :key="expense.id" class="list-item expense-item">
        <div>
          <strong>{{ expense.description }}</strong>
          <div class="expense-meta">
            <span class="expense-category">{{ expense.category }}</span>
            <span>{{ expense.date }}</span>
            <span>{{ getAccountName(expense.account_id) }}</span>
            <small v-if="view === 'shared' && !isOwner(expense.owner_id)" class="partner-label">Partner</small>
          </div>
        </div>
        <div class="list-item-right">
          <span class="spent">-${{ Number(expense.amount).toFixed(2) }}</span>
          <button v-if="isOwner(expense.owner_id)" class="remove-btn" @click="handleRemoveExpense(expense.id)">&times;</button>
        </div>
      </div>
    </div>

    <!-- FAB -->
    <button
      class="fab"
      v-if="!showAccountForm && !showExpenseForm"
      @click="activeTab === 'accounts' ? showAccountForm = true : showExpenseForm = true"
    >+</button>

    <!-- Add Account Modal -->
    <div v-if="showAccountForm" class="modal-overlay" @click.self="showAccountForm = false">
      <form class="modal-form" @submit.prevent="handleAddAccount">
        <h2>Add {{ view === 'shared' ? 'Shared' : 'Personal' }} Account</h2>
        <label>
          Account Name
          <input v-model="newAccountName" type="text" placeholder="e.g. Chase Checking" required />
        </label>
        <label>
          Initial Balance
          <input v-model.number="newAccountBalance" type="number" step="0.01" />
        </label>
        <div class="form-actions">
          <button type="button" @click="showAccountForm = false">Cancel</button>
          <button type="submit" class="primary">Add</button>
        </div>
      </form>
    </div>

    <!-- Add Expense Modal -->
    <div v-if="showExpenseForm" class="modal-overlay" @click.self="showExpenseForm = false">
      <form class="modal-form" @submit.prevent="handleAddExpense">
        <h2>Add {{ view === 'shared' ? 'Shared' : 'Personal' }} Expense</h2>
        <label>
          Description
          <input v-model="newExpDesc" type="text" placeholder="e.g. Grocery shopping" required />
        </label>
        <div class="form-row">
          <label>
            Amount ($)
            <input v-model.number="newExpAmount" type="number" step="0.01" min="0.01" required />
          </label>
          <label>
            Date
            <input v-model="newExpDate" type="date" required />
          </label>
        </div>
        <label>
          Category
          <select v-model="newExpCategory">
            <option v-for="cat in expenseCategories" :key="cat" :value="cat">{{ cat }}</option>
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
          <button type="button" @click="showExpenseForm = false">Cancel</button>
          <button type="submit" class="primary">Add</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.finances-page { padding: 16px; padding-bottom: 80px; }

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.page-header h1 { margin: 0; font-size: 1.4rem; flex: 1; }
.back-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 4px 8px;
}
.partner-btn {
  padding: 6px 12px;
  border: 1px solid #9c27b0;
  border-radius: 8px;
  background: white;
  color: #9c27b0;
  font-size: 0.85rem;
  cursor: pointer;
}

.partner-panel {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.partner-panel label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.9rem;
  color: #555;
}
.partner-panel input {
  display: block;
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-top: 4px;
  font-size: 1rem;
  box-sizing: border-box;
}
.partner-status { color: #4caf50; font-weight: bold; }
.invite-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
}
.invite-row code {
  background: #f5f5f5;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 1.1rem;
  letter-spacing: 2px;
}
.invite-row button {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  cursor: pointer;
}
.primary-btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: #9c27b0;
  color: white;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 8px;
}
.danger-btn {
  width: 100%;
  padding: 10px;
  border: 1px solid #f44336;
  border-radius: 8px;
  background: white;
  color: #f44336;
  cursor: pointer;
}
.error { color: #f44336; font-size: 0.9rem; margin-top: 8px; }

.view-toggle {
  display: flex;
  margin-bottom: 16px;
  background: #f3e5f5;
  border-radius: 10px;
  padding: 3px;
}
.view-toggle button {
  flex: 1;
  padding: 10px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 500;
}
.view-toggle button.active {
  background: #9c27b0;
  color: white;
}

.summary-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.summary-card {
  flex: 1;
  background: white;
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
}
.summary-card small { display: block; color: #999; margin-bottom: 4px; }
.summary-card strong { font-size: 1.3rem; }
.negative { color: #f44336; }
.spent { color: #f44336; }

.alert {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 12px;
  font-size: 0.9rem;
}

.tabs {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
  background: #eee;
  border-radius: 10px;
  padding: 3px;
}
.tabs button {
  flex: 1;
  padding: 10px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.95rem;
}
.tabs button.active {
  background: #2196f3;
  color: white;
}

.list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.list-item-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.expense-meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: 0.8rem;
  color: #888;
  flex-wrap: wrap;
}
.expense-category {
  background: #e3f2fd;
  padding: 1px 8px;
  border-radius: 8px;
  color: #1565c0;
}
.partner-label {
  background: #f3e5f5;
  padding: 1px 8px;
  border-radius: 8px;
  color: #9c27b0;
  font-size: 0.75rem;
}
.remove-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #999;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #999;
}

.fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #2196f3;
  color: white;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
}
.modal-form {
  background: white;
  border-radius: 20px 20px 0 0;
  padding: 24px;
  width: 100%;
  max-width: 500px;
}
.modal-form h2 { margin: 0 0 16px; }
.modal-form label {
  display: block;
  margin-bottom: 12px;
  font-size: 0.9rem;
  color: #555;
}
.modal-form input, .modal-form select {
  display: block;
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-top: 4px;
  font-size: 1rem;
  box-sizing: border-box;
}
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
  border-radius: 10px;
  border: 1px solid #ddd;
  background: white;
  font-size: 1rem;
  cursor: pointer;
}
.form-actions .primary {
  background: #2196f3;
  color: white;
  border-color: #2196f3;
}
</style>
