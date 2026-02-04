// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-02-03',
  ssr: false,
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss'],
  buildDir: '.nuxt2',
  css: ['~/assets/css/main.css'],
  vite: {
    cacheDir: '.vite-cache',
    optimizeDeps: {
      noDiscovery: true,
      include: [],
    },
    server: {
      hmr: {
        protocol: "ws",
        host: "127.0.0.1",
        clientPort: 3000,
        path: "/_nuxt/",
      },
      watch: {
        usePolling: true,
      },
    },
  },
  nitro: {
    preset: 'node-server',
    compatibilityDate: '2026-02-03',
  },
});
