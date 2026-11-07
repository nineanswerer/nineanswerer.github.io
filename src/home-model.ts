/** Pure selection logic shared by the home page and regression tests. */
type ProjectLike = { id: string; data: { draft?: boolean; featured?: boolean; order: number } };

export function selectHomeProjects<T extends ProjectLike>(entries: T[], limit = 6) {
  const published = entries.filter(({ data }) => !data.draft)
    .sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id, 'en'));
  const featured = published.find(({ data }) => data.featured) ?? published[0];
  const remaining = published.filter((entry) => entry !== featured);
  return { featured, projects: remaining.slice(0, Math.max(0, limit - 1)), total: published.length };
}
