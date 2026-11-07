type Vector = [number, number, number];
type Vertex = { knot: Vector; ring: Vector; normal: Vector; ringNormal: Vector };
type Projected = { x: number; y: number; z: number; nx: number; ny: number; nz: number };
const TAU = Math.PI * 2;
const normalise = ([x, y, z]: Vector): Vector => {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};
const cross = (a: Vector, b: Vector): Vector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const centre = (t: number): Vector => {
  const r = 2 + .62 * Math.cos(3 * t);
  return [r * Math.cos(2 * t), r * Math.sin(2 * t), .94 * Math.sin(3 * t)];
};

const mounted = new WeakMap<HTMLElement, () => void>();

export function mountSculpture(root: HTMLElement) {
  mounted.get(root)?.();
  const canvas = root.querySelector<HTMLCanvasElement>('[data-sculpture-canvas]');
  const stage = root.querySelector<HTMLElement>('.sculpture-stage');
  const shapeButton = root.querySelector<HTMLButtonElement>('[data-sculpture-shape]');
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-sculpture-pause]');
  if (!canvas || !stage || !shapeButton || !pauseButton) return;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    shapeButton.disabled = true;
    pauseButton.disabled = true;
    return;
  }
  const ctx = context;
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const controls = root.querySelector<HTMLElement>('.sculpture-controls');
  if (controls) controls.hidden = false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(pointer: fine)');
  const segments = finePointer.matches ? 144 : 72;
  const sides = finePointer.matches ? 12 : 10;
  const frameInterval = finePointer.matches ? 1000 / 30 : 1000 / 24;
  const vertices: Vertex[] = [];
  const faces: [number, number, number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const t = i / segments * TAU;
    const c = centre(t);
    const ahead = centre(t + .001);
    const tangent = normalise([ahead[0] - c[0], ahead[1] - c[1], ahead[2] - c[2]]);
    const normal = normalise(cross(tangent, [0, 0, 1]));
    const binormal = normalise(cross(tangent, normal));
    for (let j = 0; j < sides; j++) {
      const v = j / sides * TAU;
      const n: Vector = [normal[0] * Math.cos(v) + binormal[0] * Math.sin(v), normal[1] * Math.cos(v) + binormal[1] * Math.sin(v), normal[2] * Math.cos(v) + binormal[2] * Math.sin(v)];
      const ringN: Vector = [Math.cos(t) * Math.cos(v), Math.sin(t) * Math.cos(v), Math.sin(v)];
      vertices.push({ knot: [c[0] + n[0] * .3, c[1] + n[1] * .3, c[2] + n[2] * .3], ring: [(2.1 + .43 * Math.cos(v)) * Math.cos(t), (2.1 + .43 * Math.cos(v)) * Math.sin(t), .43 * Math.sin(v)], normal: n, ringNormal: ringN });
      const next = (i + 1) % segments;
      faces.push([i * sides + j, next * sides + j, next * sides + (j + 1) % sides, i * sides + (j + 1) % sides]);
    }
  }
  const projected: Projected[] = vertices.map(() => ({ x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1 }));
  const ordered = faces.map((indices) => ({ indices, z: 0 }));
  let width = 1, height = 1, ratio = 1;
  let rotationX = -.45, rotationY = .38, targetX = 0, targetY = 0;
  let hoverX = 0, hoverY = 0;
  let morph = 0, morphTarget = 0;
  let dragging = false, pointerX = 0, pointerY = 0;
  let userPaused: boolean | undefined;
  try { const saved = sessionStorage.getItem('sculpture-paused'); if (saved !== null) userPaused = saved === 'true'; } catch { /* Storage is optional. */ }
  const autoplay = root.dataset.autoplay !== 'false';
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  let paused = reduced.matches || !!connection?.saveData || (userPaused ?? !autoplay);
  let visible = false, frame = 0, lastDraw = 0;
  let previousTime = 0;

  function rotate(x: number, y: number, z: number, ax: number, ay: number): Vector {
    const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
    const px = x * cy + z * sy, pz = -x * sy + z * cy;
    return [px, y * cx - pz * sx, y * sx + pz * cx];
  }
  function render() {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const scale = Math.min(width, height) * .155;
    const ax = rotationX + hoverY, ay = rotationY + hoverX;
    for (let i = 0; i < vertices.length; i++) {
      const point = vertices[i];
      const x = point.knot[0] + (point.ring[0] - point.knot[0]) * morph;
      const y = point.knot[1] + (point.ring[1] - point.knot[1]) * morph;
      const z = point.knot[2] + (point.ring[2] - point.knot[2]) * morph;
      const position = rotate(x, y, z, ax, ay);
      const normal = rotate(point.normal[0] + (point.ringNormal[0] - point.normal[0]) * morph, point.normal[1] + (point.ringNormal[1] - point.normal[1]) * morph, point.normal[2] + (point.ringNormal[2] - point.normal[2]) * morph, ax, ay);
      const perspective = 8 / (8 - position[2]);
      const output = projected[i];
      output.x = width * .5 + position[0] * scale * perspective;
      output.y = height * .49 + position[1] * scale * perspective;
      output.z = position[2];
      output.nx = normal[0]; output.ny = normal[1]; output.nz = normal[2];
    }
    for (const face of ordered) face.z = face.indices.reduce((total, index) => total + projected[index].z, 0) / 4;
    ordered.sort((a, b) => a.z - b.z);
    ctx.lineJoin = 'round';
    for (const face of ordered) {
      const [a, b, c, d] = face.indices.map(index => projected[index]);
      const light = Math.max(0, (a.nx * -.35 + a.ny * -.6 + a.nz * .72));
      const specular = Math.pow(Math.max(0, a.nz * .92 - a.ny * .3), 22);
      const r = Math.min(255, 13 + light * 38 + specular * 158);
      const g = Math.min(255, 26 + light * 65 + specular * 168);
      const blue = Math.min(255, 104 + light * 141 + specular * 75);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.fillStyle = morph > .75 ? `rgba(19,34,77,${.45 + light * .3})` : `rgb(${r|0},${g|0},${blue|0})`;
      ctx.fill();
      ctx.strokeStyle = morph > .5 ? `rgba(151,177,255,${.12 + light * .55})` : `rgba(101,135,255,${.08 + light * .18})`;
      ctx.lineWidth = morph > .5 ? .65 : .4;
      ctx.stroke();
    }
    ctx.fillStyle = '#dafa88';
    for (let i = 0; i < projected.length; i += sides * 12) {
      const p = projected[i];
      if (p.nz < .1) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.4 + morph * .6, 0, TAU); ctx.fill();
    }
    root.classList.add('is-rendered');
  }
  function stop() {
    cancelAnimationFrame(frame); frame = 0; previousTime = 0;
  }
  function tick(time: number) {
    frame = 0;
    if (!visible || document.hidden) return;
    const elapsed = previousTime ? Math.min((time - previousTime) / 1000, .06) : .033;
    if (time - lastDraw >= frameInterval) {
      if (!paused && !dragging) { rotationY += elapsed * .21; rotationX += elapsed * .025; }
      hoverX += (targetX - hoverX) * .08;
      hoverY += (targetY - hoverY) * .08;
      morph += (morphTarget - morph) * (reduced.matches ? 1 : .09);
      if (Math.abs(morphTarget - morph) < .0005) morph = morphTarget;
      render(); lastDraw = time; previousTime = time;
    }
    if (!paused || dragging || Math.abs(morphTarget - morph) > .0005 || Math.abs(targetX - hoverX) + Math.abs(targetY - hoverY) > .002) frame = requestAnimationFrame(tick);
  }
  function start() { if (!frame && visible && !document.hidden) frame = requestAnimationFrame(tick); }
  function resize() {
    const bounds = stage!.getBoundingClientRect();
    width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
    // The canvas extends past the viewport, so cap the backing buffer on wide displays.
    const pixelBudget = 2_000_000;
    ratio = Math.min(window.devicePixelRatio || 1, finePointer.matches ? 1.5 : 1.25, Math.sqrt(pixelBudget / (width * height)));
    canvas!.width = Math.round(width * ratio); canvas!.height = Math.round(height * ratio);
    render(); start();
  }
  function updatePause() {
    pauseButton!.setAttribute('aria-pressed', String(paused));
    pauseButton!.innerHTML = paused ? '继续转动 <span aria-hidden="true">↻</span>' : '暂停转动 <span aria-hidden="true">Ⅱ</span>';
    root.dataset.paused = String(paused);
  }
  shapeButton.addEventListener('click', () => {
    morphTarget = morphTarget ? 0 : 1;
    root.dataset.shape = morphTarget ? 'ring' : 'knot';
    shapeButton.setAttribute('aria-pressed', String(!!morphTarget));
    shapeButton.innerHTML = morphTarget ? '收拢雕塑 <span aria-hidden="true">↙</span>' : '展开结构 <span aria-hidden="true">↗</span>';
    if (reduced.matches) { morph = morphTarget; render(); }
    start();
  }, { signal });
  pauseButton.addEventListener('click', () => { paused = !paused; userPaused = paused; try { sessionStorage.setItem('sculpture-paused', String(paused)); } catch { /* Storage is optional. */ } updatePause(); if (paused) { stop(); render(); } else start(); }, { signal });
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown');
  canvas.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const step = .18;
    switch (event.key) {
      case 'ArrowLeft': rotationY -= step; break;
      case 'ArrowRight': rotationY += step; break;
      case 'ArrowUp': rotationX -= step; break;
      case 'ArrowDown': rotationX += step; break;
      default: return;
    }
    event.preventDefault();
    render();
  }, { signal });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true; pointerX = event.clientX; pointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId); canvas.classList.add('is-dragging');
  }, { signal });
  canvas.addEventListener('pointermove', (event) => {
    if (dragging) {
      rotationY += (event.clientX - pointerX) * .007; rotationX += (event.clientY - pointerY) * .007;
      pointerX = event.clientX; pointerY = event.clientY;
      render(); start();
    } else if (finePointer.matches && !reduced.matches) {
      const bounds = canvas.getBoundingClientRect();
      targetX = ((event.clientX - bounds.left) / bounds.width - .5) * .35;
      targetY = ((event.clientY - bounds.top) / bounds.height - .5) * -.25;
      start();
    }
  }, { signal });
  function release() { dragging = false; canvas!.classList.remove('is-dragging'); start(); }
  canvas.addEventListener('pointerup', release, { signal }); canvas.addEventListener('pointercancel', release, { signal });
  canvas.addEventListener('lostpointercapture', release, { signal });
  canvas.addEventListener('pointerleave', () => { targetX = 0; targetY = 0; start(); }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); }, { signal });
  reduced.addEventListener('change', () => { paused = reduced.matches || (userPaused ?? !autoplay) || !!connection?.saveData; morph = morphTarget; targetX = targetY = 0; hoverX = hoverY = 0; updatePause(); stop(); render(); start(); }, { signal });
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) start(); else stop(); }, { rootMargin: '60px' }) : undefined;
  if (observer) observer.observe(root); else visible = true;
  const sizing = 'ResizeObserver' in window ? new ResizeObserver(resize) : undefined;
  sizing?.observe(stage);
  if (!sizing) window.addEventListener('resize', resize, { signal, passive: true });
  const dispose = () => {
    stop(); lifetime.abort(); observer?.disconnect(); sizing?.disconnect();
    canvas.removeAttribute('tabindex');
    canvas.removeAttribute('aria-keyshortcuts');
    mounted.delete(root);
  };
  mounted.set(root, dispose);
  updatePause(); resize();
  return dispose;
}
