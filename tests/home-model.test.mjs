import test from 'node:test';
import assert from 'node:assert/strict';
import { selectHomeProjects } from '../src/home-model.ts';

const entry = (id, order, extra = {}) => ({ id, data: { order, ...extra } });

test('an empty project collection has no unsafe featured entry', () => {
  assert.deepEqual(selectHomeProjects([]), { featured: undefined, projects: [], total: 0 });
});
test('one project is featured once without a featured flag', () => {
  const project = entry('new-project', 1);
  assert.deepEqual(selectHomeProjects([project]), { featured: project, projects: [], total: 1 });
});
test('a new project joins the home page by content order alone', () => {
  const data = [entry('existing', 5), entry('new-project', 2), entry('lead', 1, { featured: true })];
  const result = selectHomeProjects(data);
  assert.equal(result.featured.id, 'lead');
  assert.deepEqual(result.projects.map(({ id }) => id), ['new-project', 'existing']);
  assert.equal(data[0].id, 'existing', 'selection must not mutate collection order');
});
test('drafts cannot become a featured project or affect public counts', () => {
  const result = selectHomeProjects([entry('secret', 0, { draft: true, featured: true }), entry('public', 1)]);
  assert.equal(result.featured.id, 'public');
  assert.equal(result.total, 1);
});
test('multiple featured flags use stable order and a capped home retains the full count', () => {
  const data = Array.from({ length: 9 }, (_, i) => entry(`project-${i}`, i, { featured: i < 2 }));
  const result = selectHomeProjects(data, 4);
  assert.equal(result.featured.id, 'project-0');
  assert.equal(result.projects.length, 3);
  assert.equal(result.total, 9);
  assert.equal(new Set([result.featured, ...result.projects]).size, 4);
});
test('equal order values have a deterministic result regardless of filesystem order', () => {
  const data = [entry('z', 1), entry('a', 1)];
  assert.equal(selectHomeProjects(data).featured.id, selectHomeProjects([...data].reverse()).featured.id);
});
