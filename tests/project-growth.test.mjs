import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectGrowth, branchPoint, dragGrowth, GROWTH_PITCH_LIMIT, GROWTH_PIVOT, growthCamera, growthPages, projectPoint, recordProgress, visibleGrowthRecords } from '../src/project-growth.ts';

const date = value => new Date(`${value}T00:00:00Z`);
const project = (id, extra = {}) => ({ id, data: { title: id, description: '已有项目说明', status: '开发中', date: date('2026-10-01'), order: 1, updates: [], ...extra } });
const article = (id, extra = {}) => ({ id, project: 'public', title: id, description: '真实文章', date: date('2026-10-02'), url: `/writing/${id}/`, ...extra });

test('only published projects and their published articles reach the sculpture', () => {
  const graph = buildProjectGrowth([project('secret', { draft: true }), project('public')], [article('visible'), article('draft', { draft: true }), article('orphan', { project: 'unknown' }), article('secret', { project: 'secret' })]);
  assert.deepEqual(graph.branches.map(branch => branch.id), ['public']);
  assert.deepEqual(graph.branches[0].records.map(record => record.title), ['visible']);
  assert.equal(graph.totalProjects, 1);
  assert.deepEqual(buildProjectGrowth([], []), { branches: [], latest: '', totalProjects: 0 });
});

test('project dates remain project records; article revisions never become fake releases', () => {
  const graph = buildProjectGrowth([project('plain'), project('public')], [article('revision', { updated: date('2026-11-13') })]);
  assert.equal(graph.branches[0].records[0].kind, '项目记录');
  assert.equal(graph.branches[0].records[0].date, '2026-10-01');
  assert.equal(graph.branches[1].records[0].kind, '文章修订');
  assert.equal(graph.branches[1].records[0].date, '2026-11-13');
  assert.equal(graph.latest, '2026-11-13');
  const revised = buildProjectGrowth([project('revised', { updated: date('2026-11-12') })], []).branches[0].records[0];
  assert.equal(revised.title, '项目资料更新');
  assert.equal(revised.kind, '项目记录');
  assert.equal(revised.date, '2026-11-12');
});

test('same-day writing and milestones remain separate and input ordering is immaterial', () => {
  const milestones = [{ date: date('2026-10-02'), title: '开发预览', description: '尚未发布' }];
  const projects = [project('z'), project('public', { updates: milestones })];
  const writing = [article('b'), article('a')];
  const graph = buildProjectGrowth(projects, writing);
  assert.equal(graph.branches[0].records.length, 3);
  assert.equal(graph.branches[0].records.at(-1).kind, '里程碑');
  assert.deepEqual(graph, buildProjectGrowth([...projects].reverse(), [...writing].reverse()));
});

test('all history remains pageable while the sculpture has at most six recent nodes per project', () => {
  const writing = Array.from({ length: 9 }, (_, i) => article(`record-${i}`, { date: date(`2026-10-${String(i + 1).padStart(2, '0')}`) }));
  const graph = buildProjectGrowth([project('public'), project('z')], writing, 1);
  assert.equal(graph.totalProjects, 2);
  assert.equal(graph.branches.length, 1);
  assert.equal(graph.branches[0].total, 9);
  assert.equal(graph.branches[0].records.length, 9);
  const visible = visibleGrowthRecords(graph.branches[0]);
  assert.deepEqual(visible.map(({ record }) => record.title), ['record-3', 'record-4', 'record-5', 'record-6', 'record-7', 'record-8']);
  assert.deepEqual(visible.map(({ index }) => index), [3, 4, 5, 6, 7, 8]);
});

test('pagination always offers the selected page and endpoints without crowding small screens', () => {
  assert.deepEqual(growthPages(0, 1), [0]);
  assert.deepEqual(growthPages(3, 8), [0, 'gap', 2, 3, 4, 'gap', 7]);
  assert.deepEqual(growthPages(7, 8), [0, 'gap', 6, 7]);
  for (let selected = 0; selected < 40; selected++) {
    const pages = growthPages(selected, 40);
    assert.ok(pages.includes(0) && pages.includes(39) && pages.includes(selected));
    assert.ok(pages.filter(page => page !== 'gap').length <= 5);
  }
});

test('nodes stay inside the drawing surface through rotation, expansion and mobile sizing', () => {
  for (const [width, height] of [[288, 285], [358, 320], [620, 390], [760, 500]]) {
    for (const count of [1, 4, 6]) for (const expanded of [0, .5, 1]) {
      for (let branch = 0; branch < count; branch++) for (let record = 0; record < 6; record++) {
        const point = branchPoint(branch, count, recordProgress(record, 6), expanded);
        for (const ax of [-GROWTH_PITCH_LIMIT, -.24, GROWTH_PITCH_LIMIT]) for (const ay of [-Math.PI, .46, 1.5, Math.PI]) {
          const camera = growthCamera(count, width, height);
          const projected = projectPoint(point, ax, ay, width, height, camera);
          assert.ok(Number.isFinite(projected.x) && Number.isFinite(projected.y));
          assert.ok(projected.x > 16 && projected.x < width - 16, `horizontal clipping at ${width}px`);
          assert.ok(projected.y > 16 && projected.y < height - 16, `vertical clipping at ${height}px`);
        }
      }
    }
  }
});

test('orbit keeps its pivot and zoom fixed across rotation and expansion', () => {
  const camera = growthCamera(4, 630, 432);
  const pivot = projectPoint(GROWTH_PIVOT, -.24, 0, 630, 432, camera);
  for (const pitch of [-.6, -.24, 0, .6]) for (const yaw of [0, .5, 1.5, Math.PI]) {
    const projected = projectPoint(GROWTH_PIVOT, pitch, yaw, 630, 432, camera);
    assert.equal(projected.x, pivot.x);
    assert.equal(projected.y, pivot.y);
    assert.deepEqual(growthCamera(4, 630, 432), camera);
  }
});

test('grab direction, reverse movement and normalized sensitivity stay predictable', () => {
  const first = dragGrowth(-.24, 0, 50, 25, 400);
  assert.ok(first.yaw > 0 && first.pitch < -.24);
  const front = projectPoint([0, -.15, 1], first.pitch, first.yaw, 630, 432, growthCamera(4, 630, 432));
  const before = projectPoint([0, -.15, 1], -.24, 0, 630, 432, growthCamera(4, 630, 432));
  assert.ok(front.x > before.x && front.y > before.y, 'The front of the model follows a right/down grab');
  const reversed = dragGrowth(first.pitch, first.yaw, -50, -25, 400);
  assert.ok(Math.abs(reversed.pitch + .24) < 1e-12 && Math.abs(reversed.yaw) < 1e-12);
  assert.deepEqual(dragGrowth(0, 0, 40, 20, 400), dragGrowth(0, 0, 80, 40, 800));
  const limited = dragGrowth(0, 0, 0, 1000, 400);
  assert.equal(limited.pitch, -GROWTH_PITCH_LIMIT);
  assert.ok(dragGrowth(limited.pitch, 0, 0, -1, 400).pitch > limited.pitch, 'Reversing at a tilt limit responds immediately');
});
