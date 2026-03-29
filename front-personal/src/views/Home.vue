<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const { user, signOut } = useAuth()

const handleSignOut = async () => {
  await signOut()
  router.push('/')
}
</script>

<template>
  <div class="home-page">
    <div class="menu-container">
      <div class="top-bar">
        <h1>Home</h1>
        <button class="signout-btn" @click="handleSignOut">Sign out</button>
      </div>

      <div class="grid-menu">
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

.menu-container {
  display: flex;
  flex-direction: column;
}
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.top-bar h1 { margin: 0; font-size: 1.4rem; color: #e0e0e0; }
.signout-btn {
  background: none;
  border: 1px solid #2a2a4a;
  border-radius: 8px;
  padding: 6px 14px;
  color: #8a8a9a;
  font-size: 0.85rem;
  cursor: pointer;
}

.grid-menu {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin-top: 28px;
}
.menu-card {
  padding: 36px 20px;
  border-radius: 18px;
  text-decoration: none;
  color: white;
  transition: transform 0.2s;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}
.menu-card:active { transform: scale(0.97); }
.card-icon { font-size: 2.5rem; margin-bottom: 8px; }
.menu-card h2 { margin: 0 0 6px; font-size: 1.15rem; }
.menu-card p { margin: 0; font-size: 0.85rem; opacity: 0.85; }
.finances {
  background: linear-gradient(135deg, #3a0ca3, #6c63ff);
}
</style>
