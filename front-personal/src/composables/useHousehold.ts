import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'

export interface Household {
  id: string
  name: string
  invite_code: string
  created_by: string
}

export interface HouseholdMember {
  id: string
  household_id: string
  user_id: string
  role: string
  joined_at: string
}

const currentHousehold = ref<Household | null>(null)
const members = ref<HouseholdMember[]>([])

export function useHousehold() {
  const loadHousehold = async (userId: string) => {
    // Find the household this user belongs to
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .limit(1)
      .single()

    if (membership) {
      const { data: household } = await supabase
        .from('households')
        .select('*')
        .eq('id', membership.household_id)
        .single()

      currentHousehold.value = household

      const { data: memberList } = await supabase
        .from('household_members')
        .select('*')
        .eq('household_id', membership.household_id)

      members.value = memberList ?? []
    } else {
      currentHousehold.value = null
      members.value = []
    }
  }

  const createHousehold = async (name: string, userId: string) => {
    const { data: household, error } = await supabase
      .from('households')
      .insert({ name, created_by: userId })
      .select()
      .single()

    if (error) throw error

    // Add creator as owner
    await supabase
      .from('household_members')
      .insert({ household_id: household.id, user_id: userId, role: 'owner' })

    currentHousehold.value = household
    members.value = [{ id: '', household_id: household.id, user_id: userId, role: 'owner', joined_at: new Date().toISOString() }]
    return household
  }

  const joinHousehold = async (inviteCode: string, userId: string) => {
    const { data: household, error: findError } = await supabase
      .from('households')
      .select('*')
      .eq('invite_code', inviteCode.trim().toLowerCase())
      .single()

    if (findError || !household) throw new Error('Household not found. Check the invite code.')

    const { error: joinError } = await supabase
      .from('household_members')
      .insert({ household_id: household.id, user_id: userId, role: 'member' })

    if (joinError) {
      if (joinError.code === '23505') throw new Error('You are already in this household.')
      throw joinError
    }

    currentHousehold.value = household
    await loadHousehold(userId)
    return household
  }

  const leaveHousehold = async (userId: string) => {
    if (!currentHousehold.value) return

    await supabase
      .from('household_members')
      .delete()
      .eq('household_id', currentHousehold.value.id)
      .eq('user_id', userId)

    currentHousehold.value = null
    members.value = []
  }

  return {
    currentHousehold,
    members,
    loadHousehold,
    createHousehold,
    joinHousehold,
    leaveHousehold,
  }
}
