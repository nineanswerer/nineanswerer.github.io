import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { site } from '../config';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = await getCollection('writing', ({ data }) => !data.draft);
  return rss({
    title: site.title,
    description: site.description,
    site: context.site ?? site.url,
    items: posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf()).map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description,
      link: `/writing/${post.id}/`,
    })),
    customData: '<language>zh-CN</language>',
  });
}
