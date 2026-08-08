import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

async function listPrecacheFiles(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(resolve(directory, prefix), { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return listPrecacheFiles(directory, relativePath);
    if (entry.name === "sw.js" || entry.name.endsWith(".map")) return [];
    return [`./${relativePath}`];
  }));
  return files.flat();
}

function injectServiceWorkerPrecache(): Plugin {
  return {
    name: "inject-service-worker-precache",
    apply: "build",
    async closeBundle() {
      const outputDirectory = resolve(process.cwd(), "dist-pages");
      const serviceWorkerPath = resolve(outputDirectory, "sw.js");
      const files = await listPrecacheFiles(outputDirectory);
      const applicationShell = ["./", ...files.filter((file) => file !== "./index.html")].sort();
      const source = await readFile(serviceWorkerPath, "utf8");
      const updated = source.replace(
        /const APP_SHELL = \[[^;]+\];/,
        `const APP_SHELL = ${JSON.stringify(applicationShell)};`,
      );
      if (updated === source) throw new Error("Service worker APP_SHELL placeholder was not found");
      await writeFile(serviceWorkerPath, updated, "utf8");
    },
  };
}

export default defineConfig({
  base: process.env.BASE_PATH || "/need-this-later/",
  plugins: [react(), injectServiceWorkerPrecache()],
  build: { outDir: "dist-pages", emptyOutDir: true, sourcemap: true },
});
