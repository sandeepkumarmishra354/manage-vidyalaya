import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Fixed away from apps/web's default 5173 so both dev servers (and the
  // E2E suite's webServer entries in apps/e2e/playwright.config.ts, which
  // run both at once) can run side by side. Set here rather than via a
  // `vite --port` CLI flag: pnpm's `-- --port N` passthrough silently
  // doesn't reach vite's CLI parser in this monorepo's pnpm/vite version
  // combination (confirmed by testing -- it always binds vite's own
  // default 5173 regardless of the flag), a latent bug also affecting
  // apps/web's own webServer entry, just invisible there since 5173
  // happens to already be vite's default.
  server: { port: 5175, strictPort: true },
});
