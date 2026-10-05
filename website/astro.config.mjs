import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

// The root package.json version is the single source of truth: the release
// workflow names the DMG asset after it, so the site must always match.
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

// https://astro.build/config
export default defineConfig({
  site: 'https://skill-one.github.io',
  base: '/skill-one',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
  },
  devToolbar: {
    enabled: false,
  },
});
