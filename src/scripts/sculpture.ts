import { branchPoint, dragGrowth, GROWTH_PITCH_LIMIT, growthCamera, growthPages, projectPoint, rotatePoint, visibleGrowthRecords, type GrowthGraph, type Vector } from '../project-growth';

type SurfacePoint = { compact: Vector; spread: Vector; normal: Vector; spreadNormal: Vector;
  screen?: ReturnType<typeof projectPoint>; lightNormal?: Vector };
type Face = { vertices: SurfacePoint[]; branch: number };
type Hit = { x: number; y: number; z: number; branch: number; record: number };
const TAU = Math.PI * 2;
const normalise = (v: Vector): Vector => { const n = Math.hypot(...v) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const cross = (a: Vector, b: Vector): Vector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mix = (a: Vector, b: Vector, t: number): Vector => a.map((value, i) => value + (b[i] - value) * t) as Vector;
const mounted = new WeakMap<HTMLElement, () => void>();

export function mountSculpture(root: HTMLElement) {
  mounted.get(root)?.();
  const canvas = root.querySelector<HTMLCanvasElement>('[data-sculpture-canvas]');
  const stage = root.querySelector<HTMLElement>('.sculpture-stage');
  const shapeButton = root.querySelector<HTMLButtonElement>('[data-sculpture-shape]');
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-sculpture-pause]');
  if (!canvas || !stage || !shapeButton || !pauseButton) return;
  let graph: GrowthGraph;
  try { graph = JSON.parse(root.dataset.growth || '{}'); } catch { return; }
  if (!graph.branches?.length) return;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return;
  const ctx = context;
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(pointer: fine)');
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const autoplay = root.dataset.autoplay !== 'false';
  let userPaused: boolean | undefined;
  try { const saved = sessionStorage.getItem('sculpture-paused'); if (saved !== null) userPaused = saved === 'true'; } catch { /* Storage is optional. */ }
  let paused = reduced.matches || !!connection?.saveData || (userPaused ?? !autoplay);
  let width = 1, height = 1, ratio = 1, rotationX = -.24, rotationY = 0;
  let camera = growthCamera(graph.branches.length, width, height);
  let expanded = 0, expandTarget = 0, visible = false, frame = 0, lastDraw = 0;
  let hovered = -1, engaged = false, focused = false;
  let pointer: { id: number; x: number; y: number; lastX: number; lastY: number; span: number; touch: boolean; moved: boolean } | undefined;
  let dirty = false;
  const introEnd = performance.now() + 1800;
  const frameInterval = finePointer.matches ? 1000 / 30 : 1000 / 24;
  const projectButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-growth-project]')];
  const previous = root.querySelector<HTMLButtonElement>('[data-growth-previous]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-growth-next]')!;
  const title = root.querySelector<HTMLAnchorElement>('[data-growth-title]')!;
  const titleText = root.querySelector<HTMLElement>('[data-growth-title-text]')!;
  const projectLink = root.querySelector<HTMLAnchorElement>('[data-growth-project-link]')!;
  const date = root.querySelector<HTMLTimeElement>('[data-growth-date]')!;
  const kind = root.querySelector<HTMLElement>('[data-growth-kind]')!;
  const description = root.querySelector<HTMLElement>('[data-growth-description]')!;
  const counter = root.querySelector<HTMLElement>('[data-growth-counter]')!;
  const pageLinks = root.querySelector<HTMLElement>('[data-growth-pages]')!;
  const preview = root.querySelector<HTMLAnchorElement>('[data-growth-preview]')!;
  let activeBranch = Math.max(0, graph.branches.findIndex(branch => branch.records.at(-1)?.date === graph.latest));
  let activeRecord = graph.branches[activeBranch].records.length - 1;
  let hits: Hit[] = [];

  function surface(branch: number, t: number, side: number, spread: number) {
    const centre = branchPoint(branch, graph.branches.length, t, spread);
    const ahead = branchPoint(branch, graph.branches.length, t + .001, spread);
    const tangent = normalise(ahead.map((value, i) => value - centre[i]) as Vector);
    const normal = normalise(cross(tangent, [0, 0, 1]));
    const binormal = normalise(cross(tangent, normal));
    const v = side * TAU;
    const taper = Math.pow(Math.max(0, Math.sin(t * Math.PI)), .28);
    const halfWidth = .052 * taper, thickness = .008 * taper;
    const offset = normal.map((value, i) => value * Math.cos(v) * halfWidth + binormal[i] * Math.sin(v) * thickness) as Vector;
    const n = normalise(normal.map((value, i) => value * Math.cos(v) * .008 + binormal[i] * Math.sin(v) * .052) as Vector);
    return { point: centre.map((value, i) => value + offset[i]) as Vector, normal: n };
  }
  const faces: Face[] = [];
  const vertices: SurfacePoint[] = [];
  const segments = finePointer.matches ? 112 : 72, sides = 8;
  graph.branches.forEach((_, branch) => {
    const rows = Array.from({ length: segments + 1 }, (__, i) => Array.from({ length: sides }, (___, j) => {
      const compact = surface(branch, i / segments, j / sides, 0);
      const spread = surface(branch, i / segments, j / sides, 1);
      const vertex = { compact: compact.point, spread: spread.point, normal: compact.normal, spreadNormal: spread.normal };
      vertices.push(vertex);
      return vertex;
    }));
    for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) {
      faces.push({ vertices: [rows[i][j], rows[i + 1][j], rows[i + 1][(j + 1) % sides], rows[i][(j + 1) % sides]], branch });
    }
  });

  function project(v: Vector) { return projectPoint(v, rotationX, rotationY, width, height, camera); }
  function updatePause() {
    pauseButton!.setAttribute('aria-pressed', String(paused));
    pauseButton!.textContent = paused ? '继续转动 ↻' : '暂停转动 Ⅱ';
    root.dataset.paused = String(paused);
  }
  function choose(branch: number, record: number, reading = true) {
    activeBranch = branch; activeRecord = record;
    const selected = graph.branches[branch], item = selected.records[record];
    projectButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === branch)));
    projectLink.textContent = selected.title; projectLink.href = selected.url;
    preview.textContent = `${selected.title} ↘`;
    titleText.textContent = item.title; title.href = item.url;
    date.textContent = item.date; date.dateTime = item.date; kind.textContent = item.kind;
    description.textContent = item.description;
    counter.textContent = `第${record + 1}/${selected.records.length}页`;
    previous.disabled = record === 0; next.disabled = record === selected.records.length - 1;
    const restoreFocus = pageLinks.contains(document.activeElement);
    pageLinks.replaceChildren(...growthPages(record, selected.records.length).map(page => {
      if (page === 'gap') { const gap = document.createElement('span'); gap.textContent = '…'; gap.setAttribute('aria-hidden', 'true'); return gap; }
      const button = document.createElement('button'); button.type = 'button'; button.textContent = String(page + 1);
      button.dataset.growthPage = String(page); button.setAttribute('aria-label', `第 ${page + 1} 页：${selected.records[page].title}`);
      if (page === record) button.setAttribute('aria-current', 'page');
      return button;
    }));
    if (restoreFocus) pageLinks.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus({ preventScroll: true });
    if (reading) { paused = true; stop(); updatePause(); }
    render(); start();
  }
  function render() {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const origin = project([0, 0, 0]);
    const glow = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, width * .42);
    glow.addColorStop(0, '#c6d0dd09'); glow.addColorStop(1, '#c6d0dd00');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    vertices.forEach(vertex => {
      vertex.screen = project(mix(vertex.compact, vertex.spread, expanded));
      vertex.lightNormal = rotatePoint(mix(vertex.normal, vertex.spreadNormal, expanded), rotationX, rotationY);
    });
    const projected = faces.map(face => {
      const points = face.vertices.map(vertex => vertex.screen!);
      const normal = normalise(face.vertices.reduce<Vector>((sum, vertex) => sum.map((value, i) => value + vertex.lightNormal![i]) as Vector, [0, 0, 0]));
      return { ...face, points, normal, z: points.reduce((sum, p) => sum + p.z, 0) / points.length };
    }).sort((a, b) => a.z - b.z);
    ctx.lineJoin = 'round';
    for (const face of projected) {
      const [nx, ny, nz] = face.normal;
      const light = Math.max(0, nx * -.22 + ny * -.45 + nz * .86);
      const specular = Math.pow(Math.max(0, nz * .86 - ny * .24 - nx * .12), 32);
      const selected = face.branch === activeBranch;
      const r = (selected ? 69 : 41) + light * (selected ? 141 : 137) + specular * 104;
      const g = (selected ? 62 : 48) + light * (selected ? 129 : 145) + specular * 106;
      const b = (selected ? 47 : 59) + light * (selected ? 100 : 154) + specular * 108;
      ctx.beginPath(); face.points.forEach((p, i) => { if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.closePath();
      ctx.fillStyle = `rgb(${Math.min(255, r)|0},${Math.min(255, g)|0},${Math.min(255, b)|0})`; ctx.fill();
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = .3; ctx.stroke();
    }
    hits = graph.branches.flatMap((branch, branchIndex) => visibleGrowthRecords(branch).map(({ index, progress }) => ({
      ...project(branchPoint(branchIndex, graph.branches.length, progress, expanded)), branch: branchIndex, record: index,
    })));
    const pulse = !paused && !reduced.matches && performance.now() < introEnd ? .5 + .5 * Math.sin(performance.now() / 180) : 0;
    [...hits].sort((a, b) => a.z - b.z).forEach(hit => {
      const item = graph.branches[hit.branch].records[hit.record];
      const selected = hit.branch === activeBranch && hit.record === activeRecord;
      const latest = item.date === graph.latest;
      const radius = item.kind === '里程碑' ? 3.8 : 2.5;
      if (selected || hits.indexOf(hit) === hovered || (latest && pulse)) {
        ctx.beginPath(); ctx.arc(hit.x, hit.y, radius + 5 + (latest ? pulse * 2 : 0), 0, TAU);
        ctx.strokeStyle = selected ? '#e8d6a4aa' : '#e8d6a455'; ctx.lineWidth = .8; ctx.stroke();
      }
      ctx.shadowColor = latest ? '#e3cfa2' : '#dce5ef'; ctx.shadowBlur = latest ? 12 : 0;
      ctx.beginPath(); ctx.arc(hit.x, hit.y, radius, 0, TAU); ctx.fillStyle = latest ? '#f1dfb5' : '#d4dce5'; ctx.fill(); ctx.shadowBlur = 0;
    });
    // Numbered tips correspond to the stationary project buttons beneath the canvas.
    const labels: { x: number; y: number }[] = [];
    graph.branches.forEach((_, index) => {
      const tip = project(branchPoint(index, graph.branches.length, 1, expanded));
      const candidates = [[0, -28], [0, 28], [-28, 0], [28, 0], [-28, -28], [28, -28], [0, -56], [0, 56]]
        .map(([x, y]) => ({ x: Math.max(15, Math.min(width - 15, tip.x + x)), y: Math.max(15, Math.min(height - 15, tip.y + y)) }));
      const label = candidates.find(p => labels.every(other => Math.hypot(other.x - p.x, other.y - p.y) > 29)) ?? candidates[0];
      labels.push(label);
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(label.x, label.y); ctx.strokeStyle = '#7389b55c'; ctx.lineWidth = .7; ctx.stroke();
      ctx.font = '13px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = index === activeBranch ? '#e8d6aa' : '#b4bdc9'; ctx.fillText(String(index + 1).padStart(2, '0'), label.x, label.y);
    });
    root.classList.add('is-rendered');
    dirty = false;
  }
  function stop() { cancelAnimationFrame(frame); frame = 0; lastDraw = 0; }
  function moving() { return dirty || (!paused && !engaged && !focused && !pointer) || Math.abs(expandTarget - expanded) > .0005; }
  function tick(time: number) {
    frame = 0;
    if (!visible || document.hidden) return;
    if (dirty || time - lastDraw >= frameInterval) {
      const elapsed = lastDraw ? Math.min((time - lastDraw) / 1000, .08) : .033;
      if (!paused && !engaged && !focused && !pointer) rotationY += elapsed * .11;
      expanded += (expandTarget - expanded) * (reduced.matches ? 1 : 1 - Math.exp(-elapsed * 14));
      if (Math.abs(expandTarget - expanded) < .0005) expanded = expandTarget;
      render(); lastDraw = time;
    }
    if (moving()) frame = requestAnimationFrame(tick);
  }
  function start() { if (!signal.aborted && !frame && visible && !document.hidden && moving()) frame = requestAnimationFrame(tick); }
  function resize() {
    const bounds = stage!.getBoundingClientRect();
    width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
    camera = growthCamera(graph.branches.length, width, height);
    ratio = Math.min(devicePixelRatio || 1, finePointer.matches ? 1.5 : 1.25, Math.sqrt(1_500_000 / (width * height)));
    canvas!.width = Math.round(width * ratio); canvas!.height = Math.round(height * ratio);
    render(); start();
  }
  function pick(x: number, y: number, touch = false) {
    const bounds = canvas!.getBoundingClientRect();
    const px = x - bounds.left, py = y - bounds.top;
    return hits.map((hit, index) => ({ index, distance: Math.hypot(px - hit.x, py - hit.y), z: hit.z }))
      .filter(hit => hit.distance < (touch ? 26 : 20)).sort((a, b) => a.distance - b.distance || b.z - a.z)[0]?.index ?? -1;
  }
  shapeButton.addEventListener('click', () => {
    expandTarget = expandTarget ? 0 : 1;
    shapeButton.setAttribute('aria-pressed', String(!!expandTarget));
    shapeButton.textContent = expandTarget ? '收拢轨道 ↙' : '展开轨道 ↗';
    root.dataset.shape = expandTarget ? 'spread' : 'growth';
    if (expandTarget) { rotationX = -.24; rotationY = 0; }
    if (reduced.matches) { expanded = expandTarget; render(); }
    start();
  }, { signal });
  pauseButton.addEventListener('click', () => {
    paused = !paused; userPaused = paused;
    try { sessionStorage.setItem('sculpture-paused', String(paused)); } catch { /* Storage is optional. */ }
    updatePause(); if (paused) { stop(); render(); } else start();
  }, { signal });
  projectButtons.forEach((button, branch) => button.addEventListener('click', () => choose(branch, graph.branches[branch].records.length - 1), { signal }));
  previous.addEventListener('click', () => { if (activeRecord > 0) choose(activeBranch, activeRecord - 1); }, { signal });
  next.addEventListener('click', () => { if (activeRecord < graph.branches[activeBranch].records.length - 1) choose(activeBranch, activeRecord + 1); }, { signal });
  pageLinks.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-growth-page]');
    if (button) choose(activeBranch, Number(button.dataset.growthPage));
  }, { signal });
  root.querySelectorAll<HTMLAnchorElement>('[data-growth-record]').forEach(link => {
    link.addEventListener('focus', () => {
      graph.branches.forEach((branch, i) => {
        const record = branch.records.findIndex(item => item.id === link.dataset.growthRecord);
        if (record >= 0) choose(i, record, false);
      });
    }, { signal });
  });
  root.addEventListener('focusin', (event) => {
    focused = event.target === canvas || !!(event.target as HTMLElement).closest('.growth-detail a, .growth-records-index');
    if (focused) stop(); else start();
  }, { signal });
  root.addEventListener('focusout', () => queueMicrotask(() => {
    const active = document.activeElement;
    focused = active === canvas || !!(active instanceof HTMLElement && active.closest('.growth-detail a, .growth-records-index'));
    start();
  }), { signal });
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Home');
  canvas.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    switch (event.key) {
      case 'ArrowLeft': rotationY -= .12; break;
      case 'ArrowRight': rotationY += .12; break;
      case 'ArrowUp': rotationX = Math.min(GROWTH_PITCH_LIMIT, rotationX + .12); break;
      case 'ArrowDown': rotationX = Math.max(-GROWTH_PITCH_LIMIT, rotationX - .12); break;
      case 'Home': rotationX = -.24; rotationY = 0; break;
      default: return;
    }
    event.preventDefault(); paused = true; stop(); updatePause(); render();
  }, { signal });
  canvas.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { engaged = true; stop(); } }, { signal });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary || pointer) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, span: Math.min(width, height), touch: event.pointerType === 'touch', moved: false };
    if (!pointer.touch) canvas.setPointerCapture(event.pointerId);
    stop();
  }, { signal });
  canvas.addEventListener('pointermove', event => {
    if (pointer && event.pointerId !== pointer.id) return;
    if (pointer && event.pointerId === pointer.id) {
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (!pointer.moved && Math.hypot(dx, dy) > 6 && (!pointer.touch || Math.abs(dx) > Math.abs(dy))) {
        pointer.moved = true; canvas.setPointerCapture(event.pointerId); canvas.classList.add('is-dragging');
        hovered = -1; canvas.title = ''; canvas.style.cursor = 'grabbing'; paused = true; updatePause();
      }
      if (pointer.moved) {
        const rotation = dragGrowth(rotationX, rotationY, event.clientX - pointer.lastX, event.clientY - pointer.lastY, pointer.span);
        rotationX = rotation.pitch; rotationY = rotation.yaw;
        pointer.lastX = event.clientX; pointer.lastY = event.clientY;
        dirty = true; start();
      }
    } else if (finePointer.matches) {
      const hit = pick(event.clientX, event.clientY);
      if (hit !== hovered) { hovered = hit; render(); }
      canvas.style.cursor = hit >= 0 ? 'pointer' : 'grab';
      const target = hits[hit];
      canvas.title = target ? `${graph.branches[target.branch].title} · ${graph.branches[target.branch].records[target.record].title}` : '拖动或用方向键旋转，轻点节点查看记录';
    }
  }, { signal });
  function release(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (event.type === 'pointerup' && !pointer.moved) {
      const hit = hits[pick(event.clientX, event.clientY, pointer.touch)];
      if (hit) choose(hit.branch, hit.record);
    }
    if (pointer.moved) render();
    pointer = undefined; canvas!.classList.remove('is-dragging');
    canvas!.style.cursor = 'grab';
    if (canvas!.hasPointerCapture(event.pointerId)) canvas!.releasePointerCapture(event.pointerId);
    start();
  }
  canvas.addEventListener('pointerup', release, { signal });
  canvas.addEventListener('pointercancel', release, { signal });
  canvas.addEventListener('lostpointercapture', release, { signal });
  canvas.addEventListener('pointerleave', () => { engaged = false; hovered = -1; render(); start(); }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); }, { signal });
  reduced.addEventListener('change', () => {
    paused = reduced.matches || !!connection?.saveData || (userPaused ?? !autoplay);
    expanded = expandTarget; updatePause(); stop(); render(); start();
  }, { signal });
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting; if (visible) start(); else stop();
  }) : undefined;
  if (observer) observer.observe(stage); else visible = true;
  const sizing = 'ResizeObserver' in window ? new ResizeObserver(resize) : undefined;
  sizing?.observe(stage);
  if (!sizing) window.addEventListener('resize', resize, { signal, passive: true });
  root.querySelectorAll<HTMLElement>('.sculpture-controls, .growth-projects, .growth-record-nav, [data-runtime-hint]').forEach(element => { element.hidden = false; });
  const dispose = () => {
    stop(); lifetime.abort(); observer?.disconnect(); sizing?.disconnect();
    canvas.removeAttribute('tabindex'); canvas.removeAttribute('aria-keyshortcuts'); mounted.delete(root);
  };
  mounted.set(root, dispose);
  choose(activeBranch, activeRecord, false); updatePause(); resize();
  return dispose;
}
