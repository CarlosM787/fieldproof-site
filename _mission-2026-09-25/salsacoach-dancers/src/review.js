// Review sections only: the filmed-route stand-in player and the banner loop.
(function () {
  const $ = (id) => document.getElementById(id);
  const v = $('sv');
  if (!v) return;
  const BPM = 150, clips = { leader: 'media/standin-leader.mp4', side: 'media/standin-side.mp4' };
  let angle = 'leader';
  const note = $('svNote'), cnt = $('svCount');
  const notes = {
    0.75: 'Played at 0.75× the 150 BPM take is 113 BPM. Still natural; the pitch holds.',
    1: '150 BPM take. Speeds between 0.75× and 1.25× keep the music’s pitch and still look natural.',
    1.25: 'Played at 1.25× the take is 188 BPM. Near the limit: faster than this, film a faster take.',
    0.5: 'At 0.5× (75 BPM) the band drags and the motion looks like slow motion, not a slow dance. A real slow take is needed.',
  };
  function setSrc(keepTime) {
    const t = v.currentTime || 0, playing = !v.paused;
    v.src = clips[angle];
    v.poster = 'media/standin-' + angle + '.jpg';
    v.load();
    if (keepTime) v.addEventListener('loadedmetadata', function once() { v.removeEventListener('loadedmetadata', once); v.currentTime = t; if (playing) v.play().catch(() => {}); });
  }
  function showCount(mediaTime) { cnt.textContent = Math.floor(mediaTime * BPM / 60 + 1e-6) % 8 + 1; }
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    const tick = (now, meta) => { showCount(meta.mediaTime); v.requestVideoFrameCallback(tick); };
    v.requestVideoFrameCallback(tick);
  } else v.addEventListener('timeupdate', () => showCount(v.currentTime));
  $('svPlay').addEventListener('click', () => {
    if (!v.src) setSrc(false);
    if (v.paused) { v.play().catch(() => {}); } else v.pause();
  });
  v.addEventListener('play', () => { $('svPlay').setAttribute('aria-pressed', 'true'); $('svPlay').textContent = 'Pause stand-in'; });
  v.addEventListener('pause', () => { $('svPlay').setAttribute('aria-pressed', 'false'); $('svPlay').textContent = 'Play stand-in'; });
  for (const b of document.querySelectorAll('[data-rate]')) b.addEventListener('click', () => {
    const r = +b.dataset.rate;
    v.preservesPitch = true; v.playbackRate = r;
    for (const x of document.querySelectorAll('[data-rate]')) x.setAttribute('aria-pressed', String(x === b));
    note.textContent = notes[r];
    note.classList.toggle('warn', r < 0.75 || r > 1.25);
  });
  for (const b of document.querySelectorAll('[data-angle]')) b.addEventListener('click', () => {
    angle = b.dataset.angle;
    for (const x of document.querySelectorAll('[data-angle]')) x.setAttribute('aria-pressed', String(x === b));
    setSrc(true);
  });
  $('svMirror').addEventListener('change', (e) => v.classList.toggle('mirror', e.target.checked));
  // banner loop: only when on screen, and not for reduced motion or data saver
  const hv = $('heroV');
  const calm = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || (navigator.connection && navigator.connection.saveData);
  if (hv && !calm && 'IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      if (es[0].isIntersecting) { if (!hv.src) hv.src = 'media/hero-loop.mp4'; hv.play().catch(() => {}); } else hv.pause();
    }, { threshold: 0.25 }).observe(hv);
  }
})();
