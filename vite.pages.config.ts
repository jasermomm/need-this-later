import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.BASE_PATH || "/need-this-later/",
  plugins: [react()],
  build: { outDir: "dist-pages", emptyOutDir: true, sourcemap: true },
});
