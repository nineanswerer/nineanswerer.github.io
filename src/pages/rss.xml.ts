import rss from '@astrojs/rss';
import { site } from '../config';
import { getFeedItems } from '../content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const items = await getFeedItems();
  return rss({
    title: site.title,
    description: site.description,
    site: context.site ?? site.url,
    items: items.map((item) => ({
      title: `${item.type}｜${item.title}`,
      pubDate: item.date,
      description: item.description,
      link: item.url,
      categories: item.tags,
    })),
    customData: '<language>zh-CN</language>',
  });
}
