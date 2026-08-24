// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-08-09',
  modules: [
    '@pinia/nuxt',
    '@nuxtjs/tailwindcss'
  ],
  devtools: { enabled: true },
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
    // The backend API already occupies :3000 in local dev.
    port: 3001
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
