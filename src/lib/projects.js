// src/lib/projects.js — helpers for reading the projects content collection.
import { getCollection } from 'astro:content';

// Map a collection entry to the flat shape ProjectCard expects.
// The detail route is derived from category + id (e.g. /devops/deadline-deploy,
// /techart/smite/gravity-switch).
export function toCard(entry) {
  return { ...entry.data, id: entry.id, link: `/${entry.data.category}/${entry.id}` };
}

// Fetch card-shaped projects by explicit ids, preserving the given order.
// An id that matches no entry is dropped without error; scripts/check-dist.mjs catches a listing page that names one.
export async function getProjectCards(ids) {
  const all = await getCollection('projects', (e) => !e.data.draft && !e.data.private);
  const byId = new Map(all.map((e) => [e.id, e]));
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map(toCard);
}

// The projects behind the password (`private: true`), for the hub at /private/.
// A private project never reaches a public listing or a public detail route.
export async function getPrivateProjects() {
  const all = await getCollection('projects', (e) => e.data.private);
  return all.sort((a, b) => a.data.order - b.data.order);
}
