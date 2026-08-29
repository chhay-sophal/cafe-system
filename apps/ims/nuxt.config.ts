// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-08-09',
  modules: [
    '@pinia/nuxt',
    '@nuxtjs/tailwindcss',
    '@nuxtjs/i18n'
  ],
  i18n: {
    locales: [
      { code: 'en-US', language: 'en-US', name: 'English', file: 'en-US.json' },
      { code: 'km-KH', language: 'km-KH', name: 'ខ្មែរ', file: 'km-KH.json' }
    ],
    defaultLocale: 'en-US',
    langDir: 'locales',
    strategy: 'no_prefix',
    // Client-only SPA (see ssr: false below) - locale choice is a plain
    // user preference, so a localStorage-backed switcher is enough; no
    // need for URL prefixes or server-side Accept-Language detection.
    detectBrowserLanguage: false
  },
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/icons/icon-192.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ]
    }
  },
  // Internal dashboard tool backed entirely by the separate backend API - no
  // server-rendered data of its own, and auth state lives in localStorage,
  // so plain client-side rendering avoids hydration mismatches for both.
  ssr: false,
  devServer: {
    // The backend API already occupies :3000 in local dev. Matches the
    // IMS_PORT default in ecosystem.config.js so dev and prod agree.
    port: 8080
  },
  // Pinned so `pnpm build` always emits a standalone Node server at
  // .output/server/index.mjs, regardless of the host platform's
  // auto-detected preset.
  nitro: {
    preset: 'node-server'
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3000'
    }
  }
})
