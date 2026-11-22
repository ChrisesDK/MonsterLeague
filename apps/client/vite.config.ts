import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Short git hash of the build, recorded with every playtest result. */
function gitVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

// GitHub Pages serves the app from /<repo>/; the deploy workflow sets VITE_BASE.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(gitVersion()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Odense Monster League',
        short_name: 'OML',
        description: 'Walk Odense, meet creatures and battle the arenas',
        lang: 'da',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        // the logo's night navy (the bars then follow the paper colour, see main.tsx)
        background_color: '#1b2130',
        theme_color: '#1b2130',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // Everything the app needs is precached, so it works offline after the first load.
        globPatterns: ['**/*.{js,css,html,svg,webmanifest,woff2}', 'fonts/**/*.pbf'],
        // The region file chunk (tutorial placement, spawn districts) is precached too, so
        // the game works offline after the first load.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { host: true },
});
