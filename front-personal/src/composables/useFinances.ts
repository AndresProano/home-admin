import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'

export interface BankAccount {
  id: string
  owner_id: string
  is_shared: boolean
  name: string
  balance: number
}

export interface Expense {
  id: string
  owner_id: string
  account_id: string | null
  is_shared: boolean
  description: string
  amount: number
  category: string
  date: string
  created_at: string
  payment_method?: string
  type?: string
}

export interface FinancePartner {
  id: string
  user_a: string
  user_b: string
  invite_code: string
  status: string
}

const accounts = ref<BankAccount[]>([])
const expenses = ref<Expense[]>([])
const partner = ref<FinancePartner | null>(null)
const apiKey = ref<string | null>(null)

export function useFinances() {
  // --- Balances ---
  const personalBalance = computed(() =>
    accounts.value
      .filter(a => !a.is_shared)
      .reduce((sum, a) => sum + Number(a.balance), 0)
  )

  const sharedBalance = computed(() =>
    accounts.value
      .filter(a => a.is_shared)
      .reduce((sum, a) => sum + Number(a.balance), 0)
  )

  const totalBalance = computed(() =>
    accounts.value.reduce((sum, a) => sum + Number(a.balance), 0)
  )

  // --- Partner ---
  const loadPartner = async (userId: string) => {
    const { data } = await supabase
      .from('finance_partners')
      .select('*')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .eq('status', 'active')
      .limit(1)
      .single()

    partner.value = data
  }

  const createPartnerInvite = async (userId: string) => {
    const { data, error } = await supabase
      .from('finance_partners')
      .insert({ user_a: userId })
      .select()
      .single()

    if (error) throw error
    partner.value = data
    return data
  }

  const joinPartner = async (inviteCode: string, userId: string) => {
    // Find the pending invite
    const { data: invite, error: findErr } = await supabase
      .from('finance_partners')
      .select('*')
      .eq('invite_code', inviteCode.trim().toLowerCase())
      .eq('status', 'pending')
      .single()

    if (findErr || !invite) throw new Error('Invite not found or already used.')
    if (invite.user_a === userId) throw new Error('You cannot join your own invite.')

    // Accept it
    const { data, error } = await supabase
      .from('finance_partners')
      .update({ user_b: userId, status: 'active' })
      .eq('id', invite.id)
      .select()
      .single()

    if (error) throw error
    partner.value = data
    return data
  }

  const removePartner = async () => {
    if (!partner.value) return
    await supabase
      .from('finance_partners')
      .delete()
      .eq('id', partner.value.id)
    partner.value = null
  }

  // --- Accounts ---
  // RLS handles visibility: you see yours + partner's shared
  const loadAccounts = async () => {
    const { data } = await supabase
      .from('bank_accounts')
      .select('*')
      .order('is_shared', { ascending: false })
      .order('name')

    accounts.value = data ?? []
  }

  const addAccount = async (userId: string, name: string, balance: number, isShared: boolean) => {
    const { data, error } = await supabase
      .from('bank_accounts')
      .insert({ owner_id: userId, name, balance, is_shared: isShared })
      .select()
      .single()

    if (error) throw error
    accounts.value.push(data)
    return data
  }

  const removeAccount = async (accountId: string) => {
    const { error } = await supabase
      .from('bank_accounts')
      .delete()
      .eq('id', accountId)

    if (error) throw error
    accounts.value = accounts.value.filter(a => a.id !== accountId)
  }

  // --- Expenses ---
  // RLS handles visibility: you see yours + partner's shared
  const loadExpenses = async () => {
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    expenses.value = data ?? []
  }

  const addExpense = async (
    userId: string,
    expense: { description: string; amount: number; category: string; date: string; account_id: string | null; is_shared: boolean; payment_method?: string; type?: string }
  ) => {
    const { data, error } = await supabase
      .from('expenses')
      .insert({ ...expense, owner_id: userId })
      .select()
      .single()

    if (error) throw error
    expenses.value.unshift(data)

    // Subtract from account balance if linked
    if (expense.account_id) {
      const account = accounts.value.find(a => a.id === expense.account_id)
      if (account) {
        const newBalance = Number(account.balance) + (expense.type === 'income' ? expense.amount : -expense.amount)
        await supabase
          .from('bank_accounts')
          .update({ balance: newBalance })
          .eq('id', expense.account_id)
        account.balance = newBalance
      }
    }

    return data
  }

  const removeExpense = async (expenseId: string) => {
    const expense = expenses.value.find(e => e.id === expenseId)
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId)

    if (error) throw error

    // Refund the account if linked
    if (expense?.account_id) {
      const account = accounts.value.find(a => a.id === expense.account_id)
      if (account) {
        const newBalance = Number(account.balance) + ((expense.type || 'expense') === 'income' ? -expense.amount : expense.amount)
        await supabase
          .from('bank_accounts')
          .update({ balance: newBalance })
          .eq('id', expense.account_id)
        account.balance = newBalance
      }
    }

    expenses.value = expenses.value.filter(e => e.id !== expenseId)
  }

  // --- API Key (for iOS Shortcuts) ---
  const loadApiKey = async (userId: string) => {
    const { data } = await supabase
      .from('user_api_keys')
      .select('api_key')
      .eq('user_id', userId)
      .single()
    apiKey.value = data?.api_key ?? null
  }

  const generateApiKey = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_api_keys')
      .upsert({ user_id: userId }, { onConflict: 'user_id' })
      .select('api_key')
      .single()
    if (error) throw error
    apiKey.value = data.api_key
    return data.api_key
  }

  return {
    accounts,
    expenses,
    partner,
    apiKey,
    personalBalance,
    sharedBalance,
    totalBalance,
    loadPartner,
    createPartnerInvite,
    joinPartner,
    removePartner,
    loadAccounts,
    addAccount,
    removeAccount,
    loadExpenses,
    addExpense,
    removeExpense,
    loadApiKey,
    generateApiKey,
  }
}
