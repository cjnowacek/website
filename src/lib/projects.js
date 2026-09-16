// src/lib/projects.js — helpers for reading the projects content collection.
import { getCollection } from 'astro:content';

// Map a collection entry to the flat shape ProjectCard expects.
// The detail route is derived from category + id (e.g. /devops/deadline-deploy,
// /techart/smite/gravity-switch).
export function toCard(entry) {
  return { ...entry.data, id: entry.id, link: `/${entry.data.category}/${entry.id}` };
}

// Fetch card-shaped projects by explicit ids, preserving the given order.
export async function getProjectCards(ids) {
  const all = await getCollection('projects', (e) => !e.data.draft);
  const byId = new Map(all.map((e) => [e.id, e]));
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map(toCard);
}
