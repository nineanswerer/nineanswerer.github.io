import { getCollection } from 'astro:content';

export async function getPublishedProjects() {
  return (await getCollection('projects', ({ data }) => !data.draft))
    .sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id, 'en'));
}

export type FeedItem = {
  id: string;
  type: '长文' | '碎片';
  title: string;
  description: string;
  date: Date;
  updated?: Date;
  url: string;
  tags: string[];
  project?: string;
};

export async function getFeedItems(): Promise<FeedItem[]> {
  const [posts, notes] = await Promise.all([
    getCollection('writing', ({ data }) => !data.draft),
    getCollection('notes', ({ data }) => !data.draft),
  ]);
  return [
    ...posts.map((post) => ({
      id: post.id, type: '长文' as const, title: post.data.title,
      description: post.data.description, date: post.data.date,
      updated: post.data.updated, url: `/writing/${post.id}/`,
      tags: post.data.tags, project: post.data.project,
    })),
    ...notes.map((note) => ({
      id: note.id, type: '碎片' as const, title: note.data.title,
      description: note.data.description, date: note.data.date,
      updated: note.data.updated, url: `/notes/${note.id}/`,
      tags: note.data.tags, project: note.data.project,
    })),
  ].sort((a, b) => (b.updated ?? b.date).valueOf() - (a.updated ?? a.date).valueOf());
}
