export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC',
  }).format(date).replaceAll('/', '.');
}

export function repositoryName(url: string) {
  return url.replace('https://github.com/', '').replace(/\/$/, '');
}
