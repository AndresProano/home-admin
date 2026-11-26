import { createApp } from 'vue'
import App from './App.vue'
import route from './router'

const app = createApp(App)

app.use(route)
app.mount('#app')

// PWA: solo en producción (en desarrollo el caché estorba)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => { /* sin SW la app funciona igual */ })
  })
}
