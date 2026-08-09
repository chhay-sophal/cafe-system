// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-08-09',
  modules: [
    '@pinia/nuxt',
    '@nuxtjs/tailwindcss'
  ],
  devtools: { enabled: true },
  // Internal dashboard tool backed entirely by the separate backend API - no
  // server-rendered data of its own, and auth state lives in localStorage,
  // so plain client-side rendering avoids hydration mismatches for both.
  ssr: false,
  devServer: {
    // The backend API already occupies :3000 in local dev.
    port: 3001
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3000'
    }
  }
})
