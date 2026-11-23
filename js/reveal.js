'use strict';
(() => {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  if (preference.matches || !('IntersectionObserver' in window)) return;

  const modules = [...document.querySelectorAll([
    'main .section-head',
    '#showreel-video',
    '.showreel-caption',
    '.category-jumps',
    '#category-cards',
    '.comparison-toolbar',
    '#evidence-host',
    '.live-prompt',
    '.input-board',
    '#pipeline-section',
    '.implementation'
  ].join(','))];

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) reveal(entry.target);
    });
  }, { rootMargin: '0px 0px -48px 0px', threshold: 0 });

  function reveal(element, instant = false) {
    if (instant) element.classList.add('reveal-instant');
    element.classList.add('is-revealed');
    observer.unobserve(element);
  }

  // Content stays visible without JavaScript; only enhanced modules start hidden.
  modules.forEach(element => {
    element.classList.add('scroll-reveal');
    observer.observe(element);
  });

  // Keyboard focus should never wait for a decorative entrance.
  document.addEventListener('focusin', event => {
    const module = event.target.closest('.scroll-reveal');
    if (module) reveal(module, true);
  });
  preference.addEventListener('change', () => {
    if (!preference.matches) return;
    modules.forEach(element => reveal(element, true));
    observer.disconnect();
  });
})();
