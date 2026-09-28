(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const fixed = value => Number(value).toFixed(2);
  const signed = value => `${value < 0 ? '−' : '+'}${fixed(Math.abs(value))}`;
  // Focused dot axes reveal small differences without treating a truncated
  // bar as a magnitude. Domains include all generated scores on BOTH sets.
  const scoreAxes = { se: [3, 4.2, .3], sb: [5, 6.5, .5], apa: [0, .8, .2], ab: [6.5, 7.5, .25], fad: [0, .8, .2] };
  const mosAxis = [3, 4.5, .5];
  const positionOn = (value, [min, max]) => (value - min) / (max - min) * 100;
  function axisLabels([min, max, step]) {
    return Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => `<span>${Number((min + step * i).toFixed(2))}</span>`).join('');
  }
  let data;
  let dataset = new URLSearchParams(location.search).get('dataset') === 'real_world' ? 'real_world' : 'suno70k';
  function rank(metric, scores) {
    const ours = scores.mega[metric.id];
    return 1 + data.models.filter(model => metric.direction === 'lower' ? scores[model.id][metric.id] < ours : scores[model.id][metric.id] > ours).length;
  }
  function createCharts() {
    data.metrics.forEach(metric => {
      const card = $(`[data-metric="${metric.id}"]`);
      card.innerHTML = `<p class="metric-category">${escape(metric.category)}</p>
        <div class="metric-title"><h3 id="metric-${metric.id}">${escape(metric.label)}</h3><span class="metric-direction">${metric.direction === 'lower' ? '↓ Lower is better' : '↑ Higher is better'}</span></div>
        <p class="metric-description">${escape(metric.description)}</p>
        <div class="metric-feature"><div class="metric-gain"><strong class="gain-value"></strong><span class="gain-label"></span></div><p class="metric-feature-note"><span class="metric-rank"></span><span>MEGA (Ours)</span><strong class="metric-value"></strong></p></div>
        <p class="metric-comparison"></p>
        <ul class="metric-bars" aria-labelledby="metric-${metric.id}">${data.models.map(model => `<li class="metric-bar-row ${model.id === 'mega' ? 'is-mega' : ''}" data-model="${model.id}"><span class="metric-model">${escape(model.label)}</span><span class="score-track" aria-hidden="true"><span class="score-gap"></span><span class="score-reference"></span><span class="score-dot"></span></span><strong class="bar-score"></strong></li>`).join('')}</ul>
        <div class="bar-axis" aria-hidden="true">${axisLabels(scoreAxes[metric.id])}</div><p class="score-axis-caption">FOCUSED SCORE RANGE · ${scoreAxes[metric.id][0]}–${scoreAxes[metric.id][1]}</p>
        <p class="ground-truth"><span>Ground Truth · reference</span><strong></strong></p>`;
      card.setAttribute('aria-busy', 'false');
    });
    data.subjective.metrics.forEach(metric => {
      const card = $(`[data-subjective="${metric.id}"]`), ours = data.subjective.scores.mega[metric.id];
      const strongest = data.models.filter(model => model.id !== 'mega').sort((a, b) => data.subjective.scores[b.id][metric.id].mean - data.subjective.scores[a.id][metric.id].mean)[0];
      const gain = ours.mean - data.subjective.scores[strongest.id][metric.id].mean;
      card.innerHTML = `<p class="listening-acronym">${metric.id.toUpperCase()}</p><h3 id="listening-${metric.id}">${escape(metric.label)}</h3>
        <p class="mos-gain"><strong>${signed(gain)}</strong><span>MOS points<br>vs. ${escape(strongest.label)}</span></p>
        <p class="mos-feature"><strong class="mos-mean">${fixed(ours.mean)}</strong><span class="mos-ci">± ${fixed(ours.ci)}</span></p><p class="mos-caption">MEGA (Ours) · highest reported MOS</p>
        <ul class="mos-chart" aria-labelledby="listening-${metric.id}">${data.models.map(model => {
          const score = data.subjective.scores[model.id][metric.id];
          // The dot axis explicitly zooms into 3–4.5 of the full 1–5 scale.
          // Transform both ends of every CI using that same domain.
          const position = positionOn(score.mean, mosAxis);
          const left = positionOn(score.mean - score.ci, mosAxis);
          const width = positionOn(score.mean + score.ci, mosAxis) - left;
          return `<li class="mos-row ${model.id === 'mega' ? 'is-mega' : ''}" data-model="${model.id}"><span class="mos-model">${escape(model.label)}</span><span class="mos-track" aria-hidden="true"><span class="mos-whisker" style="left:${left}%;width:${width}%"></span><span class="mos-dot" style="left:${position}%"></span></span><span class="mos-score">${fixed(score.mean)} ± ${fixed(score.ci)}</span></li>`;
        }).join('')}</ul><div class="mos-axis" aria-hidden="true">${axisLabels(mosAxis)}</div><p class="mos-axis-caption">ZOOMED MOS AXIS · 3–4.5 OF THE 1–5 SCALE</p>`;
      card.setAttribute('aria-busy', 'false');
    });
  }
  function updateCharts(announce = false) {
    if (!data) return;
    const set = data.datasets[dataset];
    $(`input[name="dataset"][value="${dataset}"]`).checked = true;
    $('#objective-charts').setAttribute('aria-label', `Objective scores for ${set.label}`);
    data.metrics.forEach(metric => {
      const card = $(`[data-metric="${metric.id}"]`), scores = set.scores, ours = scores.mega[metric.id];
      card.querySelector('.metric-value').textContent = fixed(ours);
      const position = rank(metric, scores);
      card.classList.toggle('is-leading', position === 1);
      card.querySelector('.metric-rank').textContent = `${['', '1st', '2nd', '3rd', '4th'][position]} of ${data.models.length} systems`;
      const baselines = data.models.filter(model => model.id !== 'mega').sort((a, b) => (scores[b.id][metric.id] - scores[a.id][metric.id]) * (metric.direction === 'lower' ? -1 : 1));
      const best = baselines[0], delta = ours - scores[best.id][metric.id];
      card.querySelector('.gain-value').textContent = position === 1 ? signed(delta) : fixed(ours);
      card.querySelector('.gain-label').textContent = position === 1 ? `score points vs. ${best.label}` : `${metric.label} · MEGA score`;
      if (position === 1 && metric.id === 'apa' && scores[best.id][metric.id] > 0) {
        card.querySelector('.metric-comparison').textContent = `${(delta / scores[best.id][metric.id] * 100).toFixed(1)}% higher APA score · strongest baseline`;
      } else {
        card.querySelector('.metric-comparison').textContent = position === 1 ? `Ahead of the strongest baseline · ${fixed(scores[best.id][metric.id])} → ${fixed(ours)}` : `Best: ${best.label} · ${fixed(scores[best.id][metric.id])}`;
      }
      const bestPosition = positionOn(scores[best.id][metric.id], scoreAxes[metric.id]);
      const ourPosition = positionOn(ours, scoreAxes[metric.id]);
      card.style.setProperty('--gap-left', `${Math.min(ourPosition, bestPosition)}%`);
      card.style.setProperty('--gap-width', `${Math.abs(ourPosition - bestPosition)}%`);
      card.style.setProperty('--best-position', `${bestPosition}%`);
      data.models.forEach(model => {
        const row = card.querySelector(`[data-model="${model.id}"]`), value = scores[model.id][metric.id];
        row.querySelector('.bar-score').textContent = fixed(value);
        row.querySelector('.score-dot').style.left = `${positionOn(value, scoreAxes[metric.id])}%`;
      });
      // Keep the shared model order from data.models in every chart.
      card.querySelector('.ground-truth strong').textContent = fixed(scores.ground_truth[metric.id]);
      if (announce && !motion.matches) card.querySelector('.gain-value').animate([{ opacity: .35, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 450, easing: 'cubic-bezier(.22,1,.36,1)' });
    });
    if (announce) $('#dataset-announcement').textContent = `Showing ${set.label}: ${set.songs} songs, five objective metrics. Pooled listening results are unchanged.`;
  }
  async function loadResults() {
    $('#results-data-error').hidden = true;
    document.body.classList.remove('results-unavailable');
    document.querySelectorAll('input[name="dataset"]').forEach(input => { input.disabled = true; });
    try {
      const response = await fetch('data/results.json');
      if (!response.ok) throw new Error(`Results request failed: ${response.status}`);
      data = await response.json();
      createCharts();
      updateCharts();
      document.querySelectorAll('input[name="dataset"]').forEach(input => { input.disabled = false; });
    } catch (error) {
      $('#results-data-error').hidden = false;
      document.body.classList.add('results-unavailable');
      console.error(error);
    } finally {
      // The shared page aligns incoming anchors after both charts and audio
      // samples have settled, so a slow chart request cannot displace #demos.
      document.dispatchEvent(new Event('mega:results-ready'));
    }
  }
  document.querySelectorAll('input[name="dataset"]').forEach(input => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      dataset = input.value;
      const url = new URL(location.href);
      url.searchParams.set('dataset', dataset);
      history.replaceState(null, '', url);
      updateCharts(true);
    });
  });
  window.addEventListener('popstate', () => {
    dataset = new URLSearchParams(location.search).get('dataset') === 'real_world' ? 'real_world' : 'suno70k';
    updateCharts();
  });
  $('#retry-results').addEventListener('click', loadResults);
  loadResults();
})();
