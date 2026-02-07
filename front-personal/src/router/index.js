import { createRouter, createWebHistory } from 'vue-router';
import Home from '../views/Home.vue';
import Kitchen from '../views/Kitchen.vue';
import Finances from '../views/Finances.vue';

const routes = [
    {
        path: '/',
        name: 'Home',
        component: Home,
    },
    {
        path: '/kitchen-storage',
        name: 'Kitchen',
        component: Kitchen,
    },
    {
        path: '/finances'
        name: 'Finances',
        component: Finances,
    }
]

const router = createRouter({
    history: createWebHistory(),
    routers
})

export default router;