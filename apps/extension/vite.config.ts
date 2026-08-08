import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  publicDir: "public",
  build: {
    outDir: resolve(import.meta.dirname, "../../dist-extension"),
    emptyOutDir: true,
    rollupOptions: {
      input: { popup: resolve(import.meta.dirname, "popup.html"), background: resolve(import.meta.dirname, "src/service-worker.ts") },
      output: {
        entryFileNames: (chunk) => chunk.name === "background" ? "service-worker.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
