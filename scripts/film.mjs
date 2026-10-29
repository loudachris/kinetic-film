#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { durationOf, validateSpec } from '../engine/renderer.mjs';
import { writeSoundtrack } from './audio.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MAX_SPEC_BYTES = 1_048_576;
const HELP = `Kinetic Film public edition

node scripts/film.mjs doctor
node scripts/film.mjs init films/my-film --format landscape|portrait|square
node scripts/film.mjs preview examples/demo.json --port 5678
node scripts/film.mjs snap examples/demo.json --time 5 --out output/frame.png
node scripts/film.mjs render examples/demo.json --out output/demo.mp4 [--width 1280 --height 720 --fps 30] [--silent]
node scripts/film.mjs check output/demo.mp4

Outputs are never overwritten. Preview is silent; render includes original synthesised audio.
Install Chromium with: npx playwright install chromium
Optionally set CHROME_PATH to your Chromium executable.
`;

export function parseArguments(argv) {
  const [command = 'help', ...rest] = argv;
  const positional = [];
  const flags = Object.create(null);
  for (let i = 0; i < rest.length; i += 1) {
    const item = rest[i];
    if (!item.startsWith('--')) { positional.push(item); continue; }
    const key = item.slice(2);
    if (Object.hasOwn(flags, key)) throw new Error(`Duplicate option: --${key}`);
    if (key === 'silent') { flags[key] = true; continue; }
    if (!key || !rest[i + 1] || rest[i + 1].startsWith('--')) throw new Error(`Option ${item} needs a value.`);
    flags[key] = rest[++i];
  }
  return { command, positional, flags };
}

function validateArguments(parsed, allowed, count = 1) {
  if (parsed.positional.length > count) throw new Error(`Unexpected argument: ${parsed.positional[count]}`);
  for (const key of Object.keys(parsed.flags)) if (!allowed.includes(key)) throw new Error(`Unknown option: --${key}`);
}

function numberOption(value, name, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw new Error(`${name} must be a number.`);
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be finite.`);
  return result;
}

export async function loadSpec(filename, flags = {}) {
  const source = path.resolve(filename);
  const info = await stat(source);
  if (!info.isFile() || info.size > MAX_SPEC_BYTES) throw new Error('Spec must be a JSON file smaller than 1 MiB.');
  let parsed;
  try { parsed = JSON.parse(await readFile(source, 'utf8')); }
  catch (error) { throw new Error(`Invalid JSON spec: ${error.message}`); }
  const original = validateSpec(parsed);
  if ((flags.width === undefined) !== (flags.height === undefined)) throw new Error('--width and --height must be supplied together.');
  return validateSpec({ ...original,
    width: numberOption(flags.width, '--width', original.width),
    height: numberOption(flags.height, '--height', original.height),
    fps: numberOption(flags.fps, '--fps', original.fps),
  });
}

export async function requireNewFile(filename) {
  try { await access(filename); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error(`Output already exists: ${filename}`);
}

export function runProcess(executable, args, { signal, limit = 8_388_608 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], signal });
    let stdout = '';
    let stderr = '';
    let overflow = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.length > limit) { overflow = true; child.kill(); } });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-limit); });
    child.on('error', (error) => reject(new Error(`${executable} couldn't start: ${error.message}`)));
    child.on('close', (code, stoppedBy) => {
      if (overflow) reject(new Error(`${executable} exceeded the output limit.`));
      else if (code !== 0) reject(new Error(`${executable} failed (${stoppedBy || code}): ${stderr.trim()}`));
      else resolve({ stdout, stderr });
    });
  });
}

export async function startPreviewServer(specification, port = 0) {
  const spec = validateSpec(specification);
  const routes = new Map([
    ['/', ['text/html; charset=utf-8', await readFile(path.join(ROOT, 'engine', 'preview.html'))]],
    ['/preview.html', ['text/html; charset=utf-8', await readFile(path.join(ROOT, 'engine', 'preview.html'))]],
    ['/preview.mjs', ['text/javascript; charset=utf-8', await readFile(path.join(ROOT, 'engine', 'preview.mjs'))]],
    ['/renderer.mjs', ['text/javascript; charset=utf-8', await readFile(path.join(ROOT, 'engine', 'renderer.mjs'))]],
    ['/spec.json', ['application/json; charset=utf-8', Buffer.from(JSON.stringify(spec))]],
  ]);
  const server = http.createServer((request, response) => {
    const expectedHost = `127.0.0.1:${server.address().port}`;
    if (request.headers.host !== expectedHost && request.headers.host !== `localhost:${server.address().port}`) {
      response.writeHead(421).end('Loopback host required.'); return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return;
    }
    let pathname;
    try { pathname = new URL(request.url, `http://${expectedHost}`).pathname; }
    catch { response.writeHead(400).end(); return; }
    const route = routes.get(pathname);
    if (!route) { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found.'); return; }
    const [type, body] = route;
    response.writeHead(200, {
      'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}/`;
  return { server, url, close: () => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }) };
}

async function launchBrowser() {
  const options = { headless: true };
  if (process.env.CHROME_PATH) options.executablePath = process.env.CHROME_PATH;
  return chromium.launch(options);
}

async function withCapture(spec, work, signal) {
  signal?.throwIfAborted();
  const local = await startPreviewServer(spec);
  let browser;
  const abort = () => { browser?.close().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    browser = await launchBrowser();
    signal?.throwIfAborted();
    const page = await browser.newPage({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: 1 });
    await page.addInitScript(() => { globalThis.__KINETIC_CAPTURE__ = true; });
    await page.route('**/*', (route) => {
      if (route.request().url().startsWith(local.url)) return route.continue();
      return route.abort('blockedbyclient');
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(local.url, { waitUntil: 'networkidle' });
    await page.evaluate(() => globalThis.kineticReady);
    const capture = async (time) => {
      signal?.throwIfAborted();
      if (errors.length) throw new Error(`Renderer failed: ${errors.join('; ')}`);
      const encoded = await page.evaluate(async (seconds) => {
        await globalThis.renderAt(seconds);
        return document.querySelector('canvas').toDataURL('image/png').split(',')[1];
      }, time);
      if (errors.length) throw new Error(`Renderer failed: ${errors.join('; ')}`);
      return Buffer.from(encoded, 'base64');
    };
    return await work(capture);
  } finally {
    signal?.removeEventListener('abort', abort);
    await Promise.allSettled([browser?.close(), local.close()]);
  }
}

export async function createFilm(target, format = 'landscape') {
  const formats = { landscape: [1920, 1080], portrait: [1080, 1920], square: [1080, 1080] };
  if (!Object.hasOwn(formats, format)) throw new Error('Format must be landscape, portrait or square.');
  const folder = path.resolve(target);
  await requireNewFile(folder);
  const spec = await loadSpec(path.join(ROOT, 'examples', 'demo.json'));
  [spec.width, spec.height] = formats[format];
  validateSpec(spec);
  await mkdir(path.dirname(folder), { recursive: true });
  await mkdir(folder);
  const filename = path.join(folder, 'spec.json');
  await writeFile(filename, `${JSON.stringify(spec, null, 2)}\n`, { flag: 'wx' });
  return filename;
}

async function snapshot(spec, out, time, signal) {
  if (!out || path.extname(out).toLowerCase() !== '.png') throw new Error('--out must name a new .png file.');
  if (time < 0 || time > durationOf(spec)) throw new Error(`--time must be between 0 and ${durationOf(spec)} seconds.`);
  const destination = path.resolve(out);
  await requireNewFile(destination);
  const png = await withCapture(spec, (capture) => capture(time), signal);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, png, { flag: 'wx' });
  return destination;
}

async function encodeFrames(spec, destination, audioPath, capture, signal) {
  const frames = Math.round(durationOf(spec) * spec.fps);
  const args = ['-hide_banner', '-loglevel', 'error', '-n', '-f', 'image2pipe', '-framerate', String(spec.fps), '-vcodec', 'png', '-i', 'pipe:0'];
  if (audioPath) args.push('-i', audioPath);
  args.push('-map', '0:v:0');
  if (audioPath) args.push('-map', '1:a:0', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '192k');
  else args.push('-an');
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-vf', 'scale=out_color_matrix=bt709,setsar=1', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-frames:v', String(frames), '-t', String(frames / spec.fps), '-movflags', '+faststart', destination);
  const encoder = spawn('ffmpeg', args, { shell: false, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'], signal });
  let diagnostics = '';
  let failure;
  let closed = false;
  encoder.stderr.setEncoding('utf8');
  encoder.stderr.on('data', (chunk) => { diagnostics = (diagnostics + chunk).slice(-32_768); });
  encoder.stdin.on('error', (error) => { failure ||= error; });
  const completed = new Promise((resolve, reject) => {
    encoder.on('error', (error) => { failure = error; reject(error); });
    encoder.on('close', (code, stopSignal) => {
      closed = true;
      if (code === 0) resolve();
      else { failure = new Error(`FFmpeg failed (${stopSignal || code}): ${diagnostics.trim()}`); reject(failure); }
    });
  });
  // Observe failures immediately, including while a browser frame is being drawn.
  completed.catch(() => {});
  try {
    for (let frame = 0; frame < frames; frame += 1) {
      signal?.throwIfAborted();
      if (failure || closed) throw failure || new Error('FFmpeg exited before all frames were sent.');
      const png = await capture(frame / spec.fps);
      if (!encoder.stdin.write(png)) {
        await new Promise((resolve, reject) => {
          const cleanup = () => { encoder.stdin.off('drain', drained); encoder.stdin.off('error', failed); encoder.off('close', ended); };
          const drained = () => { cleanup(); resolve(); };
          const failed = (error) => { cleanup(); reject(error); };
          const ended = () => { cleanup(); reject(failure || new Error('FFmpeg closed its input.')); };
          encoder.stdin.once('drain', drained);
          encoder.stdin.once('error', failed);
          encoder.once('close', ended);
          if (failure || closed) ended();
        });
      }
      if (frame === 0 || (frame + 1) % spec.fps === 0 || frame === frames - 1) process.stderr.write(`\rRendering ${frame + 1}/${frames} frames`);
    }
    encoder.stdin.end();
    await completed;
    process.stderr.write('\n');
  } finally {
    if (!closed) { encoder.stdin.destroy(); encoder.kill(); await completed.catch(() => {}); }
  }
  return frames;
}

async function render(spec, out, silent, signal) {
  if (!out || path.extname(out).toLowerCase() !== '.mp4') throw new Error('--out must name a new .mp4 file.');
  const destination = path.resolve(out);
  await requireNewFile(destination);
  const audioPath = silent ? undefined : destination.slice(0, -4) + '.soundtrack.wav';
  if (audioPath) await requireNewFile(audioPath);
  await runProcess('ffmpeg', ['-version'], { signal });
  await mkdir(path.dirname(destination), { recursive: true });
  const frames = await withCapture(spec, async (capture) => {
    if (audioPath) await writeSoundtrack(spec, audioPath);
    return encodeFrames(spec, destination, audioPath, capture, signal);
  }, signal);
  return { path: destination, frames, duration: frames / spec.fps, width: spec.width, height: spec.height, fps: spec.fps, soundtrack: audioPath || null };
}

async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

export async function inspectVideo(filename, signal) {
  const source = path.resolve(filename);
  const destination = source.slice(0, source.length - path.extname(source).length) + '.check.json';
  await requireNewFile(destination);
  const probe = await runProcess('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', source], { signal });
  const data = JSON.parse(probe.stdout);
  const video = data.streams.find((stream) => stream.codec_type === 'video');
  const audio = data.streams.find((stream) => stream.codec_type === 'audio');
  if (!video) throw new Error('No video stream found.');
  if (video.codec_name !== 'h264' || video.pix_fmt !== 'yuv420p') throw new Error('Expected H.264 video with yuv420p pixel format.');
  if (audio && (audio.codec_name !== 'aac' || Number(audio.sample_rate) !== 48_000 || audio.channels !== 2)) throw new Error('Expected AAC audio at 48 kHz, stereo.');
  await runProcess('ffmpeg', ['-hide_banner', '-v', 'error', '-xerror', '-i', source, '-map', '0:v:0', '-map', '0:a:0?', '-f', 'null', '-'], { signal });
  const [numerator, denominator] = video.avg_frame_rate.split('/').map(Number);
  const manifest = {
    file: path.basename(source),
    measured: {
      duration: Number(video.duration || data.format.duration),
      fps: numerator / denominator, frameCount: Number(video.nb_read_frames),
      width: video.width, height: video.height, codec: video.codec_name, pixelFormat: video.pix_fmt,
      sampleAspectRatio: video.sample_aspect_ratio,
      colour: { space: video.color_space, primaries: video.color_primaries, transfer: video.color_transfer, range: video.color_range },
      audio: audio ? { codec: audio.codec_name, sampleRate: Number(audio.sample_rate), channels: audio.channels, duration: Number(audio.duration || data.format.duration) } : null,
      sha256: await sha256(source), fullDecodePassed: true,
    },
    subjective: { visualReview: 'Not performed by this command.', listeningReview: 'Not performed by this command.' },
  };
  if (![manifest.measured.duration, manifest.measured.fps, manifest.measured.frameCount].every((value) => Number.isFinite(value) && value > 0)) throw new Error('FFprobe returned incomplete timing or frame count.');
  await writeFile(destination, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return { manifestPath: destination, ...manifest };
}

async function doctor(signal) {
  const checks = await Promise.allSettled([
    runProcess('ffmpeg', ['-version'], { signal }),
    runProcess('ffprobe', ['-version'], { signal }),
    (async () => { const browser = await launchBrowser(); try { return { stdout: `Chromium ${browser.version()}` }; } finally { await browser.close(); } })(),
  ]);
  const names = ['FFmpeg', 'FFprobe', 'Chromium'];
  const report = { node: process.version, checks: checks.map((result, index) => ({ name: names[index], ok: result.status === 'fulfilled', detail: result.status === 'fulfilled' ? result.value.stdout.split(/\r?\n/)[0] : result.reason.message })) };
  console.log(JSON.stringify(report, null, 2));
  if (checks.some((check) => check.status === 'rejected')) throw new Error('A dependency check failed. Install FFmpeg/FFprobe and run npx playwright install chromium, then retry.');
}

export async function main(argv = process.argv.slice(2), signal) {
  const parsed = parseArguments(argv);
  const { command, positional, flags } = parsed;
  const input = positional[0] || path.join(ROOT, 'examples', 'demo.json');
  switch (command) {
    case 'help': case '--help': case '-h': console.log(HELP); break;
    case 'doctor': validateArguments(parsed, [], 0); await doctor(signal); break;
    case 'init':
      validateArguments(parsed, ['format']);
      if (!positional[0]) throw new Error('init needs a new project directory.');
      console.log(await createFilm(positional[0], flags.format)); break;
    case 'preview': {
      validateArguments(parsed, ['port']);
      const port = numberOption(flags.port, '--port', 5678);
      if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error('--port must be an integer from 1024 to 65535.');
      const spec = await loadSpec(input);
      const local = await startPreviewServer(spec, port);
      console.log(`Silent preview: ${local.url}\nPress Ctrl+C to stop.`);
      try {
        await new Promise((resolve) => { if (signal?.aborted) resolve(); else signal?.addEventListener('abort', resolve, { once: true }); });
      } finally { await local.close(); }
      break;
    }
    case 'snap': {
      validateArguments(parsed, ['time', 'out']);
      const spec = await loadSpec(input);
      console.log(await snapshot(spec, flags.out, numberOption(flags.time, '--time', 0), signal)); break;
    }
    case 'render': {
      validateArguments(parsed, ['out', 'width', 'height', 'fps', 'silent']);
      const spec = await loadSpec(input, flags);
      console.log(JSON.stringify(await render(spec, flags.out, flags.silent, signal), null, 2)); break;
    }
    case 'check':
      validateArguments(parsed, []);
      if (!positional[0]) throw new Error('check needs a video file.');
      console.log(JSON.stringify(await inspectVideo(positional[0], signal), null, 2)); break;
    default: throw new Error(`Unknown command: ${command}\nRun node scripts/film.mjs help for usage.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const stop = () => controller.abort(new Error('Interrupted.'));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22 or newer is required.');
    await main(process.argv.slice(2), controller.signal);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = controller.signal.aborted ? 130 : 1;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}
