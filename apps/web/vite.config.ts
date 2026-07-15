import { fileURLToPath, URL } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      injectRegister: false,
      registerType: "autoUpdate",
      manifest: {
        name: "Personal Dev KG",
        short_name: "Dev KG",
        description: "An AI-guided learning workspace for practice, projects, notes, recall, and progress.",
        theme_color: "#080d18",
        background_color: "#f8fafc",
        display: "standalone",
        start_url: "/app",
        scope: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
        shortcuts: [
          { name: "Home", short_name: "Home", description: "Open your next learning action", url: "/app", icons: [{ src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" }] },
          { name: "Capture", short_name: "Capture", description: "Capture a learning item", url: "/capture", icons: [{ src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" }] },
        ],
        share_target: {
          action: "/capture",
          method: "GET",
          enctype: "application/x-www-form-urlencoded",
          params: { title: "title", text: "text", url: "url" },
        },
      },
      workbox: {
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 512 * 1024,
        globPatterns: ["index.html", "manifest.webmanifest", "pwa-*.png", "assets/index-*.css", "assets/inter-latin-*-normal-*.woff2", "assets/jetbrains-mono-latin-*-normal-*.woff2"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/auth(?:\/|$)/],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => ["script", "style", "font"].includes(request.destination),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "visited-app-chunks", expiration: { maxEntries: 40, maxAgeSeconds: 7 * 24 * 60 * 60 } },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { manifest: true, sourcemap: false },
  server: { port: 5173 },
})
