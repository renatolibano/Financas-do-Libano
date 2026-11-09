import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
const appConfig = JSON.parse(fs.readFileSync("./public/app-config.json", "utf-8"));
// Build do app Android (VITE_NATIVE=1): sem service worker/PWA — os arquivos já vão dentro do APK.
const native = process.env.VITE_NATIVE === "1";

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_CONFIG__: JSON.stringify(appConfig) },
  worker: { format: "es" },
  plugins: [
    react(),
    VitePWA({
      disable: native,
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
        // Clique em notificação (metas diárias) abre o app — ver public/sw-notify.js
        importScripts: ["/sw-notify.js"],
        // O app cresceu e o bundle principal passou do limite padrão de
        // pré-cache do Workbox (2 MiB), o que quebra o build. Aumentando
        // esse teto pra caber o app inteiro — o ideal a longo prazo é
        // dividir o bundle em pedaços menores (code-splitting), mas isso
        // é uma mudança maior; por ora, isso resolve o build.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Motor do transcritor de audiolivros (onnxruntime, ~22 MB): fora do pré-cache para não pesar a
        // instalação do app; é guardado no cache só quando a transcrição é usada pela primeira vez.
        globIgnores: ["**/ort-wasm*"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/ort-wasm/.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "ort-wasm", expiration: { maxEntries: 4 } },
          },
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
