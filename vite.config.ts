import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      manifest: {
        name: "Learn · Course Hub",
        short_name: "Learn",
        description:
          "Practice questions, review mistakes, and sit timed mock exams for university courses. Progress stays on your device.",
        lang: "en",
        theme_color: "#0f1420",
        background_color: "#0f1420",
        display: "standalone",
        start_url: "./",
        scope: "./",
        categories: ["education"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        navigateFallback: "index.html",
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  base: "./",
  build: {
    // Course data loads in per-course chunks; a large paper set can pass 700 kB.
    chunkSizeWarningLimit: 900,
    manifest: true,
  },
});
