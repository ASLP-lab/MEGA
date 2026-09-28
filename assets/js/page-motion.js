(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const elements = [...document.querySelectorAll('.reveal, .hero-enter')];
  const sections = elements.map((element) => ({ element, zone: null, animation: null }));
  let frame = 0;
  let needsLayout = true;
  let viewportHeight = innerHeight;
  let headerHeight = 88;

  // offsetTop / offsetHeight exclude our visual transforms, so the scroll
  // thresholds never move as their own entrance / exit animations are painted.
  function documentBox(element) {
    let top = 0;
    for (let node = element; node; node = node.offsetParent) top += node.offsetTop;
    return { top, height: element.offsetHeight, bottom: top + element.offsetHeight };
  }
  function measure() {
    needsLayout = false;
    viewportHeight = innerHeight;
    headerHeight = $('.site-header').offsetHeight;
    sections.forEach((section) => Object.assign(section, documentBox(section.element)));
  }

  function restingPose(section, zone) {
    const prominent = section.element.matches('.hero-word, .architecture-figure, .demo-title-row, .section-heading, .results-section-heading');
    if (zone === 'visible') return { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' };
    const offset = zone === 'below' ? (prominent ? 90 : 64) : (prominent ? -72 : -48);
    return { opacity: 0, transform: `translate3d(0,${offset}px,0) scale(${prominent ? .955 : .985})` };
  }
  function entranceDelay(element) {
    const group = element.closest('.hero, .abstract-copy, .method-notes, .demo-intro');
    if (!group) return 0;
    const siblings = [...group.querySelectorAll('.reveal, .hero-enter')];
    return Math.max(0, siblings.indexOf(element)) * 65;
  }
  function transitionContent(section, zone, immediate = false) {
    if (zone === section.zone && !immediate) return;
    const { element } = section;
    const previousZone = section.zone;
    const target = restingPose(section, zone);
    const computed = getComputedStyle(element);
    const from = previousZone === null && zone === 'visible' ? restingPose(section, 'below') :
      { opacity: computed.opacity, transform: computed.transform };
    section.animation?.cancel();
    section.animation = null;
    section.zone = zone;
    element.style.opacity = target.opacity;
    element.style.transform = target.transform;
    element.style.willChange = '';
    // Prepare offscreen elements immediately on first load. Entering elements
    // always get a complete timed animation, even after a fast wheel gesture.
    if (immediate || (previousZone === null && zone !== 'visible')) return;
    element.style.willChange = 'transform, opacity';
    const animation = element.animate([from, target], {
      duration: zone === 'visible' ? 1050 : 420,
      delay: zone === 'visible' ? entranceDelay(element) : 0,
      easing: 'cubic-bezier(.22,1,.36,1)',
      fill: 'backwards',
    });
    section.animation = animation;
    animation.onfinish = () => {
      if (section.animation !== animation) return;
      section.animation = null;
      element.style.willChange = '';
    };
  }

  function paint() {
    frame = 0;
    if (document.hidden) return;
    if (needsLayout) measure();
    const top = scrollY + headerHeight;
    const bottom = scrollY + viewportHeight;
    const focused = document.activeElement;
    for (const section of sections) {
      const { element } = section;
      if (motion.matches || element.contains(focused)) {
        transitionContent(section, 'visible', true);
        continue;
      }
      // Use stable document coordinates, not animated bounding boxes. The
      // trigger sits inside the viewport, where the entrance is clearly visible.
      // A small dead band prevents repeated restarts near either boundary.
      const enteringInset = Math.min(125, viewportHeight * .15);
      const hysteresis = section.zone === 'visible' ? 22 : 0;
      const above = section.bottom < top + 24 - hysteresis;
      const below = section.top > bottom - enteringInset + hysteresis;
      transitionContent(section, above ? 'above' : below ? 'below' : 'visible');
    }
  }
  function schedule() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(paint);
  }
  function invalidate() {
    needsLayout = true;
    schedule();
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', invalidate, { passive: true });
  window.addEventListener('pageshow', invalidate);
  window.addEventListener('load', invalidate, { once: true });
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  motion.addEventListener('change', invalidate);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      sections.forEach((section) => section.animation?.pause());
    } else {
      sections.forEach((section) => section.animation?.play());
      invalidate();
    }
  });
  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(invalidate);
    ['#main', '.site-footer', '.hero', '#abstract', '.architecture-section', '#objective', '#subjective'].map($).filter(Boolean).forEach(element => resizeObserver.observe(element));
  }
  document.fonts.ready.then(invalidate);
  paint();
  document.documentElement.classList.add('motion-ready');

})();
