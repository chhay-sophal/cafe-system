// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-08-09',
  modules: [
    '@pinia/nuxt',
    '@nuxtjs/tailwindcss'
  ],
  devtools: { enabled: true }
})
