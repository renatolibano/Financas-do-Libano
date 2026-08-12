import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Libano — Finanças + Vida",
        short_name: "Libano",
        description: "Dashboard financeiro pessoal e organização de vida",
        theme_color: "#0b0d12",
        background_color: "#080a0f",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Garante que o app abra offline depois da primeira visita
        globPatterns: ["**/*.{js,mjs,css,html,png,svg,ico}"],
        runtimeCaching: [
          {
            // Chamadas ao Supabase sempre vão para a rede (dados financeiros atualizados)
            urlPattern: ({ url }) => url.hostname.endsWith("supabase.co"),
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: {
        enabled: true, // permite testar o PWA também em modo dev (npm run dev)
      },
    }),
  ],
});
