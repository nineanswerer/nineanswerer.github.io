/** Public editorial records, never inferred Git commits or releases. */
type Project = { id: string; data: { title: string; description: string; status: string; date: Date; updated?: Date;
  draft?: boolean; order: number; updates: { date: Date; title: string; description: string }[] } };
type Article = { id: string; title: string; description: string; date: Date; updated?: Date;
  project?: string; url: string; draft?: boolean };
export type GrowthRecord = { id: string; date: string; title: string; description: string;
  kind: '里程碑' | '文章' | '文章修订' | '项目记录'; url: string };
export type GrowthBranch = { id: string; title: string; url: string; status: string; records: GrowthRecord[]; total: number };
export type GrowthGraph = { branches: GrowthBranch[]; latest: string; totalProjects: number };
export type Vector = [number, number, number];
const day = (date: Date) => date.toISOString().slice(0, 10);

export function buildProjectGrowth(projects: Project[], articles: Article[], limit = 6): GrowthGraph {
  const published = projects.filter(project => !project.data.draft)
    .sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id, 'en'));
  const branches = published.slice(0, limit).map(({ id, data }) => {
    const url = `/projects/${id}/`;
    const milestones: GrowthRecord[] = data.updates.map(update => ({
      id: `${id}:milestone:${day(update.date)}:${update.title}`, date: day(update.date),
      title: update.title, description: update.description, kind: '里程碑', url,
    }));
    const writing: GrowthRecord[] = articles.filter(article => !article.draft && article.project === id)
      .map(article => ({ id: `${id}:article:${article.id}`, date: day(article.updated ?? article.date),
        title: article.title, description: article.description,
        kind: article.updated && article.updated > article.date ? '文章修订' : '文章', url: article.url }));
    const records = [...milestones, ...writing];
    if (!records.length) records.push({ id: `${id}:project`, date: day(data.updated ?? data.date), title: data.updated && data.updated > data.date ? '项目资料更新' : '项目记录',
      description: data.description, kind: '项目记录', url });
    // Same-day articles and milestones remain distinct records.
    records.sort((a, b) => a.date.localeCompare(b.date) || Number(a.kind === '里程碑') - Number(b.kind === '里程碑') || a.id.localeCompare(b.id, 'en'));
    return { id, title: data.title, url, status: data.status, records: records.slice(-6), total: records.length };
  });
  return { branches, latest: branches.flatMap(branch => branch.records).reduce((latest, record) => record.date > latest ? record.date : latest, ''), totalProjects: published.length };
}

/** Each branch is a project. Nodes run inside to outside in date order.
 * Spacing expresses sequence, not duration or project quality. */
export function branchPoint(index: number, count: number, progress: number, expanded = 0): Vector {
  const angle = -Math.PI / 2 + index / Math.max(count, 1) * Math.PI * 2 + .42 * progress;
  const radius = 2.15 * Math.sin(progress * Math.PI / 2);
  const x = radius * Math.cos(angle), y = 1.25 - 2.8 * progress, z = radius * Math.sin(angle);
  const spread = count === 1 ? 0 : (index / (count - 1) - .5) * 4.7;
  return [x + (spread * Math.sin(progress * Math.PI / 2) - x) * expanded,
    y + (.24 * Math.abs(spread) * progress - .18 * progress) * expanded, z * (1 - expanded)];
}
export function recordProgress(index: number, count: number) { return count === 1 ? .94 : .27 + index / (count - 1) * .67; }
export function rotatePoint([x, y, z]: Vector, ax: number, ay: number): Vector {
  const px = x * Math.cos(ay) + z * Math.sin(ay), pz = -x * Math.sin(ay) + z * Math.cos(ay);
  return [px, y * Math.cos(ax) - pz * Math.sin(ax), y * Math.sin(ax) + pz * Math.cos(ax)];
}
export const GROWTH_PITCH_LIMIT = .6;
export const GROWTH_PIVOT: Vector = [0, -.15, 0];
type Camera = { scale: number; x: number; y: number; pivot: Vector };
const cameraBounds = new Map<number, { left: number; right: number; top: number; bottom: number }>();

/** Fit the full permitted orbit once, rather than zooming and recentering every frame. */
export function growthCamera(count: number, width: number, height: number): Camera {
  let bounds = cameraBounds.get(count);
  if (!bounds) {
    bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const shape of [0, 1]) for (let branch = 0; branch < Math.max(1, count); branch++) {
      for (let step = 0; step <= 16; step++) {
        const point = branchPoint(branch, count, step / 16, shape).map((value, i) => value - GROWTH_PIVOT[i]) as Vector;
        for (let yaw = 0; yaw < 32; yaw++) for (let tilt = -2; tilt <= 2; tilt++) {
          const [x, y, z] = rotatePoint(point, tilt / 2 * GROWTH_PITCH_LIMIT, yaw / 32 * Math.PI * 2);
          const px = x * 9 / (9 - z), py = y * 9 / (9 - z);
          bounds.left = Math.min(bounds.left, px); bounds.right = Math.max(bounds.right, px);
          bounds.top = Math.min(bounds.top, py); bounds.bottom = Math.max(bounds.bottom, py);
        }
      }
    }
    cameraBounds.set(count, bounds);
  }
  const scale = Math.max(1, Math.min((width - 80) / (bounds.right - bounds.left + .24), (height - 96) / (bounds.bottom - bounds.top + .24)));
  return { scale, x: width / 2, y: height / 2 + 6 - (bounds.top + bounds.bottom) / 2 * scale, pivot: GROWTH_PIVOT };
}

/** Grab direction follows the front of the object, with the same gain per canvas span. */
export function dragGrowth(pitch: number, yaw: number, dx: number, dy: number, span: number) {
  const gain = 1.8 / Math.max(240, span);
  return { yaw: yaw + dx * gain, pitch: Math.max(-GROWTH_PITCH_LIMIT, Math.min(GROWTH_PITCH_LIMIT, pitch - dy * gain)) };
}
export function projectPoint(point: Vector, ax: number, ay: number, width: number, height: number, camera?: Camera) {
  const [x, y, z] = rotatePoint(camera ? point.map((value, i) => value - camera.pivot[i]) as Vector : point, ax, ay);
  const scale = camera?.scale ?? Math.max(1, Math.min(width - 64, height - 64)) / 6.4;
  const perspective = 9 / (9 - z);
  return { x: (camera?.x ?? width * .5) + x * scale * perspective, y: (camera?.y ?? height * .5) + y * scale * perspective, z };
}
