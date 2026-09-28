(() => {
  'use strict';
  document.documentElement.classList.add('js');
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const datasetLabels = { suno70k: 'Suno70K', real_world: 'Real-world' };
  let library = null;
  let loadingLibrary = false;
  let libraryRequest = null;
  let toastTimer;

  function icon(name, className = '') {
    return `<svg class="icon ${className}" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
  }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }
  function formatTime(seconds) {
    const whole = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').classList.add('is-visible');
    toastTimer = setTimeout(() => $('#toast').classList.remove('is-visible'), 4000);
  }

  // A single media element prevents overlapping playback and eager MP3 downloads.
  const audio = new Audio();
  audio.preload = 'none';
  let active = null;
  let loadVersion = 0;
  let pendingSeek = null;
  let playbackFrame = 0;

  function paintPlayer(node, seconds = 0, duration = Number(node.dataset.duration)) {
    const fraction = Math.min(1, Math.max(0, duration > 0 ? seconds / duration : 0));
    $('.wave-progress', node).style.clipPath = `inset(0 ${(1 - fraction) * 100}% 0 0)`;
    $('.elapsed', node).textContent = formatTime(seconds);
    const slider = $('.seek-control', node);
    slider.max = duration;
    if (document.activeElement !== slider) slider.value = seconds;
    slider.setAttribute('aria-valuetext', `${formatTime(seconds)} of ${formatTime(duration)}`);
  }
  function paintState(node, playing, loading = false) {
    node.classList.toggle('is-playing', playing);
    node.classList.toggle('is-loading', loading);
    const button = $('.play-button', node);
    button.innerHTML = icon(playing ? 'pause' : 'play');
    button.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${node.dataset.label}`);
    button.setAttribute('aria-pressed', String(playing));
    const card = node.closest('.sample-card');
    card.classList.toggle('is-audible', playing);
    $('.playback-status', card).textContent = playing ? `Playing · ${library.models.find((model) => model.key === node.dataset.model).label}` : '';
  }
  function stopFrame() {
    cancelAnimationFrame(playbackFrame);
    playbackFrame = 0;
  }
  function trackPlayback() {
    stopFrame();
    const tick = () => {
      if (!active || audio.paused || document.hidden) return;
      paintPlayer(active.node, audio.currentTime, Number.isFinite(audio.duration) ? audio.duration : active.track.duration);
      playbackFrame = requestAnimationFrame(tick);
    };
    tick();
  }
  function releaseAudio() {
    loadVersion++;
    audio.pause();
    if (active) paintState(active.node, false);
    active = null;
    pendingSeek = null;
    audio.removeAttribute('src');
    audio.load();
    stopFrame();
  }
  async function playCurrent(version) {
    try {
      await audio.play();
    } catch (error) {
      if (version !== loadVersion || error.name === 'AbortError') return;
      if (active) paintState(active.node, false);
      if (error.name === 'NotAllowedError') toast('Press play again to start listening.');
      else showAudioError();
    }
  }
  function showAudioError() {
    if (!active) return;
    paintState(active.node, false);
    const error = $('.player-error', active.node);
    error.textContent = 'Audio unavailable. Press play to retry.';
    error.hidden = false;
    toast('This audio could not be loaded. Please try again.');
  }
  function choosePlayer(node, options = {}) {
    // A touch gesture can finish after its card has scrolled out of selection.
    if (!node.isConnected || !node.closest('.sample-card').classList.contains('is-current')) return;
    const isSame = active && active.node === node;
    if (isSame && options.time === undefined && !audio.error) {
      if (audio.paused) playCurrent(loadVersion);
      else audio.pause();
      return;
    }
    if (isSame && options.time !== undefined && !audio.error) {
      if (audio.readyState >= 1) audio.currentTime = Math.min(options.time, audio.duration || options.time);
      else pendingSeek = options.time;
      paintPlayer(node, options.time);
      if (options.play !== false) playCurrent(loadVersion);
      return;
    }
    const sample = library.samples.find((row) => row.id === node.dataset.sample);
    const track = sample.audio[node.dataset.model];
    const keepPosition = $('#sync-switch').checked && active?.sampleId === sample.id;
    const startTime = options.time ?? (keepPosition ? (pendingSeek ?? audio.currentTime) : 0);
    audio.pause();
    if (active) paintState(active.node, false);
    const version = ++loadVersion;
    active = { sampleId: sample.id, model: node.dataset.model, node, track };
    $('.player-error', node).hidden = true;
    pendingSeek = Math.min(startTime, Math.max(0, track.duration - 0.05));
    paintPlayer(node, pendingSeek);
    paintState(node, false, true);
    audio.src = new URL(track.src, document.baseURI).href;
    audio.load();
    // Start in the user's gesture; waiting for metadata would lose mobile autoplay permission.
    if (options.play !== false) playCurrent(version);
  }
  audio.addEventListener('loadedmetadata', () => {
    if (!active) return;
    if (pendingSeek !== null) {
      audio.currentTime = Math.min(pendingSeek, Math.max(0, audio.duration - 0.05));
      pendingSeek = null;
    }
    $('.duration', active.node).textContent = formatTime(audio.duration);
    paintPlayer(active.node, audio.currentTime, audio.duration);
  });
  audio.addEventListener('playing', () => {
    if (active) paintState(active.node, true);
    trackPlayback();
  });
  audio.addEventListener('pause', () => {
    if (active) paintState(active.node, false);
    stopFrame();
  });
  audio.addEventListener('waiting', () => {
    if (active) active.node.classList.add('is-loading');
  });
  audio.addEventListener('canplay', () => {
    if (active) active.node.classList.remove('is-loading');
  });
  audio.addEventListener('timeupdate', () => {
    if (active && pendingSeek === null) paintPlayer(active.node, audio.currentTime, audio.duration || active.track.duration);
  });
  audio.addEventListener('ended', () => {
    if (active) paintState(active.node, false);
    stopFrame();
  });
  audio.addEventListener('error', showAudioError);
  audio.addEventListener('volumechange', updateMuteButtons);
  function updateMuteButtons() {
    $$('.mute-button').forEach((button) => {
      button.innerHTML = icon(audio.muted ? 'muted' : 'volume');
      button.setAttribute('aria-label', `${audio.muted ? 'Unmute' : 'Mute'} audio`);
      button.setAttribute('aria-pressed', String(audio.muted));
    });
  }

  function waveformSVG(peaks) {
    // One path per waveform keeps the scrolling library light while preserving
    // the same 84 RMS bins and rounded bars.
    const bars = peaks.map((peak, index) => {
      const height = Math.max(0.01, peak * 34 - 1.5);
      return `M${index * 3 + .75} ${(40 - height) / 2}v${height}`;
    }).join('');
    return `<svg viewBox="0 0 ${peaks.length * 3} 40" preserveAspectRatio="none" aria-hidden="true"><path d="${bars}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  }
  function renderPlayer(sample, model) {
    const track = sample.audio[model.key];
    const label = `${model.label}, ${sample.title}`;
    const waveform = waveformSVG(track.waveform);
    return `<div class="audio-player ${model.key === 'mega' ? 'is-ours' : ''}" data-sample="${escapeHTML(sample.id)}" data-model="${escapeHTML(model.key)}" data-label="${escapeHTML(label)}" data-duration="${track.duration}">
      <h4 class="player-label">${escapeHTML(model.label)}${model.key === 'mega' ? '<span class="ours-label">(Ours)</span>' : ''}</h4>
      <div class="waveform">${waveform}<div class="wave-progress">${waveform}</div><input class="seek-control" type="range" min="0" max="${track.duration}" value="0" step="0.1" aria-label="Seek ${escapeHTML(label)}" aria-valuetext="0:00 of ${formatTime(track.duration)}"></div>
      <div class="player-controls"><button class="play-button" type="button" aria-label="Play ${escapeHTML(label)}" aria-pressed="false">${icon('play')}</button><span class="player-time"><span class="elapsed">0:00</span> / <span class="duration">${formatTime(track.duration)}</span></span><button class="mute-button" type="button" aria-label="Mute audio" aria-pressed="false">${icon('volume')}</button></div>
      <span class="player-error" role="status" hidden></span>
    </div>`;
  }
  function renderSample(sample) {
    return `<article class="sample-card" id="sample-${escapeHTML(sample.id)}" aria-labelledby="title-${escapeHTML(sample.id)}">
      <div class="sample-header"><div class="sample-name"><div><h3 id="title-${escapeHTML(sample.id)}">${escapeHTML(sample.title)}</h3><div class="sample-detail"><span class="playback-status"></span></div></div></div><div class="sample-tags"><span>${escapeHTML(datasetLabels[sample.dataset])}</span></div></div>
      <div class="caption-block"><span class="caption-label">CAPTION</span><p class="caption-text" id="caption-${escapeHTML(sample.id)}">${escapeHTML(sample.caption)}</p><button class="caption-toggle" type="button" aria-expanded="false" aria-controls="caption-${escapeHTML(sample.id)}">Read full caption +</button></div>
      <div class="audio-grid" role="group" aria-label="${escapeHTML(sample.title)} audio comparison">${library.models.map((model) => renderPlayer(sample, model)).join('')}</div>
    </article>`;
  }
  // Native scrolling supplies wheel / trackpad momentum, touch gestures and
  // snapping. Only the cards are transformed; their scroll targets stay fixed.
  const wheel = $('#sample-wheel');
  const sampleList = $('#sample-list');
  let wheelSamples = [];
  let wheelCards = [];
  let wheelIndex = -1;
  let wheelStep = 1;
  let wheelFrame = 0;
  let wheelPositions = [];
  let wheelIdleTimer;
  let wheelResetFrame = 0;
  const wheelCycles = 101;
  let touchSeek = null;
  const touchSeekInputs = new WeakSet();

  sampleList.addEventListener('pointerdown', (event) => {
    const input = event.target.closest('.seek-control');
    if (!input) return;
    touchSeekInputs.delete(input);
    if (event.pointerType === 'touch') {
      touchSeekInputs.add(input);
      touchSeek = { input, pointerId: event.pointerId, time: Number(input.value) };
    }
  }, { capture: true });
  window.addEventListener('pointerup', (event) => {
    if (!touchSeek || touchSeek.pointerId !== event.pointerId) return;
    const { input } = touchSeek;
    touchSeek = null;
    choosePlayer(input.closest('.audio-player'), { time: Number(input.value) });
  }, { capture: true });
  window.addEventListener('pointercancel', (event) => {
    if (!touchSeek || touchSeek.pointerId !== event.pointerId) return;
    const { input, time } = touchSeek;
    touchSeek = null;
    // Native vertical panning cancels the slider's pointer. Discard the range
    // change and any late change event instead of starting an accidental track.
    input.value = time;
    paintPlayer(input.closest('.audio-player'), time);
  }, { capture: true });
  sampleList.addEventListener('keydown', (event) => {
    if (event.target.matches('.seek-control')) touchSeekInputs.delete(event.target);
  });

  function wrapSong(index) {
    const count = wheelSamples.length;
    return ((index % count) + count) % count;
  }
  function placeWheel(position) {
    const first = Math.round(position) - Math.floor(wheelCards.length / 2);
    wheelCards.forEach((card, i) => {
      const slot = first + wrapSong(i - first);
      if (wheelPositions[i] === slot) return;
      wheelPositions[i] = slot;
      card.parentElement.style.top = `${slot * wheelStep}px`;
    });
  }
  function jumpWheel(position) {
    // Move the existing cards and scroll offset together. Player controls, focus
    // and caption state remain attached to the same DOM nodes across a wrap.
    cancelAnimationFrame(wheelResetFrame);
    sampleList.classList.add('is-recentering');
    placeWheel(position);
    sampleList.scrollTo({ top: position * wheelStep, behavior: 'instant' });
    updateWheel();
    wheelResetFrame = requestAnimationFrame(() => sampleList.classList.remove('is-recentering'));
  }
  function recenterWheel() {
    if (wheelCards.length < 2) return;
    const position = sampleList.scrollTop / wheelStep;
    const count = wheelCards.length;
    if (position < count * 2 || position > count * (wheelCycles - 2)) {
      jumpWheel(Math.floor(wheelCycles / 2) * count + wrapSong(position));
    }
  }
  function updateWheel() {
    wheelFrame = 0;
    if (!wheelCards.length) return;
    // A responsive slot size can change before its ResizeObserver callback.
    // Reposition the selected song before interpreting the new scroll offset.
    if (wheelCards[0].parentElement.offsetHeight !== wheelStep) {
      measureWheel();
      return;
    }
    const position = Math.max(0, sampleList.scrollTop / wheelStep);
    placeWheel(position);
    const index = wrapSong(Math.round(position));
    if (index !== wheelIndex) {
      if (wheelCards[wheelIndex]?.contains(document.activeElement)) sampleList.focus({ preventScroll: true });
      wheelIndex = index;
      if (active && active.sampleId !== wheelSamples[index].id) releaseAudio();
      wheelCards.forEach((card, i) => {
        card.classList.toggle('is-current', i === index);
        card.inert = i !== index;
      });
      $('#wheel-current').textContent = String(index + 1).padStart(2, '0');
      $('#wheel-announcement').textContent = `${wheelSamples[index].title}, song ${index + 1} of ${wheelSamples.length}`;
      $('#wheel-previous').disabled = wheelCards.length < 2;
      $('#wheel-next').disabled = wheelCards.length < 2;
    }
    $('#wheel-progress').style.top = `${wheelCards.length > 1 ? Math.min(1, wrapSong(position) / (wheelCards.length - 1)) * 100 : 0}%`;
    wheelCards.forEach((card, i) => {
      const distance = wheelPositions[i] - position;
      const depth = Math.abs(distance);
      const visible = depth < 2.2;
      card.style.visibility = visible ? 'visible' : 'hidden';
      if (!visible) return;
      card.parentElement.style.zIndex = String(10 - Math.round(depth * 3));
      // Nearby cards recede along the same continuous curve as the scroll.
      card.style.transform = motion.matches ? 'none' :
        `perspective(1400px) translateZ(${-depth * 150}px) rotateX(${Math.max(-1.5, Math.min(1.5, distance)) * -9}deg) scale(${1 - Math.min(depth, 2) * .035})`;
      card.style.opacity = String(motion.matches ? 1 : Math.max(.13, 1 - depth * .48));
    });
  }
  function scheduleWheelUpdate() {
    if (!wheelFrame) wheelFrame = requestAnimationFrame(updateWheel);
    clearTimeout(wheelIdleTimer);
    wheelIdleTimer = setTimeout(recenterWheel, 180);
  }
  function measureWheel() {
    if (!wheelCards.length || wheel.hidden) return;
    const index = Math.max(0, wheelIndex);
    const step = wheelCards[0].parentElement.offsetHeight;
    const position = wheelPositions[index];
    if (position !== undefined && step === wheelStep) return;
    wheelStep = step;
    wheelPositions = [];
    jumpWheel(position ?? ((wheelCards.length > 1 ? Math.floor(wheelCycles / 2) * wheelCards.length : 0) + index));
  }
  function selectSong(index) {
    if (!wheelCards.length) return;
    const next = wheelPositions[wrapSong(index)];
    sampleList.scrollTo({ top: next * wheelStep, behavior: motion.matches ? 'instant' : 'smooth' });
  }
  sampleList.addEventListener('scroll', scheduleWheelUpdate, { passive: true });
  sampleList.addEventListener('scrollend', recenterWheel);
  $('#wheel-previous').addEventListener('click', () => selectSong(wheelIndex - 1));
  $('#wheel-next').addEventListener('click', () => selectSong(wheelIndex + 1));
  sampleList.addEventListener('keydown', (event) => {
    if (event.target.closest('input, select, textarea, [contenteditable]') || event.altKey || event.ctrlKey || event.metaKey) return;
    const destinations = { ArrowUp: wheelIndex - 1, ArrowDown: wheelIndex + 1, Home: 0, End: wheelCards.length - 1 };
    if (!(event.key in destinations)) return;
    event.preventDefault();
    sampleList.focus({ preventScroll: true });
    selectSong(destinations[event.key]);
  });
  sampleList.addEventListener('click', (event) => {
    const slot = event.target.closest('.sample-slot');
    if (slot && Number(slot.dataset.index) !== wheelIndex) selectSong(Number(slot.dataset.index));
  });
  if ('ResizeObserver' in window) new ResizeObserver(measureWheel).observe(sampleList);
  else window.addEventListener('resize', measureWheel, { passive: true });
  motion.addEventListener('change', updateWheel);

  function renderLibrary() {
    if (!library) return;
    releaseAudio();
    wheelSamples = library.samples;
    wheelIndex = -1;
    wheelPositions = [];
    const count = wheelSamples.length;
    // A long native scroll runway carries momentum from the last song to the first. Each
    // song has exactly one card, recycled only when it is well outside view.
    sampleList.style.setProperty('--wheel-slot-count', count > 1 ? count * wheelCycles : count);
    sampleList.innerHTML = '<div class="sample-track">' + wheelSamples.map((sample, i) =>
      `<div class="sample-slot" data-index="${i}" role="group" aria-roledescription="slide" aria-label="Song ${i + 1} of ${count}">${renderSample(sample)}</div>`
    ).join('') + '</div>';
    wheelCards = $$('.sample-card', sampleList);
    sampleList.setAttribute('aria-busy', 'false');
    wheel.hidden = count === 0;
    $('#results-count').textContent = `${count} ${count === 1 ? 'sample' : 'samples'}`;
    $('#wheel-total').textContent = String(count).padStart(2, '0');
    $('#wheel-announcement').textContent = '';
    updateMuteButtons();
    measureWheel();
    requestAnimationFrame(() => $$('.caption-text').forEach((caption) => {
      caption.nextElementSibling.hidden = caption.scrollHeight <= caption.clientHeight + 2;
    }));
  }
  function validateLibrary(data) {
    const keys = ['vocal', 'mega', 'ace', 'lada', 'anyaccomp'];
    if (!Array.isArray(data.models) || data.models.map((model) => model.key).join() !== keys.join()) throw new Error('Invalid model list');
    if (!Array.isArray(data.samples) || !data.samples.length) throw new Error('No samples');
    const ids = new Set();
    for (const sample of data.samples) {
      if (!/^[\w-]+$/.test(sample.id) || ids.has(sample.id) || typeof sample.caption !== 'string' ||
          !Object.hasOwn(datasetLabels, sample.dataset)) throw new Error('Invalid sample');
      ids.add(sample.id);
      for (const key of keys) {
        const track = sample.audio?.[key];
        if (!track || !/^assets\/audio\/[\w./-]+\.mp3$/.test(track.src) || track.src.includes('..') ||
            !Number.isFinite(track.duration) || track.duration <= 0 || !Array.isArray(track.waveform) || !track.waveform.length ||
            !track.waveform.every((peak) => Number.isFinite(peak) && peak >= 0 && peak <= 1)) throw new Error('Invalid audio track');
      }
    }
    return data;
  }
  function loadLibrary() {
    if (library) return Promise.resolve();
    if (loadingLibrary) return libraryRequest;
    loadingLibrary = true;
    $('#load-error').hidden = true;
    $('#sample-list').setAttribute('aria-busy', 'true');
    libraryRequest = (async () => {
      try {
        const response = await fetch('data/samples.json?v=20260928-source-labels', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        library = validateLibrary(await response.json());
        $('#total-samples').textContent = library.samples.length;
        renderLibrary();
      } catch (error) {
        $('#load-error').hidden = false;
        $('#results-count').textContent = 'Samples unavailable';
        $('#sample-list').setAttribute('aria-busy', 'false');
        console.error('Unable to load sample library:', error);
      } finally { loadingLibrary = false; libraryRequest = null; }
    })();
    return libraryRequest;
  }
  $('#retry-load').addEventListener('click', loadLibrary);
  $('#sample-list').addEventListener('click', (event) => {
    const play = event.target.closest('.play-button');
    if (play) choosePlayer(play.closest('.audio-player'));
    const mute = event.target.closest('.mute-button');
    if (mute) audio.muted = !audio.muted;
    const caption = event.target.closest('.caption-toggle');
    if (caption) {
      const expanded = caption.getAttribute('aria-expanded') !== 'true';
      caption.setAttribute('aria-expanded', expanded);
      caption.textContent = expanded ? 'Show less −' : 'Read full caption +';
      caption.previousElementSibling.classList.toggle('is-expanded', expanded);
    }
  });
  $('#sample-list').addEventListener('input', (event) => {
    if (!event.target.matches('.seek-control') || touchSeekInputs.has(event.target)) return;
    const node = event.target.closest('.audio-player');
    const time = Number(event.target.value);
    paintPlayer(node, time);
    if (active?.node === node && audio.readyState >= 1) audio.currentTime = Math.min(time, audio.duration);
  });
  $('#sample-list').addEventListener('change', (event) => {
    if (event.target.matches('.seek-control') && !touchSeekInputs.has(event.target)) {
      choosePlayer(event.target.closest('.audio-player'), { time: Number(event.target.value) });
    }
  });
  // All sections stay in document flow. Native anchors handle scrolling and
  // browser history; the navigation follows the section in the viewport.
  const header = $('.site-header');
  const results = $('#results');
  const demos = $('#demos');
  const sectionLinks = $$('.section-nav [data-section]');
  let activeSection = '';
  let navigationFrame = 0;
  function updateSectionNavigation() {
    navigationFrame = 0;
    header.classList.toggle('is-scrolled', scrollY > 15);
    const threshold = header.offsetHeight + innerHeight * .25;
    const section = demos.getBoundingClientRect().top <= threshold ? 'demos' : results.getBoundingClientRect().top <= threshold ? 'results' : 'overview';
    if (section === activeSection) return;
    activeSection = section;
    sectionLinks.forEach((link) => {
      const isActive = link.dataset.section === section;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  function scheduleNavigationUpdate() {
    if (!navigationFrame) navigationFrame = requestAnimationFrame(updateSectionNavigation);
  }
  window.addEventListener('scroll', scheduleNavigationUpdate, { passive: true });
  window.addEventListener('resize', scheduleNavigationUpdate, { passive: true });
  window.addEventListener('pageshow', scheduleNavigationUpdate);

  // Decorative, lightweight canvas: no model inference, audio processing, or WebGL.
  const canvas = $('#melody-canvas');
  const context = canvas.getContext('2d');
  let melodyFrame = 0;
  let melodyInView = true;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let pointer = 0;
  let targetPointer = 0;
  let lastFrame = 0;
  function sizeCanvas() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width) return;
    canvasWidth = bounds.width;
    canvasHeight = bounds.height;
    const scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(bounds.width * scale);
    canvas.height = Math.round(bounds.height * scale);
    context?.setTransform(scale, 0, 0, scale, 0, 0);
  }
  function drawMelody(timestamp = 0) {
    if (!context) return;
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    const time = motion.matches ? 0 : timestamp / 2000;
    pointer += (targetPointer - pointer) * 0.04;
    const bars = 140;
    for (let i = 0; i < bars; i++) {
      const x = (i / (bars - 1)) * canvasWidth;
      const envelope = Math.sin(Math.PI * i / (bars - 1)) ** 1.5;
      const wave = Math.sin(i * .24 + time) * Math.cos(i * .073 - time * .55);
      const height = (8 + 52 * Math.abs(wave)) * envelope;
      const center = canvasHeight * .48 + Math.sin(i * .048 + time * .4 + pointer) * 10 * envelope;
      context.strokeStyle = `rgba(83,119,65,${.10 + envelope * .22})`;
      context.lineWidth = 1.8;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(x, center - height / 2);
      context.lineTo(x, center + height / 2);
      context.stroke();
    }
  }
  function updateMelodyVisibility() {
    cancelAnimationFrame(melodyFrame);
    melodyFrame = 0;
    if (document.hidden || !melodyInView || !context) return;
    sizeCanvas();
    if (motion.matches) { drawMelody(0); return; }
    const tick = (timestamp) => {
      if (timestamp - lastFrame > 30) { drawMelody(timestamp); lastFrame = timestamp; }
      melodyFrame = requestAnimationFrame(tick);
    };
    melodyFrame = requestAnimationFrame(tick);
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => {
    melodyInView = entry.isIntersecting;
    updateMelodyVisibility();
  }).observe(canvas);
  if ('ResizeObserver' in window) new ResizeObserver(sizeCanvas).observe(canvas);
  canvas.addEventListener('pointermove', (event) => {
    targetPointer = (event.offsetX / (canvasWidth || 1) - .5) * 2;
  }, { passive: true });
  canvas.addEventListener('pointerleave', () => { targetPointer = 0; });
  motion.addEventListener('change', () => {
    updateMelodyVisibility();
  });
  document.addEventListener('visibilitychange', () => {
    updateMelodyVisibility();
    if (document.hidden) stopFrame();
    else if (active && !audio.paused) trackPlayback();
  });
  window.addEventListener('pagehide', releaseAudio);

  const dialog = $('#architecture-dialog');
  $('#expand-architecture').addEventListener('click', () => dialog.showModal());
  $('#close-architecture').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

  updateSectionNavigation();
  // Prepare captions and waveforms for scrolling into the library. Audio files
  // remain unloaded until the visitor presses play.
  const libraryReady = loadLibrary();
  const initialHash = location.hash;
  if (['#overview', '#abstract', '#results', '#objective', '#demos'].includes(initialHash)) {
    // The local font can change the height above a deep link after the browser
    // first positions it. Align once the layout settles, unless the visitor has
    // already started interacting with the page.
    let interacted = false;
    const markInteraction = () => { interacted = true; };
    const interactionEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    interactionEvents.forEach((type) => window.addEventListener(type, markInteraction, { passive: true }));
    const pageReady = document.readyState === 'complete' ? Promise.resolve() :
      new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
    const resultsReady = new Promise(resolve => document.addEventListener('mega:results-ready', resolve, { once: true }));
    Promise.all([document.fonts.ready, libraryReady, pageReady, resultsReady]).then(() => requestAnimationFrame(() => {
      if (!interacted && location.hash === initialHash) $(initialHash).scrollIntoView({ behavior: 'instant' });
      interactionEvents.forEach((type) => window.removeEventListener(type, markInteraction));
    }));
  }
})();
