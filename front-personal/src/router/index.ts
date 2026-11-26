import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/lib/supabaseClient'
import Inicio from '../views/Finances.vue'
import Presupuestos from '../views/Budgets.vue'
import Movimientos from '../views/Movimientos.vue'
import Ajustes from '../views/Ajustes.vue'
import Cuentas from '../views/Cuentas.vue'
import Login from '../views/loginView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'login', component: Login },
    { path: '/home', redirect: '/finances' },
    { path: '/finances', name: 'Inicio', component: Inicio, meta: { requiresAuth: true } },
    { path: '/presupuestos', name: 'Presupuestos', component: Presupuestos, meta: { requiresAuth: true } },
    { path: '/movimientos', name: 'Movimientos', component: Movimientos, meta: { requiresAuth: true } },
    { path: '/ajustes', name: 'Ajustes', component: Ajustes, meta: { requiresAuth: true } },
    { path: '/cuentas', name: 'Cuentas', component: Cuentas, meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', redirect: '/finances' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

// Guardia de sesión
router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return { name: 'login' }
  }
  return true
})

export default router
