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
        // .wasm incluído pra os decodificadores de imagem do pdf.js (ver
        // src/lib/pdf.js) também funcionarem offline, depois da 1ª visita.
        globPatterns: ["**/*.{js,mjs,css,html,png,svg,ico,wasm}"],
        // O app cresceu e o bundle principal passou do limite padrão de
        // pré-cache do Workbox (2 MiB), o que quebra o build. Aumentando
        // esse teto pra caber o app inteiro — o ideal a longo prazo é
        // dividir o bundle em pedaços menores (code-splitting), mas isso
        // é uma mudança maior; por ora, isso resolve o build.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
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
