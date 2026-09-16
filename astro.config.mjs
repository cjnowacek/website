// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://cjnowacek.com',
  integrations: [
    mdx(),
    sitemap({
      // Unlisted projects (reachable by URL, absent from every listing) stay out
      // of the sitemap so they are not offered up for indexing.
      filter: (page) => !/\/(sintern|deadline-deploy|omnitool)\/$/.test(page),
    }),
  ],
  // Existing absolute asset URLs like /static/css/main.css are served from public/.
});
