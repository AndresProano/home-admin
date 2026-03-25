import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'

export interface KitchenItem {
  id: string
  household_id: string
  name: string
  quantity: number
  threshold: number
  category: string
  added_by: string | null
  created_at: string
  updated_at: string
}

const items = ref<KitchenItem[]>([])

export function useKitchen() {
  const loadItems = async (householdId: string) => {
    const { data } = await supabase
      .from('kitchen_items')
      .select('*')
      .eq('household_id', householdId)
      .order('category')
      .order('name')

    items.value = data ?? []
  }

  const addItem = async (householdId: string, item: { name: string; quantity: number; threshold: number; category: string }, userId: string) => {
    const { data, error } = await supabase
      .from('kitchen_items')
      .insert({ ...item, household_id: householdId, added_by: userId })
      .select()
      .single()

    if (error) throw error
    items.value.push(data)
    return data
  }

  const updateQuantity = async (itemId: string, newQuantity: number) => {
    const qty = Math.max(0, newQuantity)
    const { error } = await supabase
      .from('kitchen_items')
      .update({ quantity: qty, updated_at: new Date().toISOString() })
      .eq('id', itemId)

    if (error) throw error
    const item = items.value.find(i => i.id === itemId)
    if (item) item.quantity = qty
  }

  const removeItem = async (itemId: string) => {
    const { error } = await supabase
      .from('kitchen_items')
      .delete()
      .eq('id', itemId)

    if (error) throw error
    items.value = items.value.filter(i => i.id !== itemId)
  }

  const lowStockItems = () => {
    return items.value.filter(i => i.quantity <= i.threshold)
  }

  return { items, loadItems, addItem, updateQuantity, removeItem, lowStockItems }
}
