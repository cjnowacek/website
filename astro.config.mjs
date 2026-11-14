// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Under `astro dev` only: serve the private hub's screenshots (/private/img/...)
// from the gitignored private-assets/img/, so a private page can be previewed
// while it is written. On the host the gate (public/includes/private_gate.php)
// serves them from outside the webroot, behind the password.
const privateImgDir = join(fileURLToPath(new URL('.', import.meta.url)), 'private-assets', 'img');
const privateAssetsDev = {
  name: 'private-assets-dev',
  hooks: {
    'astro:server:setup': ({ server }) => {
      server.middlewares.use('/private/img', (req, res, next) => {
        const file = normalize(join(privateImgDir, decodeURIComponent((req.url || '').split('?')[0])));
        const types = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' };
        if (!file.startsWith(privateImgDir + sep) || !existsSync(file) || !statSync(file).isFile() || !types[extname(file)]) return next();
        res.setHeader('Content-Type', types[extname(file)]);
        createReadStream(file).pipe(res);
      });
    },
  },
};

// https://astro.build/config
export default defineConfig({
  site: 'https://cjnowacek.com',
  integrations: [
    mdx(),
    sitemap({
      // Unlisted projects (reachable by URL, absent from every listing) stay out
      // of the sitemap so they are not offered up for indexing.
      // The private hub (/private/...) is moved out of dist/ after the build
      // (scripts/split-private.mjs) and must not be listed either.
      filter: (page) => !/\/(sintern|deadline-deploy|omnitool)\/$/.test(page) && !/\/private\//.test(page),
    }),
    privateAssetsDev,
  ],
  // Existing absolute asset URLs like /static/css/main.css are served from public/.
});
