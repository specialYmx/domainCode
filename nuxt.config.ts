// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-01-30',
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~/assets/css/main.css'],
  
  // 修复 Vite HMR WebSocket 问题
  vite: {
    server: {
      hmr: {
        protocol: 'ws',
        host: '127.0.0.1',
        clientPort: 3000, // 与开发服务器端口一致
      },
      watch: {
        usePolling: true, // Windows 文件系统兼容性
      }
    }
  },

  // 优化 SSR 启动性能
  nitro: {
    preset: 'node-server',
  }
})
