import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import ErrorWindow from './views/ErrorWindow.vue'

const app = createApp(ErrorWindow)
app.use(ElementPlus)
app.mount('#app')