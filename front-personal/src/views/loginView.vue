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
  <div class="login-container">
    <div class="login-card">
      <h1>House Organizer</h1>
      <p>Sign in to manage your home</p>
      <div id="googleBtn"></div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  padding: 20px;
}
.login-card {
  background: #16213e;
  border-radius: 20px;
  padding: 48px 32px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  width: 100%;
  max-width: 360px;
}
.login-card h1 {
  margin: 0 0 8px;
  font-size: 1.8rem;
  color: #e0e0e0;
}
.login-card p {
  color: #8a8a9a;
  margin: 0 0 32px;
}
#googleBtn {
  display: flex;
  justify-content: center;
}
</style>
