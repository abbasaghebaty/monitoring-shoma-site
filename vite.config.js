import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages project site: https://<owner>.github.io/<repository>/
export default defineConfig({
  plugins: [react()],
  base: "/monitoring-shoma-site/",
  build: { outDir: "dist", sourcemap: false },
});
