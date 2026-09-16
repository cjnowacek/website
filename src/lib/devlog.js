// src/lib/devlog.js — helpers for the dev log collection.
import { getCollection } from 'astro:content';

export function formatDate(date) {
  // Frontmatter dates parse as UTC midnight; format in UTC so the day never shifts.
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

// Published posts, newest first. Drafts (`draft: true`) never build.
export async function getPosts() {
  const posts = await getCollection('devlog', (p) => !p.data.draft);
  return posts.sort((a, b) => b.data.date - a.data.date);
}

// Posts that belong to one project (frontmatter `project: <project id>`).
export async function getPostsForProject(projectId) {
  return (await getPosts()).filter((p) => p.data.project === projectId);
}
