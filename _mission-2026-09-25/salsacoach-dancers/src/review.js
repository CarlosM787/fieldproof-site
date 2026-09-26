// Review sections only: the banner loop plays while on screen, never with reduced motion or Save-Data.
(function () {
  var v = document.getElementById('heroV');
  if (!v) return;
  var calm = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || (navigator.connection && navigator.connection.saveData);
  if (calm || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(function (es) {
    if (es[0].isIntersecting) {
      if (!v.src) v.src = v.canPlayType('video/webm; codecs="vp9"') ? v.dataset.webm : v.dataset.mp4;
      var p = v.play(); if (p && p.catch) p.catch(function () {});
      v.classList.add('on');
    } else v.pause();
  }, { threshold: 0.3 }).observe(v);
})();
