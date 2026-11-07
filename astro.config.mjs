import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://nineanswerer.github.io',
  output: 'static',
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    },
  },
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  // Prebundle CommonJS loaders for Astro's content-sync module runner.
  vite: {
    environments: {
      astro: { optimizeDeps: { include: ['yaml', 'picomatch'] } },
    },
  },
});
