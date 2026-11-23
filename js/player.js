'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const players = new Set();
let toastTimer;
let currentView;
const evidenceCache = new Map();

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('visible'), 2200);
}

async function copyLink(anchor) {
  const url = new URL(location.href);
  url.hash = anchor;
  try {
    await navigator.clipboard.writeText(url.href);
    toast('Link copied');
  } catch (_) {
    const input = document.createElement('textarea');
    input.value = url.href;
    input.style.cssText = 'position:fixed;left:-9999px';
    document.body.append(input);
    input.select();
    const ok = document.execCommand('copy');
    input.remove();
    toast(ok ? 'Link copied' : 'Copy this page’s address after opening the item link.');
    if (!ok) location.hash = anchor;
  }
}

document.addEventListener('click', event => {
  const copy = event.target.closest('[data-anchor]');
  if (copy) copyLink(copy.dataset.anchor);
});

function formatTime(value) {
  const seconds = Math.max(0, value || 0);
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function renderAnnotationComparison(panels) {
  if (!panels) return '';
  const highlighted = (text, phrase) => {
    const index = phrase ? text.indexOf(phrase) : -1;
    if (index < 0) return escapeHTML(text);
    return escapeHTML(text.slice(0, index)) + `<mark>${escapeHTML(phrase)}</mark>` + escapeHTML(text.slice(index + phrase.length));
  };
  return `<section class="annotation-comparison" aria-label="Gemini annotation comparison">${panels.map(panel => `
    <section class="annotation-panel ${panel.status === 'incorrect' ? 'annotation-incorrect' : 'annotation-correct'}">
      <h4>${escapeHTML(panel.label)}</h4>
      <div class="annotation-turns">${panel.turns.map(turn => `
        <div class="annotation-turn${turn.highlight ? ' has-target' : ''}">
          <p class="annotation-speaker">${escapeHTML(turn.speaker)}</p>
          <p class="annotation-words">${highlighted(turn.text, turn.highlight)}</p>
        </div>`).join('')}</div>
    </section>`).join('')}</section>`;
}

class ComparisonPlayer {
  constructor(group, host) {
    this.group = group;
    this.playing = false;
    this.starting = false;
    this.destroyed = false;
    this.duration = Math.min(...group.videos.map(video => video.duration));
    this.playLabel = group.videos.length === 1 ? 'Play video' : 'Play together';
    this.pauseLabel = group.videos.length === 1 ? 'Pause video' : 'Pause together';
    this.audioIndex = 0;
    this.rate = 1;
    this.ignoreSeekUntil = 0;
    this.root = document.createElement('article');
    this.root.className = group.annotationComparison ? 'video-group annotation-group' : 'video-group';
    if (group.observation) this.root.classList.add('outcome-group');
    this.root.id = group.id;
    this.root.innerHTML = `
      <div class="video-group-heading">
        <div class="item-heading"><div><span class="item-code">${escapeHTML(group.code)}</span><h3>${escapeHTML(group.title || `${group.people}-person conversation`)}</h3></div><button class="copy-link" data-anchor="${escapeHTML(group.anchor)}" aria-label="Copy link to ${group.code}">Copy link ↗</button></div>
        ${group.expectedActions ? `<section class="expected-actions" aria-label="Expected action sequence">
          <h4>Expected action sequence</h4>
          <ol>${group.expectedActions.steps.map(step => `<li>${escapeHTML(step)}</li>`).join('')}</ol>
          ${group.expectedActions.throughout ? `<p class="expected-constraint"><strong>Throughout:</strong> ${escapeHTML(group.expectedActions.throughout)}</p>` : ''}
        </section>` : group.description ? `<p class="video-description">${escapeHTML(group.description)}</p>` : ''}
        ${group.observation ? `<p class="observed-outcome${group.outcome === 'failure' ? ' observed-failure' : ''}"><strong>${group.outcome === 'failure' ? 'Observed failure' : 'Observed target actions'}:</strong> ${escapeHTML(group.observation)}</p>` : ''}
      </div>
      <div class="video-grid" style="--cols:${group.videos.length}">${group.videos.map((video, i) => `
        <div class="video-cell">
          <div class="video-label"><span>${escapeHTML(video.label)}</span><a href="${video.src}" target="_blank" rel="noopener" aria-label="Open ${escapeHTML(video.label)} video for ${group.code}">Open ↗</a></div>
          <video controls playsinline muted preload="none" src="${video.src}" poster="${video.poster}" aria-label="${escapeHTML(group.code + ' — ' + video.label)}">Your browser does not support embedded video. <a href="${video.src}">Open video</a>.</video>
          ${video.prompt ? `<details class="clip-prompt"><summary>Input prompt</summary><pre tabindex="0" aria-label="${escapeHTML(video.label)} input prompt">${escapeHTML(video.prompt)}</pre></details>` : ''}
        </div>`).join('')}</div>
      <div class="player-controls">
        <button class="play-button" aria-label="${this.playLabel}: ${escapeHTML(group.code)}">▶ ${this.playLabel}</button>
        <button class="restart-button" aria-label="Restart all videos in ${group.code}" title="Restart">↺</button>
        <input class="scrub" type="range" min="0" max="${this.duration}" step="0.01" value="0" aria-label="Seek all videos in ${group.code}">
        <output class="time-display">0:00 / ${formatTime(this.duration)}</output>
        <label class="control-select">Audio<select class="audio-select" aria-label="Audio source for ${group.code}">${group.videos.map((video, i) => `<option value="${i}">${escapeHTML(video.label)}</option>`).join('')}<option value="-1">Muted</option></select></label>
        <label class="control-select">Speed<select class="speed-select" aria-label="Playback speed for ${group.code}"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option></select></label>
      </div>
      <p class="player-status" role="status"></p>
      ${renderAnnotationComparison(group.annotationComparison)}`;
    host.append(this.root);
    this.videos = $$('video', this.root);
    this.playButton = $('.play-button', this.root);
    this.scrub = $('.scrub', this.root);
    this.clock = $('.time-display', this.root);
    this.status = $('.player-status', this.root);
    this.playButton.addEventListener('click', () => this.playing || this.starting ? this.pause() : this.start());
    $('.restart-button', this.root).addEventListener('click', () => this.seek(0));
    this.scrub.addEventListener('input', () => this.seek(Number(this.scrub.value)));
    $('.audio-select', this.root).addEventListener('change', event => this.setAudio(Number(event.target.value)));
    $('.speed-select', this.root).addEventListener('change', event => {
      this.rate = Number(event.target.value);
      this.videos.forEach(video => { video.playbackRate = this.rate; });
    });
    this.videos.forEach((video, i) => {
      video.addEventListener('loadedmetadata', () => {
        const durations = this.videos.map(v => v.duration);
        if (durations.every(d => Number.isFinite(d) && d > 0)) {
          this.duration = Math.min(...durations);
          this.scrub.max = String(this.duration);
          this.updateClock(video.currentTime);
        }
      });
      video.addEventListener('play', () => {
        if (!this.isVisible()) { video.pause(); return; }
        if (!this.starting && !this.playing) this.start(video);
      });
      video.addEventListener('pause', () => { if (this.playing && !this.starting && !this.seeking) this.pause(); });
      video.addEventListener('ended', () => this.pause());
      video.addEventListener('seeked', () => {
        if (Date.now() > this.ignoreSeekUntil && Math.abs(video.currentTime - Number(this.scrub.value)) > .12) this.seek(video.currentTime);
      });
      video.addEventListener('volumechange', () => { if (!video.muted && this.audioIndex !== i) this.setAudio(i); });
      video.addEventListener('error', () => { this.status.textContent = 'This video could not be loaded. Use its Open link to view it directly.'; });
    });
    this.setAudio(0);
    players.add(this);
  }

  setAudio(index) {
    this.audioIndex = index;
    $('.audio-select', this.root).value = String(index);
    this.videos.forEach((video, i) => { video.muted = i !== index; });
  }

  isVisible() {
    return this.root.isConnected && this.root.closest('#evidence-host') !== null && !this.root.closest('details:not([open])');
  }

  async start(origin = null) {
    if (this.starting || this.destroyed || !this.isVisible()) return;
    for (const player of players) if (player !== this) player.pause();
    this.starting = true;
    this.status.textContent = 'Loading the comparison…';
    let startTime = origin ? origin.currentTime : Number(this.scrub.value);
    if (startTime >= this.duration - .12) startTime = 0;
    this.seek(startTime);
    this.setAudio(this.audioIndex);
    this.videos.forEach(video => { video.playbackRate = this.rate; });
    const attempts = await Promise.allSettled(this.videos.map(video => video.play()));
    if (this.destroyed || !this.starting || !this.isVisible()) {
      this.videos.forEach(video => video.pause());
      return;
    }
    this.starting = false;
    if (attempts.some(result => result.status === 'rejected')) {
      this.pause();
      this.status.textContent = 'Playback could not start for every video. Try Play together again, or use the individual Open links.';
      return;
    }
    this.playing = true;
    this.status.textContent = '';
    this.playButton.textContent = `Ⅱ ${this.pauseLabel}`;
    this.playButton.setAttribute('aria-label', `${this.pauseLabel}: ${this.group.code}`);
    this.tick();
  }

  pause() {
    if (this.starting) this.status.textContent = '';
    this.playing = false;
    this.starting = false;
    this.videos.forEach(video => video.pause());
    cancelAnimationFrame(this.animation);
    this.playButton.textContent = `▶ ${this.playLabel}`;
    this.playButton.setAttribute('aria-label', `${this.playLabel}: ${this.group.code}`);
  }

  seek(time) {
    const position = Math.min(this.duration, Math.max(0, time));
    this.ignoreSeekUntil = Date.now() + 700;
    this.seeking = true;
    this.videos.forEach(video => {
      if (video.preload === 'none') video.preload = 'metadata';
      try { video.currentTime = position; } catch (_) { /* Browser applies pending seek after metadata. */ }
    });
    this.scrub.value = position;
    this.updateClock(position);
    this.seeking = false;
  }

  updateClock(time) {
    this.clock.textContent = `${formatTime(time)} / ${formatTime(this.duration)}`;
    this.onTime?.(time, this.duration);
  }

  tick() {
    if (!this.playing || this.destroyed) return;
    const time = this.videos[0].currentTime;
    this.scrub.value = time;
    this.updateClock(time);
    this.videos.slice(1).forEach(video => {
      if (video.readyState >= 2 && Math.abs(video.currentTime - time) > .2) {
        this.ignoreSeekUntil = Date.now() + 700;
        video.currentTime = time;
      }
    });
    if (time >= this.duration - .05) { this.pause(); return; }
    this.animation = requestAnimationFrame(() => this.tick());
  }

  destroy() {
    this.destroyed = true;
    this.pause();
    this.videos.forEach(video => { video.removeAttribute('src'); video.load(); });
    players.delete(this);
    this.root.remove();
  }
}

