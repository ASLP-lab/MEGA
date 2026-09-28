(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const thread = $('#page-thread');
  const svg = $('#thread-svg');
  const path = $('#thread-path');
  const ribbon = $('#thread-ribbon');
  const gradient = $('#thread-gradient');
  const foliage = $('#vine-foliage');
  const svgNS = 'http://www.w3.org/2000/svg';
  let guides = [];
  let samples = [];
  let curves = [];
  let sprigs = [];
  let mobile = false;
  let dirty = true;
  let frame = 0;
  let lastDraw = 0;
  let elapsed = 0;
  let readingY = scrollY + innerHeight * .7;
  let relaxedScroll = scrollY;
  let shown = 0;

  function box(element) {
    let top = 0, left = 0;
    for (let node = element; node; node = node.offsetParent) {
      top += node.offsetTop;
      left += node.offsetLeft;
    }
    return { top, left, right: left + element.offsetWidth, height: element.offsetHeight, bottom: top + element.offsetHeight };
  }
  function shape(time, lag) {
    const amplitude = motion.matches ? 0 : mobile ? 3.5 : 14;
    const moving = guides.map(([x, y, verticalFreedom = 1], i) => [
      x + Math.sin(time * .46 + i * .61) * amplitude,
      y + (Math.cos(time * .38 + i * .73) * amplitude * .55 + Math.sin(i * .7) * lag * .16) * verticalFreedom,
    ]);
    const points = [moving[0], moving[0], ...moving, moving.at(-1), moving.at(-1)];
    const commands = [`M ${moving[0].join(' ')}`];
    curves = [];
    let start = moving[0];
    // Uniform cubic B-splines share position, tangent and curvature at every
    // join. Guides shape the broad gestures without introducing sharp elbows.
    for (let i = 0; i < points.length - 3; i++) {
      const [, a, b, c] = points.slice(i, i + 4);
      const control1 = a.map((value, axis) => (2 * value + b[axis]) / 3);
      const control2 = a.map((value, axis) => (value + 2 * b[axis]) / 3);
      const end = a.map((value, axis) => (value + 4 * b[axis] + c[axis]) / 6);
      commands.push(`C ${control1.join(' ')}, ${control2.join(' ')}, ${end.join(' ')}`);
      curves.push([start, control1, control2, end]);
      start = end;
    }
    return commands.join(' ');
  }
  function curvePoint(index, t) {
    const [a, b, c, d] = curves[index], u = 1 - t;
    return a.map((value, axis) => u ** 3 * value + 3 * u * u * t * b[axis] + 3 * u * t * t * c[axis] + t ** 3 * d[axis]);
  }
  function curveAngle(index, t) {
    const [a, b, c, d] = curves[index], u = 1 - t;
    const tangent = a.map((value, axis) => 3 * u * u * (b[axis] - value) + 6 * u * t * (c[axis] - b[axis]) + 3 * t * t * (d[axis] - c[axis]));
    return Math.atan2(tangent[1], tangent[0]) * 180 / Math.PI;
  }
  function plantVine(width) {
    // Store each leaf's position on a Bezier segment. Animation then evaluates
    // that segment directly, keeping every petiole attached without per-frame
    // SVG length queries or layout reads.
    const lookup = [{ length: 0, index: 0, t: 0 }];
    let previous = curves[0][0], length = 0;
    curves.forEach((_, index) => {
      for (let step = 1; step <= 32; step++) {
        const t = step / 32, point = curvePoint(index, t);
        length += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
        lookup.push({ length, index, t });
        previous = point;
      }
    });
    // Reserve the actual content columns. Leaves can use the margins and the
    // spaces between sections, but never grow over reading or audio controls.
    const protectedAreas = [...document.querySelectorAll('.hero-actions .button, .scroll-cue, .section-side, .abstract-copy, .section-heading, .architecture-figure, .method-notes, .results-section-heading, .comparison-controls, .metric-card, .results-chart-note, .listening-results, .demo-intro>.eyebrow, .demo-title-row, .demo-subtitle, .listening-note, .library-meta, .sample-wheel, .site-footer')].map(box);
    document.querySelectorAll('.hero h1, .authors, .affiliation, .author-notes, .hero>.eyebrow, .hero-word').forEach(element => {
      const layout = box(element), visual = element.getBoundingClientRect();
      const scaleX = visual.width / element.offsetWidth || 1;
      const scaleY = visual.height / element.offsetHeight || 1;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        for (const rect of range.getClientRects()) {
          // Remove the entrance transform: the centred hero has generous side
          // margins even though its text containers span the full page width.
          protectedAreas.push({
            left: layout.left + (rect.left - visual.left) / scaleX,
            right: layout.left + (rect.right - visual.left) / scaleX,
            top: layout.top + (rect.top - visual.top) / scaleY,
            bottom: layout.top + (rect.bottom - visual.top) / scaleY,
          });
        }
      }
    });
    function fits(point, angle, side, scale) {
      const rad = angle * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
      // Include a little room for the leaf's independent sway.
      const corners = [[-10, -51], [35, -51], [-10, 4], [35, 4]].map(([x, y]) => [
        point[0] + (x * cos - y * side * sin) * scale,
        point[1] + (x * sin + y * side * cos) * scale,
      ]);
      const bounds = { left: Math.min(...corners.map(p => p[0])), right: Math.max(...corners.map(p => p[0])), top: Math.min(...corners.map(p => p[1])), bottom: Math.max(...corners.map(p => p[1])) };
      if (bounds.right < 5 || bounds.left > width - 5) return false;
      const clearance = mobile ? 7 : 18;
      return !protectedAreas.some(area => bounds.right > area.left - clearance && bounds.left < area.right + clearance && bounds.bottom > area.top - clearance && bounds.top < area.bottom + clearance);
    }
    const fragment = document.createDocumentFragment();
    sprigs = [];
    for (let distance = 80, i = 0; distance < length - 30; i++) {
      const j = lookup.findIndex(item => item.length >= distance);
      const next = lookup[j], last = lookup[j - 1];
      const mix = (distance - last.length) / (next.length - last.length || 1);
      const t = (next.index === last.index ? last.t : 0) + mix / 32;
      const point = curvePoint(next.index, t), angle = curveAngle(next.index, t);
      let side = i % 2 ? 1 : -1;
      let scale = (mobile ? .43 : .77) * (.82 + (Math.sin(i * 2.4) + 1) * .17);
      let valid = fits(point, angle, side, scale);
      if (!valid) { side *= -1; valid = fits(point, angle, side, scale); }
      if (!valid) { scale *= .65; valid = fits(point, angle, side, scale); }
      if (valid) {
        const group = document.createElementNS(svgNS, 'g');
        const growth = document.createElementNS(svgNS, 'g');
        const leaf = document.createElementNS(svgNS, 'use');
        const tendril = i % 6 === 4;
        group.setAttribute('class', `vine-sprig${tendril ? ' vine-tendril' : ''}`);
        group.setAttribute('opacity', '0');
        leaf.setAttribute('href', tendril ? '#vine-tendril' : '#vine-leaf');
        growth.append(leaf);
        group.append(growth);
        fragment.append(group);
        sprigs.push({ group, growth, index: next.index, t, side, scale, phase: i * 1.71, progress: distance / length });
      }
      // Alternating short/long internodes prevent a regularly stamped pattern.
      distance += (mobile ? 85 : 104) + Math.sin(i * 1.8) * 27 + (i % 4 === 0 ? -25 : 10);
    }
    foliage.replaceChildren(fragment);
  }
  function growVine() {
    sprigs.forEach(sprig => {
      const progress = Math.max(0, Math.min(1, (shown - sprig.progress) / .023));
      const growth = motion.matches ? 1 : progress * progress * (3 - 2 * progress);
      sprig.group.setAttribute('opacity', (growth * .86).toFixed(3));
      if (!growth) return;
      const point = curvePoint(sprig.index, sprig.t);
      const angle = curveAngle(sprig.index, sprig.t);
      const sway = motion.matches ? 0 : Math.sin(elapsed * .85 + sprig.phase) * 7;
      sprig.group.setAttribute('transform', `translate(${point.join(' ')}) rotate(${angle})`);
      sprig.growth.setAttribute('transform', `scale(${sprig.scale} ${sprig.scale * sprig.side}) rotate(${sway}) scale(${.12 + .88 * growth})`);
    });
  }
  function measure() {
    dirty = false;
    const width = thread.clientWidth;
    const height = document.body.offsetHeight;
    const hero = box($('.hero'));
    const research = box($('#abstract'));
    const architecture = box($('.architecture-section'));
    const figure = box($('.architecture-figure'));
    const demos = box($('#demos'));
    const results = box($('#results'));
    const listening = box($('#subjective'));
    const charts = box($('#objective-charts'));
    const chartNote = box($('.results-chart-note'));
    const wheel = box($('.sample-wheel'));
    const demoBottom = box($('.demo-bottom'));
    const footer = box($('.site-footer'));
    const x = (fraction) => width * fraction;
    const a = research.top, b = research.bottom, c = architecture.bottom;
    mobile = width < 850;
    // Broad curves keep the central reading column and figure clear of the vine.
    guides = mobile ? [
      [x(.63), -150], [x(1.1), 50], [x(.99), hero.top + 220],
      [x(1.04), hero.bottom - 230], [x(1.02), a - 90],
      [x(.6), a - 30], [-24, a - 12], [-8, a + 65],
      [6, a + research.height * .55], [-10, b - 60], [-10, b - 5],
      [x(.45), b + 8], [x(1.09), architecture.top + 35],
      [x(.99), figure.top + figure.height * .5], [x(1.06), c - 80],
      [x(1.04), c - 40], [x(.48), c - 9], [-20, c + 3],
    ] : [
      [x(.58), -200], [x(1.09), 25], [x(.94), hero.top + 210],
      [x(.9), hero.top + 430], [x(1.04), hero.bottom - 190],
      [x(.65), hero.bottom - 22], [x(.06), hero.bottom - 120],
      [x(-.12), a + 125], [x(-.04), a + 270],
      [x(.18), a + research.height * .78], [x(.25), b - 15],
      [x(.48), b + 20], [x(1.13), architecture.top + 40],
      [x(.98), figure.top + 150], [x(.98), figure.top + figure.height * .65],
      [x(1.09), c - 125], [x(.72), c - 8], [x(.12), c - 55],
    ];
    // Let the gestures extend beyond the viewport, like the opening sections.
    // Treat all five objective cards as one block, then sweep above the dark
    // listening panel and back into the open space above the audio introduction.
    const objective = charts.height ? charts : box($('#objective'));
    const playback = wheel.height ? wheel : demoBottom;
    const listeningGap = listening.top - chartNote.bottom;
    const listeningBridge = chartNote.bottom + listeningGap * .5;
    guides.push(
      [x(-.09), results.top + 85],
      [x(-.2), objective.top + objective.height * .12],
      [x(mobile ? .13 : .12), objective.top + objective.height * .4],
      [x(-.14), objective.top + objective.height * .7],
      [x(-.12), objective.bottom - 45], [x(-.08), chartNote.bottom + 8],
      [x(.2), listeningBridge + listeningGap * .06, .5],
      [x(.62), listeningBridge - listeningGap * .08, .5],
      // Keep the bend outside the viewport so the spline cannot drop onto the
      // card's top edge. Limit vertical sway within this shared text/card gap.
      [x(1.14), listeningBridge + listeningGap * .04, .5],
      [x(1.3), listening.top + 120],
      [x(1.16), listening.top + listening.height * .27],
      [x(.88), listening.top + listening.height * .55],
      [x(1.2), listening.bottom - 100], [x(1.16), demos.top - 80],
      [x(.65), demos.top + 15], [x(.08), demos.top - 45],
      [x(-.22), demos.top + 140],
      [x(-.07), playback.top + playback.height * .22],
      [x(.1), playback.top + playback.height * .5],
      [x(-.2), playback.top + playback.height * .82],
      [x(-.1), footer.top + 15], [x(.12), footer.bottom + 35],
      [x(.7), footer.bottom + 70], [x(1.12), footer.bottom + 140],
    );
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    gradient.setAttribute('x1', '0');
    gradient.setAttribute('y1', '0');
    gradient.setAttribute('x2', String(width * .5));
    gradient.setAttribute('y2', String(height));
    path.setAttribute('d', shape(0, 0));
    const length = path.getTotalLength();
    samples = Array.from({ length: 201 }, (_, i) => path.getPointAtLength(length * i / 200).y);
    plantVine(width);
  }
  function revealAt(y) {
    let index = 0;
    // Match the draw head to the reading position, including broad loops, rather
    // than dividing total path length by document height.
    for (let i = 0; i < samples.length; i++) if (samples[i] <= y) index = i;
    if (index === samples.length - 1) return 1;
    const fraction = Math.max(0, Math.min(1, (y - samples[index]) / (samples[index + 1] - samples[index] || 1)));
    return (index + fraction) / (samples.length - 1);
  }
  function tick(timestamp) {
    frame = 0;
    if (document.hidden) return;
    if (!motion.matches && timestamp - lastDraw < 32 && !dirty) {
      frame = requestAnimationFrame(tick);
      return;
    }
    const dt = lastDraw ? Math.min(67, timestamp - lastDraw) : 33;
    lastDraw = timestamp;
    if (dirty) measure();
    const response = 1 - Math.exp(-dt / 150);
    const target = scrollY + innerHeight * .7;
    readingY += (target - readingY) * response;
    relaxedScroll += (scrollY - relaxedScroll) * response;
    const lag = Math.max(-65, Math.min(65, scrollY - relaxedScroll));
    if (motion.matches) {
      path.setAttribute('d', shape(0, 0));
      shown = 1;
    } else {
      elapsed += dt / 1000;
      path.setAttribute('d', shape(elapsed, lag));
      shown += (revealAt(readingY) - shown) * response;
    }
    // Draw each shaded layer with its own round cap, so the moving end stays
    // rounded too. No oversized clipping mask or travelling light segment.
    ribbon.style.strokeDasharray = `${(shown * 1000).toFixed(2)} 1000`;
    growVine();
    if (!motion.matches) frame = requestAnimationFrame(tick);
  }
  function invalidate() {
    dirty = true;
    if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
  }
  window.addEventListener('resize', invalidate, { passive: true });
  window.addEventListener('pageshow', invalidate);
  window.addEventListener('load', invalidate, { once: true });
  motion.addEventListener('change', () => {
    readingY = scrollY + innerHeight * .7;
    relaxedScroll = scrollY;
    invalidate();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; lastDraw = 0; }
    else invalidate();
  });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(invalidate);
    ['#main', '.hero', '#abstract', '.architecture-section', '#objective', '#subjective', '.site-footer'].forEach((selector) => observer.observe($(selector)));
  }
  document.fonts.ready.then(invalidate);
  invalidate();
})();
