import { createRouter, createWebHistory } from 'vue-router'
import TransactionView from "@/views/TransactionView.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'Transactions',
      component: TransactionView
    },
    {
      path: '/categories',
      name: 'Vendor Categories',
      component: () => import('../views/CategoryView.vue')
    },
    {
      path: '/import',
      name: 'import',
      component: () => import('../views/ImportView.vue')
    },
    {
      path: '/transactions',
      name: 'transactions',
      component: () => import('../views/TransactionListView.vue')
    }
  ]
})

export default router
