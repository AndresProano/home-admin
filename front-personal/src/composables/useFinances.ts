import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'

export interface BankAccount {
  id: string
  owner_id: string
  is_shared: boolean
  name: string
  /** débito: saldo disponible · crédito: saldo negativo = lo que debes */
  balance: number
  /** se calcula solo desde el subtipo */
  tipo: 'debito' | 'credito'
  subtipo: 'corriente' | 'ahorros' | 'meta' | 'inversion' | 'efectivo' | 'credito'
  entidad?: string | null
  tasa_anual?: number | null
  meta_monto?: number | null
  meta_fecha?: string | null
  vencimiento?: string | null
  nota?: string | null
}

export type CuentaEditable = Partial<Omit<BankAccount, 'id' | 'owner_id' | 'tipo'>>

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
  /** 'expense' | 'income' | 'transfer' (entre tus cuentas: account_id → to_account_id) */
  type?: string
  needs_review?: boolean
  to_account_id?: string | null
  /** consumo en el exterior (cuenta para el límite del ISD) */
  exterior?: boolean
}

export interface Budget {
  id: string
  owner_id: string
  is_shared: boolean
  category: string
  period: 'mensual' | 'anual'
  /** total (en compartidos = suma de los aportes) */
  amount: number
  /** solo compartidos: { user_id: aporte } */
  aportes: Record<string, number>
}

export type NewExpense = {
  description: string; amount: number; category: string; date: string
  account_id: string | null; is_shared: boolean; payment_method?: string; type?: string
  to_account_id?: string | null
  exterior?: boolean
}

export interface FinancePartner {
  id: string
  user_a: string
  user_b: string
  invite_code: string
  status: string
}

interface Profile {
  id: string
  display_name: string | null
  email: string | null
  avatar_url: string | null
  /** lo que cobra el banco por transferir a otro banco (Ecuador: ~$0,40) */
  comision_interbancaria?: number | null
  /** % de IVA que el banco cobra aparte por servicios digitales del exterior (Ecuador: 15) */
  iva_digital?: number | null
}

const accounts = ref<BankAccount[]>([])
const expenses = ref<Expense[]>([])
const budgets = ref<Budget[]>([])
const partner = ref<FinancePartner | null>(null)
const apiKey = ref<string | null>(null)
const profilesCache = ref<Record<string, Profile>>({})

export function useFinances() {
  // --- Partner ---
  const loadPartner = async (userId: string) => {
    const { data } = await supabase
      .from('finance_partners')
      .select('*')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .in('status', ['active', 'pending'])
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

  const joinPartner = async (inviteCode: string) => {
    // La función join_partner valida el código en el servidor (nadie puede listar invitaciones ajenas)
    const { data, error } = await supabase.rpc('join_partner', { p_code: inviteCode.trim() })
    if (error) throw new Error(error.message)
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

  const addAccount = async (userId: string, cuenta: CuentaEditable & { name: string }) => {
    const { data, error } = await supabase
      .from('bank_accounts')
      .insert({ ...cuenta, owner_id: userId })
      .select()
      .single()

    if (error) throw error
    accounts.value.push(data)
    return data
  }

  const updateAccount = async (accountId: string, changes: CuentaEditable) => {
    const { data, error } = await supabase
      .from('bank_accounts')
      .update(changes)
      .eq('id', accountId)
      .select()
      .single()
    if (error) throw error
    const i = accounts.value.findIndex(a => a.id === accountId)
    if (i >= 0) accounts.value[i] = data
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

  // El saldo de la cuenta lo ajusta un trigger en la base de datos
  // (aplicar_movimiento_a_saldo), así que solo recargamos las cuentas.
  const addExpense = async (userId: string, expense: NewExpense) => {
    const { data, error } = await supabase
      .from('expenses')
      .insert({ ...expense, owner_id: userId, needs_review: false })
      .select()
      .single()

    if (error) throw error
    expenses.value.unshift(data)
    if (expense.account_id) await loadAccounts()
    return data
  }

  const updateExpense = async (expenseId: string, changes: Partial<NewExpense> & { needs_review?: boolean }) => {
    const { data, error } = await supabase
      .from('expenses')
      .update(changes)
      .eq('id', expenseId)
      .select()
      .single()

    if (error) throw error
    const i = expenses.value.findIndex(e => e.id === expenseId)
    if (i >= 0) expenses.value[i] = data
    expenses.value.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
    await loadAccounts()
    return data
  }

  const removeExpense = async (expenseId: string) => {
    const expense = expenses.value.find(e => e.id === expenseId)
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId)

    if (error) throw error
    expenses.value = expenses.value.filter(e => e.id !== expenseId)
    if (expense?.account_id) await loadAccounts()
  }

  /** Importa movimientos (Excel). Con afectarSaldos=false no se tocan los saldos de las cuentas. */
  const importarMovimientos = async (filas: unknown[], afectarSaldos: boolean) => {
    const { data, error } = await supabase.rpc('importar_movimientos', { p_filas: filas, p_afectar_saldos: afectarSaldos })
    if (error) throw new Error(error.message)
    await Promise.all([loadExpenses(), loadAccounts()])
    return data as number
  }

  const pendingReview = computed(() => expenses.value.filter(e => e.needs_review))

  // --- Presupuestos ---
  const loadBudgets = async () => {
    const { data } = await supabase.from('budgets').select('*').order('category')
    budgets.value = (data ?? []).map(b => ({ ...b, amount: Number(b.amount), aportes: b.aportes ?? {} }))
  }

  /**
   * Guarda un presupuesto.
   * - Con id: lo actualiza (en un compartido, cualquiera de los dos puede).
   * - Compartido sin id: si la pareja ya tiene uno de esa categoría y periodo, se actualiza ese.
   * - Si no, crea o reemplaza el tuyo de esa categoría y periodo.
   */
  const saveBudget = async (userId: string, b: Omit<Budget, 'id' | 'owner_id'>, id?: string | null) => {
    const existente = id
      ? budgets.value.find(x => x.id === id)
      : b.is_shared
        ? budgets.value.find(x => x.is_shared && x.category === b.category && x.period === b.period)
        : undefined

    const query = existente
      ? supabase.from('budgets').update(b).eq('id', existente.id)
      : supabase.from('budgets').upsert({ ...b, owner_id: userId }, { onConflict: 'owner_id,is_shared,category,period' })

    const { data, error } = await query.select().single()
    if (error) throw new Error(error.message)
    const saved: Budget = { ...data, amount: Number(data.amount), aportes: data.aportes ?? {} }
    budgets.value = [...budgets.value.filter(x => x.id !== saved.id), saved]
      .sort((a, b) => a.category.localeCompare(b.category))
    return saved
  }

  const removeBudget = async (budgetId: string) => {
    const { error } = await supabase.from('budgets').delete().eq('id', budgetId)
    if (error) throw error
    budgets.value = budgets.value.filter(b => b.id !== budgetId)
  }

  // --- Profiles ---
  const loadProfile = async (userId: string) => {
    if (profilesCache.value[userId]) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) profilesCache.value[userId] = data
  }

  /** Comisión por transferencia interbancaria del usuario (por defecto $0,40) */
  const comisionDe = (userId: string) => Number(profilesCache.value[userId]?.comision_interbancaria ?? 0.4)

  const ivaDigitalDe = (userId: string) => Number(profilesCache.value[userId]?.iva_digital ?? 15)

  const guardarIvaDigital = async (userId: string, valor: number) => {
    const { data, error } = await supabase
      .from('profiles')
      .update({ iva_digital: valor })
      .eq('id', userId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    profilesCache.value = { ...profilesCache.value, [userId]: data }
  }

  const guardarComision = async (userId: string, valor: number) => {
    const { data, error } = await supabase
      .from('profiles')
      .update({ comision_interbancaria: valor })
      .eq('id', userId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    profilesCache.value = { ...profilesCache.value, [userId]: data }
  }

  const getDisplayName = (userId: string) => {
    return profilesCache.value[userId]?.display_name || 'Desconocido'
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

  /** Crea tu clave del atajo o la reemplaza por una nueva (la anterior deja de funcionar) */
  const generateApiKey = async (_userId?: string) => {
    const { data, error } = await supabase.rpc('cambiar_mi_clave')
    if (error) throw new Error(error.message)
    apiKey.value = data as string
    return data as string
  }

  return {
    accounts,
    expenses,
    partner,
    apiKey,
    budgets,
    pendingReview,
    loadPartner,
    createPartnerInvite,
    joinPartner,
    removePartner,
    loadAccounts,
    addAccount,
    updateAccount,
    removeAccount,
    loadExpenses,
    addExpense,
    updateExpense,
    removeExpense,
    loadBudgets,
    importarMovimientos,
    saveBudget,
    removeBudget,
    loadApiKey,
    generateApiKey,
    loadProfile,
    getDisplayName,
    comisionDe,
    guardarComision,
    ivaDigitalDe,
    guardarIvaDigital,
    profilesCache,
  }
}
