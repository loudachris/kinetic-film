/* Original canvas composition engine. No runtime assets or animation dependencies. */

const TYPES = new Set(['punch', 'stack', 'elastic', 'orbit', 'steps', 'end']);
const SPEC_KEYS = ['version', 'title', 'width', 'height', 'fps', 'bpm', 'seed', 'palette', 'scenes'];
const SCENE_KEYS = ['type', 'beats', 'text', 'eyebrow', 'caption'];
const FONT = 'Arial, Helvetica, sans-serif';
const HEAVY = '"Arial Black", Arial, Helvetica, sans-serif';

function fail(message) { throw new Error(`Invalid film spec: ${message}`); }
function object(value, name, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${name} must be a plain object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${name}.${key} is not supported`);
}
function number(value, name, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    fail(`${name} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}`);
  }
  return value;
}
function plainText(value, name, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${name} must contain 1 to ${max} characters`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail(`${name} contains a control character`);
  if (/<\/?[a-z][^>]*>|(?:https?|file|javascript|data):|(?:^|\s)[a-z]:[\\/]|\\\\/iu.test(value)) fail(`${name} must be plain text without markup, URLs or file paths`);
  return value.trim();
}

/** Validate untrusted JSON and return a fresh, bounded, plain-data spec. */
export function validateSpec(input) {
  object(input, 'spec', SPEC_KEYS);
  if (input.version !== 1) fail('version must be 1');
  const spec = {
    version: 1,
    title: plainText(input.title, 'title', 120),
    width: number(input.width, 'width', 320, 3840, true),
    height: number(input.height, 'height', 320, 3840, true),
    fps: number(input.fps, 'fps', 24, 60, true),
    bpm: number(input.bpm, 'bpm', 60, 200),
    seed: number(input.seed, 'seed', 0, 4294967295, true),
  };
  if (spec.width % 2 || spec.height % 2) fail('width and height must be even');
  object(input.palette, 'palette', ['background', 'foreground', 'accent', 'secondary']);
  spec.palette = {};
  for (const key of ['background', 'foreground', 'accent', 'secondary']) {
    const colour = input.palette[key];
    if (typeof colour !== 'string' || !/^#[0-9a-f]{6}$/iu.test(colour)) fail(`palette.${key} must be a #RRGGBB colour`);
    spec.palette[key] = colour;
  }
  if (!Array.isArray(input.scenes) || input.scenes.length < 1 || input.scenes.length > 20) fail('scenes must contain 1 to 20 scenes');
  let totalText = 0;
  spec.scenes = input.scenes.map((scene, index) => {
    const name = `scenes[${index}]`;
    object(scene, name, SCENE_KEYS);
    if (!TYPES.has(scene.type)) fail(`${name}.type must be punch, stack, elastic, orbit, steps or end`);
    const output = { type: scene.type, beats: number(scene.beats, `${name}.beats`, 1, 16) };
    if (Array.isArray(scene.text)) {
      if (scene.text.length < 1 || scene.text.length > 8) fail(`${name}.text must contain 1 to 8 lines`);
      output.text = scene.text.map((line, i) => plainText(line, `${name}.text[${i}]`));
    } else {
      output.text = plainText(scene.text, `${name}.text`);
    }
    const textLength = (Array.isArray(output.text) ? output.text.join('') : output.text).length;
    if (textLength > 600) fail(`${name}.text must contain no more than 600 characters in total`);
    totalText += textLength;
    for (const key of ['eyebrow', 'caption']) {
      if (scene[key] !== undefined) output[key] = plainText(scene[key], `${name}.${key}`, 180);
    }
    return output;
  });
  if (totalText > 6000) fail('scene text must contain no more than 6000 characters in total');
  if (durationOf(spec) > 60 + 1e-9) fail('total duration must be no more than 60 seconds');
  return spec;
}

export function durationOf(spec) {
  return spec.scenes.reduce((sum, scene) => sum + scene.beats, 0) * 60 / spec.bpm;
}

export function frameInfo(spec, timeSeconds) {
  if (typeof timeSeconds !== 'number' || !Number.isFinite(timeSeconds)) throw new Error('Frame time must be a finite number');
  const totalBeats = spec.scenes.reduce((sum, scene) => sum + scene.beats, 0);
  const beat = Math.max(0, Math.min(totalBeats, timeSeconds * spec.bpm / 60));
  let start = 0;
  for (let i = 0; i < spec.scenes.length; i++) {
    if (beat < start + spec.scenes[i].beats || i === spec.scenes.length - 1) return { sceneIndex: i, beat, localBeat: beat - start };
    start += spec.scenes[i].beats;
  }
}

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const out = value => 1 - Math.pow(1 - clamp(value), 4);
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const spring = value => value <= 0 ? 0 : 1 - Math.exp(-7 * value) * Math.cos(12 * value);
const fract = value => value - Math.floor(value);
function hash(seed, index) {
  let n = (seed ^ Math.imul(index + 1, 0x45d9f3b)) >>> 0;
  n = Math.imul(n ^ n >>> 16, 0x45d9f3b);
  n = Math.imul(n ^ n >>> 16, 0x45d9f3b);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
}
function theme(spec, type) {
  const { background: dark, foreground: light, accent, secondary } = spec.palette;
  if (type === 'punch' || type === 'steps') return { bg: light, fg: dark, pop: accent, alt: secondary };
  if (type === 'elastic') return { bg: accent, fg: dark, pop: light, alt: secondary };
  if (type === 'orbit') return { bg: secondary, fg: dark, pop: light, alt: accent };
  return { bg: dark, fg: light, pop: accent, alt: secondary };
}
function font(ctx, size, weight = 900) { ctx.font = `${weight} ${size}px ${weight >= 800 ? HEAVY : FONT}`; }
function circle(ctx, x, y, radius, fill) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
}
function line(ctx, x1, y1, x2, y2, colour, width) {
  ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function star(ctx, x, y, radius, rotation, colour, points = 8) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.fillStyle = colour; ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = i * Math.PI / points;
    const r = i % 2 ? radius * 0.29 : radius;
    const px = Math.cos(angle) * r, py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function tracked(ctx, text, x, y, size, colour, align = 'left', tracking = 0.14) {
  font(ctx, size, 700);
  const glyphs = Array.from(text);
  const gap = size * tracking;
  const width = glyphs.reduce((sum, glyph) => sum + ctx.measureText(glyph).width, 0) + Math.max(0, glyphs.length - 1) * gap;
  let left = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  ctx.fillStyle = colour; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const glyph of glyphs) { ctx.fillText(glyph, left, y); left += ctx.measureText(glyph).width + gap; }
  return width;
}
function breakLine(ctx, text, width) {
  const result = [];
  let current = '';
  for (const word of text.split(/\s+/u)) {
    if (ctx.measureText(word).width > width) {
      if (current) { result.push(current); current = ''; }
      // Keep words intact. The fitter reduces the size instead of stranding letters.
      result.push(word);
    } else if (current && ctx.measureText(`${current} ${word}`).width > width) {
      result.push(current); current = word;
    } else current += `${current ? ' ' : ''}${word}`;
  }
  if (current) result.push(current);
  return result.length ? result : [''];
}
function fitted(ctx, text, width, height, maxSize, lineRatio = 0.91) {
  const segments = (Array.isArray(text) ? text : [text]).map(value => value.toUpperCase());
  let low = 1, high = maxSize, found;
  for (let i = 0; i < 17; i++) {
    const size = (low + high) / 2;
    font(ctx, size);
    const lines = segments.flatMap(segment => breakLine(ctx, segment, width));
    const usedHeight = size + Math.max(0, lines.length - 1) * size * lineRatio;
    if (usedHeight <= height && lines.every(text => ctx.measureText(text).width <= width)) {
      low = size; found = { lines, size, lineHeight: size * lineRatio, height: usedHeight };
    } else high = size;
  }
  return found || { lines: segments, size: 1, lineHeight: 1, height: segments.length };
}
function mainLayout(ctx, spec, scene, options = {}) {
  const w = spec.width, h = spec.height, u = Math.min(w, h);
  const portrait = h > w * 1.2;
  const width = w * (options.width ?? 0.76);
  const height = h * (portrait ? 0.53 : 0.47) * (options.height ?? 1);
  const fit = fitted(ctx, scene.text, width, height, u * (portrait ? 0.35 : 0.34), options.lineRatio ?? 0.91);
  return { ...fit, x: w / 2, y: h * 0.49 - fit.height / 2 + fit.size * 0.5, width, portrait, u };
}
function drawLines(ctx, layout, colour, callback) {
  font(ctx, layout.size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < layout.lines.length; i++) {
    ctx.save(); ctx.fillStyle = colour;
    const y = layout.y + i * layout.lineHeight;
    if (callback) callback(layout.lines[i], layout.x, y, i);
    else ctx.fillText(layout.lines[i], layout.x, y);
    ctx.restore();
  }
}
function background(ctx, spec, info, colours) {
  const w = spec.width, h = spec.height, u = Math.min(w, h);
  ctx.fillStyle = colours.bg; ctx.fillRect(0, 0, w, h);
  ctx.save(); ctx.globalAlpha = 0.055;
  ctx.fillStyle = colours.fg;
  for (let i = 0; i < 150; i++) {
    const x = hash(spec.seed, i * 2) * w, y = hash(spec.seed, i * 2 + 1) * h;
    ctx.fillRect(x, y, Math.max(1, u * 0.0011), Math.max(1, u * 0.0011));
  }
  ctx.restore();
  const labelSize = u * 0.014;
  tracked(ctx, 'KINETIC / FILM', w * 0.1, h * 0.113, labelSize, colours.fg);
  tracked(ctx, `${String(info.sceneIndex + 1).padStart(2, '0')} / ${String(spec.scenes.length).padStart(2, '0')}`, w * 0.9, h * 0.113, labelSize, colours.fg, 'right');
  line(ctx, w * 0.1, h * 0.146, w * 0.9, h * 0.146, colours.fg, Math.max(1, u * 0.0012));
}
function furniture(ctx, spec, scene, info, colours) {
  const w = spec.width, h = spec.height, u = Math.min(w, h);
  if (scene.eyebrow) {
    const text = scene.eyebrow.toUpperCase();
    font(ctx, u * 0.016, 700);
    const size = Math.min(u * 0.016, u * 0.016 * (w * 0.78) / Math.max(1, ctx.measureText(text).width * 1.18));
    tracked(ctx, text, w / 2, h * 0.196, size, colours.fg, 'center', 0.17);
  }
  if (scene.caption) {
    const fit = fitted(ctx, scene.caption, w * 0.76, h * 0.056, u * 0.023, 1.16);
    font(ctx, fit.size, 500); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = colours.fg;
    fit.lines.forEach((text, index) => ctx.fillText(text, w / 2, h * 0.795 + (index - (fit.lines.length - 1) / 2) * fit.lineHeight));
  }
  const count = spec.scenes.length, gap = u * 0.009, segment = (w * 0.8 - gap * (count - 1)) / count;
  for (let i = 0; i < count; i++) {
    const x = w * 0.1 + i * (segment + gap);
    ctx.globalAlpha = 0.16; ctx.fillStyle = colours.fg; ctx.fillRect(x, h * 0.855, segment, u * 0.0035);
    ctx.globalAlpha = 1;
    const progress = i < info.sceneIndex ? 1 : i === info.sceneIndex ? clamp(info.localBeat / scene.beats) : 0;
    ctx.fillRect(x, h * 0.855, segment * progress, u * 0.0035);
  }
  const size = u * 0.012;
  tracked(ctx, 'YOUR WORDS. IN MOTION.', w * 0.1, h * 0.887, size, colours.fg, 'left', 0.07);
  tracked(ctx, `${spec.bpm} BPM`, w * 0.9, h * 0.887, size, colours.fg, 'right', 0.07);
}
function punch(ctx, spec, scene, info, c) {
  const l = mainLayout(ctx, spec, scene), w = spec.width, h = spec.height;
  const t = info.localBeat;
  ctx.save(); ctx.globalAlpha = 0.9;
  star(ctx, w * 0.78, h * 0.34, l.u * 0.13 * out(t / 0.65), t * 0.11, c.pop, 10);
  ctx.restore();
  drawLines(ctx, l, c.fg, (text, x, y, index) => {
    const p = spring(Math.max(0, t - index * 0.13) / 0.8);
    ctx.translate(x, y + (1 - out((t - index * 0.1) / 0.6)) * l.size * 0.75);
    ctx.scale(0.78 + p * 0.22, 0.65 + p * 0.35);
    ctx.globalAlpha = out((t - index * 0.1) / 0.3);
    if (index === l.lines.length - 1) {
      const width = ctx.measureText(text).width;
      ctx.fillStyle = c.alt; ctx.fillRect(-width * 0.51, l.size * 0.29, width * 1.02 * out((t - 0.5) / 0.55), l.size * 0.10);
      ctx.fillStyle = c.fg;
    }
    ctx.fillText(text, 0, 0);
  });
}
function stack(ctx, spec, scene, info, c) {
  const l = mainLayout(ctx, spec, scene, { lineRatio: 0.95 }), t = info.localBeat;
  const pulse = Math.pow(1 - fract(t), 5);
  line(ctx, spec.width * 0.125, spec.height * 0.28, spec.width * 0.125, spec.height * 0.68, c.alt, l.u * 0.004);
  drawLines(ctx, l, c.fg, (text, x, y, index) => {
    const p = out((t - index * 0.18) / 0.72);
    ctx.globalAlpha = p;
    ctx.translate(x + (1 - p) * l.width * (index % 2 ? 0.35 : -0.35), y);
    ctx.scale(1 + pulse * 0.012, 1);
    ctx.fillStyle = index === l.lines.length - 1 ? c.pop : c.fg;
    ctx.fillText(text, 0, 0);
  });
  star(ctx, spec.width * 0.86, spec.height * 0.73, l.u * 0.034, t * 0.3, c.alt, 4);
}
function elastic(ctx, spec, scene, info, c) {
  const l = mainLayout(ctx, spec, scene, { width: 0.73, height: 0.94 }), t = info.localBeat;
  ctx.save(); ctx.globalAlpha = 0.2;
  ctx.strokeStyle = c.fg; ctx.lineWidth = l.u * 0.0015;
  const radius = l.u * (0.23 + 0.018 * Math.sin(t * Math.PI));
  ctx.beginPath(); ctx.arc(spec.width / 2, spec.height * 0.49, radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  drawLines(ctx, l, c.fg, (text, x, y, row) => {
    const glyphs = Array.from(text), total = ctx.measureText(text).width;
    let left = x - total / 2;
    for (let i = 0; i < glyphs.length; i++) {
      const glyph = glyphs[i], width = ctx.measureText(glyph).width;
      const p = spring(Math.max(0, t - row * 0.13 - i * 0.034) / 0.78);
      const settled = smooth((t - 1.15) / 0.5);
      const bounce = Math.sin(t * Math.PI * 2 - i * 0.5 + row) * l.size * 0.025 * settled;
      ctx.save(); ctx.translate(left + width / 2, y + bounce + (1 - p) * l.size * 0.4);
      ctx.rotate((1 - p) * (i % 2 ? -0.19 : 0.19)); ctx.scale(1, Math.max(0.05, p));
      ctx.globalAlpha = out((t - row * 0.13 - i * 0.034) / 0.24);
      ctx.fillText(glyph, 0, 0); ctx.restore(); left += width;
    }
  });
  star(ctx, spec.width * 0.84, spec.height * 0.72, l.u * 0.039, -t * 0.25, c.pop, 6);
}
function orbit(ctx, spec, scene, info, c) {
  const l = mainLayout(ctx, spec, scene, { width: 0.7, height: 0.9 }), w = spec.width, h = spec.height, t = info.localBeat;
  ctx.save(); ctx.translate(w / 2, h * 0.48); ctx.rotate(-0.32 + t * 0.055);
  ctx.strokeStyle = c.fg; ctx.lineWidth = l.u * 0.0018; ctx.globalAlpha = 0.4;
  ctx.beginPath(); ctx.ellipse(0, 0, w * 0.405, h * 0.25, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  const angle = t * 0.47 - 0.5;
  circle(ctx, Math.cos(angle) * w * 0.405, Math.sin(angle) * h * 0.25, l.u * 0.019, c.pop);
  ctx.restore();
  const entry = out(t / 0.85);
  ctx.save(); ctx.translate(w / 2, h * 0.49); ctx.rotate((-3 + (1 - entry) * 7) * Math.PI / 180);
  ctx.scale(0.85 + entry * 0.15, 0.85 + entry * 0.15); ctx.translate(-w / 2, -h * 0.49);
  ctx.globalAlpha = entry;
  const words = (Array.isArray(scene.text) ? scene.text.join(' ') : scene.text).toUpperCase().split(/\s+/u);
  if (w / h < 1.4 && words.length > 1 && words.length <= 5) {
    // Narrow canvases get a new composition, with each intact word sized independently.
    const sizes = words.map(word => {
      font(ctx, l.u * 0.24);
      return Math.min(l.u * 0.24, l.u * 0.24 * w * 0.68 / Math.max(1, ctx.measureText(word).width));
    });
    const rawHeight = sizes.reduce((sum, size) => sum + size * 0.94, 0);
    const scale = Math.min(1, h * 0.46 / rawHeight);
    let y = h * 0.49 - rawHeight * scale / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = c.fg;
    words.forEach((word, i) => {
      const size = sizes[i] * scale;
      font(ctx, size); ctx.fillText(word, w / 2, y + size * 0.46); y += size * 0.94;
    });
  } else drawLines(ctx, l, c.fg);
  ctx.restore();
  star(ctx, w * 0.14, h * 0.72, l.u * 0.035, t * 0.2, c.fg, 4);
}
function steps(ctx, spec, scene, info, c) {
  const l = mainLayout(ctx, spec, scene, { width: 0.66, height: 0.91, lineRatio: 1.12 }), t = info.localBeat;
  drawLines(ctx, l, c.bg, (text, x, y, index) => {
    const enter = out((t - index * 0.22) / 0.62);
    const step = (index - (l.lines.length - 1) / 2) * Math.min(l.u * 0.038, spec.width * 0.025);
    const width = Math.min(l.width + l.size * 0.25, ctx.measureText(text).width + l.size * 0.28);
    ctx.translate(x + step, y + (1 - enter) * l.size * 0.5);
    ctx.globalAlpha = enter;
    ctx.fillStyle = index === l.lines.length - 1 ? c.pop : c.fg;
    ctx.fillRect(-width / 2, -l.size * 0.49, width * enter, l.size * 0.98);
    ctx.fillStyle = index === l.lines.length - 1 ? c.fg : c.bg;
    ctx.fillText(text, 0, -l.size * 0.015);
  });
}
function end(ctx, spec, scene, info, c) {
  const l = mainLayout(ctx, spec, scene, { width: 0.74, height: 0.87 }), w = spec.width, h = spec.height, t = info.localBeat;
  const enter = out(t / 0.9);
  star(ctx, w * 0.5, h * 0.72, l.u * 0.045 * spring(t / 0.9), t * 0.18, c.pop, 8);
  drawLines(ctx, l, c.fg, (text, x, y, i) => {
    const p = out((t - i * 0.18) / 0.8);
    ctx.translate(x, y); ctx.scale(0.88 + p * 0.12, 0.88 + p * 0.12);
    ctx.globalAlpha = p;
    ctx.fillStyle = i === l.lines.length - 1 ? c.alt : c.fg;
    ctx.fillText(text, 0, (1 - p) * l.size * 0.3);
  });
  line(ctx, w * 0.1, h * 0.237, w * (0.1 + 0.8 * enter), h * 0.237, c.pop, l.u * 0.004);
}

const DRAW = { punch, stack, elastic, orbit, steps, end };

/** Draw any instant directly. No previous frame, wall clock or random source is used. */
export function renderFrame(ctx, spec, timeSeconds) {
  const info = frameInfo(spec, timeSeconds);
  const scene = spec.scenes[info.sceneIndex], colours = theme(spec, scene.type);
  if (ctx.canvas.width !== spec.width) ctx.canvas.width = spec.width;
  if (ctx.canvas.height !== spec.height) ctx.canvas.height = spec.height;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  background(ctx, spec, info, colours);
  DRAW[scene.type](ctx, spec, scene, info, colours);
  furniture(ctx, spec, scene, info, colours);
  if (info.sceneIndex < spec.scenes.length - 1) {
    const transitionBeats = Math.min(0.42, scene.beats * 0.18);
    const wipe = smooth((info.localBeat - scene.beats + transitionBeats) / transitionBeats);
    if (wipe > 0) {
      const next = theme(spec, spec.scenes[info.sceneIndex + 1].type);
      const edge = spec.width * wipe;
      ctx.fillStyle = next.bg; ctx.fillRect(0, 0, edge, spec.height);
      ctx.fillStyle = next.pop; ctx.fillRect(Math.max(0, edge - spec.width * 0.018), 0, Math.min(edge, spec.width * 0.018), spec.height);
    }
  }
  ctx.restore();
  return info;
}
