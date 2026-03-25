<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useHousehold } from '@/composables/useHousehold'

const router = useRouter()
const { user, signOut } = useAuth()
const { currentHousehold, members, loadHousehold, createHousehold, joinHousehold, leaveHousehold } = useHousehold()

const loading = ref(true)
const showHouseholdSetup = ref(false)
const setupMode = ref<'create' | 'join'>('create')
const householdName = ref('')
const inviteCode = ref('')
const error = ref('')
const showSettings = ref(false)

onMounted(async () => {
  if (user.value) {
    await loadHousehold(user.value.id)
  }
  // If no household, show setup
  if (!currentHousehold.value) {
    showHouseholdSetup.value = true
  }
  loading.value = false
})

const handleCreate = async () => {
  error.value = ''
  if (!householdName.value.trim() || !user.value) return
  try {
    await createHousehold(householdName.value.trim(), user.value.id)
    showHouseholdSetup.value = false
  } catch (e: any) {
    error.value = e.message
  }
}

const handleJoin = async () => {
  error.value = ''
  if (!inviteCode.value.trim() || !user.value) return
  try {
    await joinHousehold(inviteCode.value.trim(), user.value.id)
    showHouseholdSetup.value = false
  } catch (e: any) {
    error.value = e.message
  }
}

const handleLeave = async () => {
  if (!user.value) return
  if (confirm('Leave this household? You can rejoin with the invite code.')) {
    await leaveHousehold(user.value.id)
    showHouseholdSetup.value = true
    showSettings.value = false
  }
}

const handleSignOut = async () => {
  await signOut()
  router.push('/')
}

const copyInviteCode = () => {
  if (currentHousehold.value) {
    navigator.clipboard.writeText(currentHousehold.value.invite_code)
    alert('Invite code copied!')
  }
}
</script>

<template>
  <div class="home-page">
    <!-- Loading -->
    <div v-if="loading" class="loading">Loading...</div>

    <!-- Household Setup -->
    <div v-else-if="showHouseholdSetup" class="setup-container">
      <h1>Welcome!</h1>
      <p>Create or join a household to get started.</p>

      <div class="tabs">
        <button :class="{ active: setupMode === 'create' }" @click="setupMode = 'create'">Create</button>
        <button :class="{ active: setupMode === 'join' }" @click="setupMode = 'join'">Join</button>
      </div>

      <form v-if="setupMode === 'create'" @submit.prevent="handleCreate">
        <label>
          Household Name
          <input v-model="householdName" type="text" placeholder="e.g. The Proanos" required />
        </label>
        <button type="submit" class="primary-btn">Create Household</button>
      </form>

      <form v-else @submit.prevent="handleJoin">
        <label>
          Invite Code
          <input v-model="inviteCode" type="text" placeholder="Enter 8-character code" required />
        </label>
        <button type="submit" class="primary-btn">Join Household</button>
      </form>

      <p v-if="error" class="error">{{ error }}</p>

      <button class="signout-link" @click="handleSignOut">Sign out</button>
    </div>

    <!-- Main Menu -->
    <div v-else class="menu-container">
      <div class="top-bar">
        <div>
          <h1>House Organizer</h1>
          <p class="household-name">{{ currentHousehold?.name }}</p>
        </div>
        <button class="settings-btn" @click="showSettings = !showSettings">&#9776;</button>
      </div>

      <!-- Settings panel -->
      <div v-if="showSettings" class="settings-panel">
        <div class="invite-section">
          <strong>Invite Code:</strong>
          <div class="invite-row">
            <code>{{ currentHousehold?.invite_code }}</code>
            <button @click="copyInviteCode">Copy</button>
          </div>
          <small>Share this code so family members can join your household.</small>
        </div>
        <div class="members-section">
          <strong>Members ({{ members.length }})</strong>
          <div v-for="m in members" :key="m.id" class="member-item">
            {{ m.role === 'owner' ? 'Owner' : 'Member' }}
            <span class="member-role">{{ m.role }}</span>
          </div>
        </div>
        <button class="danger-btn" @click="handleLeave">Leave Household</button>
        <button class="signout-link" @click="handleSignOut">Sign out</button>
      </div>

      <div class="grid-menu">
        <router-link to="/kitchen-storage" class="menu-card kitchen">
          <h2>Kitchen Storage</h2>
          <p>Manage your kitchen inventory and storage efficiently.</p>
        </router-link>

        <router-link to="/finances" class="menu-card finances">
          <h2>Finances</h2>
          <p>Track your expenses and manage your household budget.</p>
        </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-page { padding: 16px; }

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 80vh;
  color: #999;
}

/* Setup */
.setup-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 80vh;
  text-align: center;
  padding: 20px;
}
.setup-container h1 { margin-bottom: 8px; }
.setup-container p { color: #666; margin-bottom: 24px; }
.setup-container form {
  width: 100%;
  max-width: 320px;
}
.setup-container label {
  display: block;
  text-align: left;
  margin-bottom: 16px;
  font-size: 0.9rem;
  color: #555;
}
.setup-container input {
  display: block;
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-top: 4px;
  font-size: 1rem;
  box-sizing: border-box;
}

.tabs {
  display: flex;
  gap: 0;
  margin-bottom: 20px;
  background: #eee;
  border-radius: 10px;
  padding: 3px;
  width: 100%;
  max-width: 320px;
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

.primary-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  background: #2196f3;
  color: white;
  font-size: 1rem;
  cursor: pointer;
}
.error { color: #f44336; font-size: 0.9rem; }

.signout-link {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  margin-top: 16px;
  text-decoration: underline;
}

/* Menu */
.menu-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
  margin-bottom: 8px;
}
.top-bar h1 { margin: 0; font-size: 1.4rem; }
.household-name { color: #666; margin: 4px 0 0; font-size: 0.9rem; }
.settings-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 4px 8px;
}

.settings-panel {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  width: 100%;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.invite-section { margin-bottom: 16px; }
.invite-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 4px;
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
.members-section { margin-bottom: 16px; }
.member-item {
  padding: 6px 0;
  font-size: 0.9rem;
}
.member-role {
  background: #e3f2fd;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.75rem;
  margin-left: 8px;
  color: #1565c0;
}
.danger-btn {
  width: 100%;
  padding: 10px;
  border: 1px solid #f44336;
  border-radius: 8px;
  background: white;
  color: #f44336;
  cursor: pointer;
  margin-bottom: 8px;
}

.grid-menu {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 24px;
  width: 100%;
}
.menu-card {
  padding: 24px 16px;
  border-radius: 15px;
  text-decoration: none;
  color: white;
  transition: transform 0.2s;
  box-shadow: 0 4px 10px rgba(0,0,0,0.1);
  text-align: center;
}
.menu-card:active { transform: scale(0.95); }
.menu-card h2 { margin: 0 0 8px; font-size: 1.1rem; }
.menu-card p { margin: 0; font-size: 0.85rem; opacity: 0.9; }
.kitchen { background-color: #4caf50; }
.finances { background-color: #2196f3; }
</style>
