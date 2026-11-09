// Gera o build web em "modo app" (sem service worker) e copia para o projeto Android (pasta android/).
// Uso: npm run build:android
import { execSync } from "node:child_process";

const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });
run("npx vite build", { VITE_NATIVE: "1" });
run("npx cap sync android");
