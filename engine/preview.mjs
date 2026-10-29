import { validateSpec, durationOf, renderFrame } from '/renderer.mjs';

const capture = globalThis.__KINETIC_CAPTURE__ === true;
if (capture) document.documentElement.classList.add('capture');
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const play = document.getElementById('play');
const scrub = document.getElementById('scrub');
const current = document.getElementById('current');
const sceneList = document.getElementById('scenes');
let spec, duration = 0, position = 0, playing = false, previous = 0, animation = 0;
const buttons = [];

function stamp(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
}
function showTime(seconds) {
  position = Math.max(0, Math.min(duration, seconds));
  const info = renderFrame(ctx, spec, position);
  if (!capture) {
    scrub.value = String(position); current.textContent = stamp(position);
    buttons.forEach((button, index) => button.setAttribute('aria-current', String(index === info.sceneIndex)));
  }
  return info;
}
function pause() {
  playing = false; cancelAnimationFrame(animation);
  play.setAttribute('aria-label', 'Play preview');
  play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4 L21 12 L7 20 Z"/></svg>';
}
function tick(now) {
  if (!playing) return;
  const elapsed = Math.min((now - previous) / 1000, 0.25);
  previous = now;
  showTime(position + elapsed);
  if (position >= duration) { pause(); return; }
  animation = requestAnimationFrame(tick);
}
function toggle() {
  if (!spec || capture) return;
  if (playing) { pause(); return; }
  if (position >= duration) showTime(0);
  playing = true; previous = performance.now();
  play.setAttribute('aria-label', 'Pause preview');
  play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4 H10 V20 H6 Z M14 4 H18 V20 H14 Z"/></svg>';
  animation = requestAnimationFrame(tick);
}

globalThis.renderAt = seconds => {
  if (!spec) throw new Error('The film is still loading. Await kineticReady before rendering.');
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) throw new Error('Frame time must be a finite number');
  pause();
  return showTime(seconds);
};
globalThis.kineticReady = (async () => {
  try {
    const response = await fetch('/spec.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Unable to load film spec (HTTP ${response.status})`);
    spec = validateSpec(await response.json());
    duration = durationOf(spec);
    canvas.width = spec.width; canvas.height = spec.height;
    canvas.style.aspectRatio = `${spec.width} / ${spec.height}`;
    document.title = `${spec.title} | Kinetic Film`;
    document.getElementById('title').textContent = spec.title;
    document.getElementById('details').textContent = `${spec.width} × ${spec.height} / ${spec.fps} fps / ${spec.bpm} BPM / ${spec.scenes.length} scenes`;
    document.getElementById('duration').textContent = stamp(duration);
    scrub.max = String(duration); scrub.disabled = false; play.disabled = false;
    let beat = 0;
    spec.scenes.forEach((scene, index) => {
      const start = beat * 60 / spec.bpm;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'scene-button';
      const number = document.createElement('span'); number.className = 'scene-number'; number.textContent = String(index + 1).padStart(2, '0');
      button.append(number, document.createTextNode(scene.type.charAt(0).toUpperCase() + scene.type.slice(1)));
      button.setAttribute('aria-label', `Jump to scene ${index + 1}: ${scene.type}`);
      button.addEventListener('click', () => { pause(); showTime(start + Math.min(0.65, scene.beats * 0.25) * 60 / spec.bpm); });
      sceneList.append(button); buttons.push(button); beat += scene.beats;
    });
    showTime(capture ? 0 : Math.min(0.8, duration / 4));
    return spec;
  } catch (error) {
    const message = document.getElementById('error'); message.style.display = 'block'; message.textContent = error.message;
    document.getElementById('title').textContent = 'This film couldn’t load';
    throw error;
  }
})();
play.addEventListener('click', toggle);
scrub.addEventListener('input', () => { if (spec) { pause(); showTime(Number(scrub.value)); } });
document.addEventListener('keydown', event => {
  if (capture || !spec || event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
  if (event.code === 'Space') { event.preventDefault(); toggle(); }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); pause(); showTime(position + (event.key === 'ArrowRight' ? 1 : -1)); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
