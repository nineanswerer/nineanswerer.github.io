export function mountHomeMotion(root: HTMLElement) {
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = matchMedia('(hover: hover) and (pointer: fine)');
  const band = root.querySelector<HTMLElement>('[data-kinetic-band]');
  let frame = 0;
  const reveal = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) { target.classList.add('is-visible'); reveal?.unobserve(target); }
    });
  }, { threshold: .08 }) : undefined;

  function scroll() {
    frame = 0;
    const fullHeight = document.documentElement.scrollHeight - innerHeight;
    document.documentElement.style.setProperty('--reading-progress', String(fullHeight > 0 ? scrollY / fullHeight : 0));
    band?.style.setProperty('--band-shift', `${reduced.matches ? 0 : Math.max(-320, Math.min(100, (band.getBoundingClientRect().top - innerHeight) * .2))}px`);
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(scroll); }
  function preferences() {
    root.classList.toggle('motion-ready', !reduced.matches && !!reveal);
    scroll();
  }
  root.querySelectorAll('[data-reveal]').forEach((element) => reveal?.observe(element));
  root.querySelectorAll<HTMLElement>('[data-hover-art]').forEach((art) => {
    function reset() {
      ['--art-x', '--art-y', '--art-rotate-x', '--art-rotate-y'].forEach((key) => art.style.removeProperty(key));
    }
    art.addEventListener('pointermove', (event) => {
      if (reduced.matches || !pointer.matches) return;
      const bounds = art.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - .5;
      const y = (event.clientY - bounds.top) / bounds.height - .5;
      art.style.setProperty('--art-x', `${x * 14}px`);
      art.style.setProperty('--art-y', `${y * 14}px`);
      art.style.setProperty('--art-rotate-x', `${y * -8}deg`);
      art.style.setProperty('--art-rotate-y', `${x * 8}deg`);
    }, { signal });
    art.addEventListener('pointerleave', reset, { signal });
    reduced.addEventListener('change', reset, { signal });
    pointer.addEventListener('change', reset, { signal });
  });
  window.addEventListener('scroll', schedule, { passive: true, signal });
  window.addEventListener('resize', schedule, { passive: true, signal });
  reduced.addEventListener('change', preferences, { signal });
  preferences();
  return () => { lifetime.abort(); reveal?.disconnect(); cancelAnimationFrame(frame); root.classList.remove('motion-ready'); };
}
