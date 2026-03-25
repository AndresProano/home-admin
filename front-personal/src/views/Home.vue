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

      <div v-if="showSettings" class="settings-panel">
        <div class="invite-section">
          <strong>Invite Code</strong>
          <div class="invite-row">
            <code>{{ currentHousehold?.invite_code }}</code>
            <button @click="copyInviteCode">Copy</button>
          </div>
          <small>Share this code so family members can join.</small>
        </div>
        <div class="members-section">
          <strong>Members ({{ members.length }})</strong>
          <div v-for="m in members" :key="m.id" class="member-item">
            <span class="member-role">{{ m.role }}</span>
          </div>
        </div>
        <button class="danger-btn" @click="handleLeave">Leave Household</button>
        <button class="signout-link" @click="handleSignOut">Sign out</button>
      </div>

      <div class="grid-menu">
        <router-link to="/kitchen-storage" class="menu-card kitchen">
          <div class="card-icon">&#127858;</div>
          <h2>Kitchen</h2>
          <p>Manage your inventory</p>
        </router-link>

        <router-link to="/finances" class="menu-card finances">
          <div class="card-icon">&#128176;</div>
          <h2>Finances</h2>
          <p>Track your budget</p>
        </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-page { padding: 20px; }

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 80vh;
  color: #8a8a9a;
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
.setup-container h1 { margin-bottom: 8px; color: #e0e0e0; }
.setup-container p { color: #8a8a9a; margin-bottom: 24px; }
.setup-container form { width: 100%; max-width: 320px; }
.setup-container label {
  display: block;
  text-align: left;
  margin-bottom: 16px;
  font-size: 0.9rem;
  color: #8a8a9a;
}
.setup-container input {
  display: block;
  width: 100%;
  padding: 12px;
  border: 1px solid #2a2a4a;
  border-radius: 10px;
  margin-top: 6px;
  font-size: 1rem;
  box-sizing: border-box;
  background: #16213e;
  color: #e0e0e0;
}
.setup-container input:focus {
  outline: none;
  border-color: #6c63ff;
}

.tabs {
  display: flex;
  margin-bottom: 20px;
  background: #16213e;
  border-radius: 12px;
  padding: 4px;
  width: 100%;
  max-width: 320px;
}
.tabs button {
  flex: 1;
  padding: 10px;
  border: none;
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.95rem;
  color: #8a8a9a;
}
.tabs button.active {
  background: #6c63ff;
  color: white;
}

.primary-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  background: #6c63ff;
  color: white;
  font-size: 1rem;
  cursor: pointer;
}
.error { color: #ff6b6b; font-size: 0.9rem; }
.signout-link {
  background: none;
  border: none;
  color: #8a8a9a;
  cursor: pointer;
  margin-top: 16px;
  text-decoration: underline;
}

/* Menu */
.menu-container {
  display: flex;
  flex-direction: column;
}
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}
.top-bar h1 { margin: 0; font-size: 1.4rem; color: #e0e0e0; }
.household-name { color: #8a8a9a; margin: 4px 0 0; font-size: 0.9rem; }
.settings-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 4px 8px;
  color: #8a8a9a;
}

.settings-panel {
  background: #16213e;
  border-radius: 14px;
  padding: 18px;
  margin-bottom: 16px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}
.invite-section { margin-bottom: 16px; }
.invite-section strong { color: #e0e0e0; }
.invite-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 4px;
}
.invite-row code {
  background: #0f3460;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 1.1rem;
  letter-spacing: 2px;
  color: #6c63ff;
}
.invite-row button {
  padding: 8px 14px;
  border: 1px solid #2a2a4a;
  border-radius: 8px;
  background: #1a1a2e;
  color: #e0e0e0;
  cursor: pointer;
}
.invite-section small { color: #8a8a9a; }
.members-section { margin-bottom: 16px; }
.members-section strong { color: #e0e0e0; }
.member-item { padding: 6px 0; }
.member-role {
  background: #0f3460;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 0.8rem;
  color: #6c63ff;
}
.danger-btn {
  width: 100%;
  padding: 10px;
  border: 1px solid #ff6b6b;
  border-radius: 10px;
  background: transparent;
  color: #ff6b6b;
  cursor: pointer;
  margin-bottom: 8px;
}

.grid-menu {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 28px;
}
.menu-card {
  padding: 28px 16px;
  border-radius: 18px;
  text-decoration: none;
  color: white;
  transition: transform 0.2s;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}
.menu-card:active { transform: scale(0.95); }
.card-icon { font-size: 2.5rem; margin-bottom: 8px; }
.menu-card h2 { margin: 0 0 6px; font-size: 1.15rem; }
.menu-card p { margin: 0; font-size: 0.8rem; opacity: 0.85; }
.kitchen {
  background: linear-gradient(135deg, #2d6a4f, #40916c);
}
.finances {
  background: linear-gradient(135deg, #3a0ca3, #6c63ff);
}
</style>
