import { createRouter, createWebHashHistory } from 'vue-router'

// CF-Server-Monitor 第三方主题约定使用 hash 路由：
//   首页   -> /#/
//   详情页 -> /#/server/:id
// 管理后台由内置默认主题接管（/admin#admin），第三方主题不实现管理页。
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/server/:id',
      name: 'server-detail',
      component: () => import('@/views/InstanceDetail.vue'),
    },
  ],
})

router.beforeEach(() => {
  window.$loadingBar.start()
})

router.afterEach(() => {
  window.$loadingBar.finish()
})

export default router
