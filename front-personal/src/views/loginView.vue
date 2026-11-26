<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'vue-router'

const router = useRouter()
const loading = ref(false)
const error = ref('')

// After OAuth redirect, Supabase puts tokens in the URL hash.
// Wait for the session to be established, then redirect to /home.
onMounted(async () => {
  const { data } = await supabase.auth.getSession()
  if (data.session) {
    router.replace('/home')
    return
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      router.replace('/home')
    }
  })
})

const handleGoogleLogin = async () => {
  loading.value = true
  error.value = ''

  const { error: authError } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + import.meta.env.BASE_URL,
    },
  })

  if (authError) {
    console.error('Error al entrar:', authError.message)
    error.value = authError.message
    loading.value = false
  }
}
</script>

<template>
  <main class="login">
    <div class="bloque azul sombra marca">
      <span class="moneda" aria-hidden="true">$</span>
      <h1 class="titulo-pagina" style="color: #fff; font-size: 34px">Mis Finanzas</h1>
      <p style="margin: 0; font-weight: 500">Registra tus gastos, arma presupuestos y compártelos con tu pareja.</p>
    </div>
    <button class="btn google" @click="handleGoogleLogin" :disabled="loading">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      <span>{{ loading ? 'Entrando…' : 'Entrar con Google' }}</span>
    </button>
    <p v-if="error" class="error">{{ error }}</p>
  </main>
</template>

<style scoped>
.login { min-height: 100vh; padding: 24px 18px; display: flex; flex-direction: column; justify-content: center; gap: 20px; }
.marca { display: flex; flex-direction: column; gap: 12px; padding: 24px; }
.moneda {
  width: 64px; height: 64px; border-radius: 50%; background: var(--amarillo); color: var(--tinta);
  border: 3px solid var(--tinta); display: flex; align-items: center; justify-content: center;
  font-family: var(--titulo); font-size: 34px; font-weight: 700;
}
.google { min-height: 56px; font-size: 16px; box-shadow: var(--sombra-chica); }
</style>
