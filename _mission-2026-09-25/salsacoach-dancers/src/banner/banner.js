// SalsaCoach practice banner: plays the 3.2 s silent loop only while the banner is on screen, never
// with reduced motion or Save-Data, and never loads any 3D. The poster stays the first paint.
(function () {
  var box = document.querySelector('.sc-banner');
  if (!box) return;
  var v = box.querySelector('.sc-loop'), btn = box.querySelector('.sc-pause');
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var save = navigator.connection && navigator.connection.saveData;
  if (!v || calm || save || !('IntersectionObserver' in window)) return;
  var paused = false, loaded = false;
  function load() {
    if (loaded) return; loaded = true;
    var webm = v.canPlayType && v.canPlayType('video/webm; codecs="vp9"');
    v.src = webm ? v.getAttribute('data-webm') : v.getAttribute('data-mp4');
    v.addEventListener('playing', function () { v.classList.add('on'); if (btn) btn.hidden = false; });
  }
  function play() { if (!paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } }
  new IntersectionObserver(function (es) {
    if (es[0].isIntersecting) { load(); play(); } else v.pause();
  }, { threshold: 0.3 }).observe(v);
  if (btn) btn.addEventListener('click', function () {
    paused = !paused;
    btn.setAttribute('aria-pressed', String(paused));
    btn.textContent = btn.getAttribute(paused ? 'data-play' : 'data-pause');
    if (paused) v.pause(); else play();
  });
})();
