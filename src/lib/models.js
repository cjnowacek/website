// src/lib/models.js: helpers for the Shore House models collection.
import { getCollection } from 'astro:content';

export const groups = [
  ['outside', 'Outside'],
  ['downstairs', 'Downstairs'],
  ['upstairs', 'Upstairs'],
];

// Live entries (draft: false), ordered by group then `order`.
export async function getModels() {
  const entries = await getCollection('models', (m) => !m.data.draft);
  const groupIndex = (group) => groups.findIndex(([key]) => key === group);
  return entries.sort((a, b) => {
    const g = groupIndex(a.data.group) - groupIndex(b.data.group);
    if (g !== 0) return g;
    const o = a.data.order - b.data.order;
    if (o !== 0) return o;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
