import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// 说明：已移除 vite-plugin-monaco-editor（2022 年停更，不兼容 Vite 7 的 ?worker 处理）。
// Monaco 的 worker 由 CodeEditor.vue 通过原生 import '...?worker' + MonacoEnvironment 配置，
// 走 Vite 原生 worker 打包。
export default defineConfig({
  plugins: [
    vue(),
  ],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        'error-window': path.resolve(__dirname, 'error-window.html'),
      },
      output: {
        manualChunks: {
          monaco: ['monaco-editor']
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // monaco-editor 0.56+ 的 package.json exports 限制子路径导入（?.worker 无法解析），
      // 显式指向包内 ESM 目录，绕开 exports 限制，保持官方 ?worker 用法
      'monaco-editor/esm': path.resolve(__dirname, 'node_modules/monaco-editor/esm'),
    },
  },
  // 关键：monaco-editor 必须排除出依赖预打包。
  // 整包 import（editor.api）会触发 optimizeDeps，预打包时扫描到
  // '.../vs/editor/editor.worker?worker' 等变体未注册 → 开发模式报
  // "optimized info should be defined"（build 不受影响）。
  // 排除后 monaco 走源码 ESM，5 个 ?worker 由 Vite 原生 worker 管线处理。
  optimizeDeps: {
    exclude: ['monaco-editor'],
  },
})
