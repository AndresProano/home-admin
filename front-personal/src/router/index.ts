import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/lib/supabaseClient'
import Home from '../views/Home.vue'
import Kitchen from '../views/Kitchen.vue'
import Finances from '../views/Finances.vue'
import login from '../views/loginView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: login,
    },
    {
      path: '/home',
      name: 'Home',
      component: Home,
      meta: { requiresAuth: true },
    },
    {
      path: '/kitchen-storage',
      name: 'Kitchen',
      component: Kitchen,
      meta: { requiresAuth: true },
    },
    {
      path: '/finances',
      name: 'Finances',
      component: Finances,
      meta: { requiresAuth: true },
    },
  ],
})

// Auth guard
router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      return { name: 'login' }
    }
  }
})

export default router
