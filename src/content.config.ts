// src/content.config.ts — Astro content collection for portfolio projects.
// One .mdx file per project under src/content/projects/ holds BOTH the card
// metadata (frontmatter) and the detail-page body. Route is derived as
// /{category}/{id}, where id is the file path (e.g. 'smite/gravity-switch').
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    company: z.string().default(''),
    category: z.enum(['techart', 'devops']),
    featured: z.boolean().default(false),
    order: z.number().default(999),
    image: z.string().nullable().default(null),
    gif: z.string().nullable().default(null),
    video: z.string().nullable().default(null),
    description: z.string(),
    tagline: z.string().optional(), // one line for the card; falls back to description
    hero: z.string().nullable().default(null), // media at the top of the detail page; .mp4 autoplays muted. Defaults to `image`
    heroCaption: z.string().optional(),
    highlights: z.array(z.string()).default([]),
    tech_tags: z.array(z.string()).default([]),
    pageTitle: z.string().optional(), // overrides the <title>; defaults to "<title> - <Category>"
    meta: z
      .object({
        duration: z.string().default(''),
        role: z.string().default(''),
        platforms: z.string().default(''),
        team_size: z.string().default(''),
      })
      .partial()
      .optional(),
  }),
});

export const collections = { projects };
