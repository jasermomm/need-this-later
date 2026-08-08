import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  publicDir: "public",
  build: {
    outDir: resolve(__dirname, "../../dist-extension"),
    emptyOutDir: true,
    rollupOptions: {
      input: { popup: resolve(__dirname, "popup.html"), background: resolve(__dirname, "src/service-worker.ts") },
      output: {
        entryFileNames: (chunk) => chunk.name === "background" ? "service-worker.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
