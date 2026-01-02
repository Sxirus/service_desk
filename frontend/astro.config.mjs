// @ts-check
import { defineConfig } from 'astro/config';

import node from '@astrojs/node';

import tailwindcss from '@tailwindcss/vite';

import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  output: "server",

  adapter: node({
    mode: 'standalone',
  }),

  vite: {
    plugins: [tailwindcss()],
  },

  // Note: i18n is handled by react-i18next in React components
  // Astro's i18n config is only used for HTML lang attribute
});