import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.use(ElementPlus)
app.mount('#app')

// 移除启动兜底动画（淡出后删除）
const boot = document.getElementById('boot')
if (boot) {
  requestAnimationFrame(() => {
    boot.classList.add('boot-done')
    setTimeout(() => boot.remove(), 400)
  })
}