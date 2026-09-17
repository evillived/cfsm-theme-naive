import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { ensureWebFontStylesheet } from './utils/webFont'

import './styles/main.scss'
import 'virtual:uno.css'

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)

app.mount('#app')

// 正文网页字体：字体是渐进增强，按当前生效的 CSP 决定是否加载，不阻塞挂载也不抛错
void ensureWebFontStylesheet()
