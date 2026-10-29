import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFilm, loadSpec, main, parseArguments, requireNewFile, runProcess, startPreviewServer } from '../scripts/film.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const demo = path.join(root, 'examples', 'demo.json');

test('CLI refuses duplicate, unknown and incomplete options', async () => {
  assert.deepEqual({ ...parseArguments(['render', 'film.json', '--silent']).flags }, { silent: true });
  assert.throws(() => parseArguments(['snap', '--out']), /needs a value/);
  assert.throws(() => parseArguments(['render', '--fps', '30', '--fps', '60']), /Duplicate/);
  await assert.rejects(main(['render', demo, '--executable', 'untrusted.mjs']), /Unknown option/);
  await assert.rejects(main(['preview', demo, '--port', '80']), /1024/);
  await assert.rejects(main(['check']), /needs a video/);
});

test('spec overrides are validated before a browser or encoder is launched', async () => {
  const original = await loadSpec(demo);
  const portrait = await loadSpec(demo, { width: '360', height: '640', fps: '24' });
  assert.equal(portrait.width, 360);
  assert.equal(portrait.height, 640);
  assert.equal(portrait.fps, 24);
  assert.equal(original.width, 1280);
  await assert.rejects(loadSpec(demo, { width: '640' }), /together/);
  await assert.rejects(loadSpec(demo, { width: '641', height: '360' }), /width/i);
  await assert.rejects(loadSpec(demo, { fps: 'Infinity' }), /number/);
  const folder = await mkdtemp(path.join(os.tmpdir(), 'kinetic-spec-test-'));
  const invalid = path.join(folder, 'invalid.json');
  await writeFile(invalid, JSON.stringify({ ...original, script: 'process.exit(0)' }));
  await assert.rejects(loadSpec(invalid), /script|unknown|unsupported|unexpected/i);
});

test('init creates the requested orientation and refuses all existing paths', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'kinetic-init-test-'));
  const target = path.join(folder, 'my-film');
  const created = await createFilm(target, 'portrait');
  const spec = JSON.parse(await readFile(created, 'utf8'));
  assert.equal(spec.width, 1080);
  assert.equal(spec.height, 1920);
  await assert.rejects(createFilm(target, 'landscape'), /already exists/);
  await assert.rejects(requireNewFile(created), /already exists/);
  await assert.rejects(createFilm(path.join(folder, 'other'), 'unknown'), /Format/);
});

test('preview serves only fixed routes on loopback with a restrictive policy', async () => {
  const spec = await loadSpec(demo);
  const local = await startPreviewServer(spec);
  try {
    assert.equal(local.server.address().address, '127.0.0.1');
    const response = await fetch(`${local.url}spec.json`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal((await response.json()).title, spec.title);
    for (const route of ['package.json', 'scripts/film.mjs', '.env', '%2e%2e%2fpackage.json', 'output/test.mp4']) {
      const unknown = await fetch(local.url + route);
      assert.equal(unknown.status, 404, route);
      await unknown.arrayBuffer();
    }
    assert.equal((await fetch(local.url, { method: 'POST' })).status, 405);
    const hostileHost = await new Promise((resolve, reject) => {
      const request = http.get(local.url, { headers: { host: 'attacker.invalid' } }, (response) => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject);
    });
    assert.equal(hostileHost, 421);
  } finally { await local.close(); }
});

test('subprocess failures and missing programs reject instead of reporting success', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'process.stderr.write("deliberate failure"); process.exit(7)']), /failed \(7\).*deliberate failure/);
  await assert.rejects(runProcess('kinetic-film-intentionally-missing-program', []), /couldn't start/);
  const result = await runProcess(process.execPath, ['-e', 'process.stdout.write("ok")']);
  assert.equal(result.stdout, 'ok');
});
