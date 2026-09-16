import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

import AutoImport from 'unplugin-auto-import/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'

import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'

// 使用 createRequire 读取 package.json
const require = createRequire(import.meta.url)

/**
 * 获取当前 Git commit hash（短格式）
 */
function getCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  }
  catch {
    return 'unknown'
  }
}

// 读取 package.json 获取版本号
const packageJson = require('./package.json')

// https://vite.dev/config/
export default defineConfig({
  // CF-Server-Monitor 主题产物为 index.html + assets/，且可能部署在子路径，
  // 因此使用相对路径引用静态资源
  base: './',
  // 关闭 publicDir：主题目录只允许 index.html 与 assets/，
  // 旗帜与 OS 图标由默认皮肤提供（/flags/<code>.svg、/os-icons/<filename>）
  publicDir: false,
  // 定义全局常量，在构建时注入
  define: {
    __BUILD_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_GIT_HASH__: JSON.stringify(getCommitHash()),
  },
  plugins: [
    vue(),
    UnoCSS(),
    AutoImport({
      imports: [
        'vue',
        {
          'naive-ui': [
            'useDialog',
            'useMessage',
            'useNotification',
            'useLoadingBar',
          ],
        },
      ],
    }),
    Components({
      resolvers: [NaiveUiResolver()],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
  },
  build: {
    // 调整 chunk 大小警告阈值
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (['/node_modules/vue/', '/node_modules/vue-router/', '/node_modules/pinia/'].some(dependency => id.includes(dependency))) {
            return 'vue-vendor'
          }
          if (['/node_modules/echarts/', '/node_modules/vue-echarts/'].some(dependency => id.includes(dependency))) {
            return 'echarts'
          }
          if (id.includes('/node_modules/naive-ui/')) {
            return 'naive-ui'
          }
          if (id.includes('/node_modules/@vueuse/core/')) {
            return 'vueuse'
          }
          return undefined
        },
      },
    },
  },
})
