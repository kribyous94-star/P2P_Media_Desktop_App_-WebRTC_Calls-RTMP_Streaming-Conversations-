import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  // Tauri attend le serveur Vite sur un port fixe
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Sur Linux, surveiller les changements via polling si inotify est limité
      usePolling: false,
    },
  },
  // Empêche Vite d'obscurcir les messages d'erreur Rust
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // Tauri supporte ES2021+ sur toutes les plateformes
    target: process.env["TAURI_ENV_PLATFORM"] === "windows"
      ? "chrome105"
      : "safari13",
    minify: process.env["TAURI_ENV_DEBUG"] ? false : "esbuild",
    sourcemap: !!process.env["TAURI_ENV_DEBUG"],
    outDir: "dist",
  },
}));
