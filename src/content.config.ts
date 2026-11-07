import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'zod';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    tagline: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    status: z.string(),
    role: z.string(),
    stack: z.array(z.string()),
    repo: z.url(),
    release: z.url().optional(),
    order: z.number().default(10),
    presentation: z.object({
      kind: z.enum(['generic', 'translation', 'extraction', 'flow']).default('generic'),
      eyebrow: z.string().optional(),
      titleLines: z.array(z.string()).min(1).max(3).optional(),
      caption: z.string().optional(),
      cover: z.object({
        src: z.string().startsWith('/images/'),
        alt: z.string().min(1),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        note: z.string().optional(),
      }).optional(),
    }).default({ kind: 'generic' }),
    evidenceNote: z.string().optional(),
    metrics: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
    contribution: z.string().optional(),
    updates: z.array(z.object({ date: z.coerce.date(), title: z.string(), description: z.string() })).default([]),
  }),
});

const writing = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/writing' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    project: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    project: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const now = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/now' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    updated: z.coerce.date(),
  }),
});

const home = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/home' }),
  schema: z.object({
    edition: z.string(),
    heading: z.tuple([z.string(), z.string()]),
    intro: z.string(),
    status: z.string(),
    projectsLimit: z.number().int().min(1).max(12).default(6),
    visual: z.object({ enabled: z.boolean(), autoplay: z.boolean() }),
    about: z.object({ heading: z.tuple([z.string(), z.string()]), text: z.string(), collaboration: z.string() }),
  }),
});

export const collections = { projects, writing, notes, now, home };
