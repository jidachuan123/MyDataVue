import { createRouter, createWebHistory } from 'vue-router'
import Login from '../views/Login.vue'
import Home from '../views/Home.vue'
import SalesDetail1Data from '../views/SalesDetail3.vue'
import SalesDetail2Data from '../views/SalesDetail2Data.vue'

const routes = [
  { path: '/', redirect: '/home' },
  { path: '/login', name: 'Login', component: Login },
  { path: '/home', name: 'Home', component: Home, meta: { requiresAuth: true } },
  { path: '/sales-detail-1', name: 'SalesDetail1Data', component: SalesDetail1Data, meta: { requiresAuth: true } },
  { path: '/sales-detail-2', name: 'SalesDetail2Data', component: SalesDetail2Data, meta: { requiresAuth: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/home')
  } else {
    next()
  }
})

export default router
