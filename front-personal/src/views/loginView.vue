<script setup>
import { onMounted } from 'vue'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'vue-router'

const router = useRouter()

const handleGoogleLogin = async (response) => {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: response.credential,
  })

  if (error) {
    console.error('Error al entrar:', error.message)
  } else {
    console.log('¡Bienvenido!', data.user)
    router.push('/home')
  }
}

onMounted(() => {
  google.accounts.id.initialize({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    callback: handleGoogleLogin,
  })

  google.accounts.id.renderButton(
    document.getElementById("googleBtn"),
    { theme: "filled_blue", size: "large", width: "250" }
  )
})
</script>

<template>
  <div class="flex-container">
    <h1>Mi Portal Personal</h1>
    <p>Inicia sesión para gestionar tus finanzas y cocina</p>
    <div id="googleBtn"></div>
  </div>
</template>

<style scoped>
.flex-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  text-align: center;
}
</style>