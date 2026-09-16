// src/pages/rss.xml.js — RSS feed of the dev log at /rss.xml.
import rss from '@astrojs/rss';
import { siteName, siteDescription } from '../config.js';
import { getPosts } from '../lib/devlog.js';

export async function GET(context) {
  const posts = await getPosts();
  return rss({
    title: `${siteName}: Dev Log`,
    description: siteDescription,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.summary,
      link: `/devlog/${post.id}/`,
      categories: post.data.tags,
    })),
  });
}
