import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { synthesise, writeSoundtrack } from '../scripts/audio.mjs';

const spec = {
  version: 1, title: 'SOUND CHECK', width: 640, height: 360,
  fps: 30, bpm: 127, seed: 38,
  palette: { background: '#101018', foreground: '#FAF6E9', accent: '#F36C58', secondary: '#B0A0E8' },
  scenes: [{ type: 'punch', beats: 2, text: 'START' }, { type: 'end', beats: 2, text: 'FINISH' }],
};
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');

test('soundtrack is repeatable, seed-dependent, frame-aligned stereo PCM', () => {
  const first = synthesise(spec);
  const second = synthesise(spec);
  const changed = synthesise({ ...spec, seed: spec.seed + 1 });
  assert.equal(hash(first.wav), hash(second.wav));
  assert.notEqual(hash(first.wav), hash(changed.wav));
  assert.equal(first.wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(first.wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(first.wav.readUInt16LE(20), 1);
  assert.equal(first.wav.readUInt16LE(22), 2);
  assert.equal(first.wav.readUInt32LE(24), 48_000);
  assert.equal(first.wav.readUInt16LE(34), 16);
  assert.equal(first.wav.readUInt32LE(40), first.samples * 4);
  assert.equal(first.frames, Math.round(4 * 60 / spec.bpm * spec.fps));
  assert.ok(Math.abs(first.duration - first.frames / spec.fps) <= 1 / 48_000);
  let peak = 0;
  let differentChannels = 0;
  let energy = 0;
  for (let offset = 44; offset < first.wav.length; offset += 4) {
    const left = first.wav.readInt16LE(offset);
    const right = first.wav.readInt16LE(offset + 2);
    peak = Math.max(peak, Math.abs(left), Math.abs(right));
    energy += left * left + right * right;
    if (left !== right) differentChannels += 1;
  }
  assert.ok(peak <= Math.ceil(0.86 * 32_767));
  assert.ok(peak > 20_000);
  assert.ok(energy > 0);
  assert.ok(differentChannels > first.samples / 2);
  assert.equal(first.wav.readInt16LE(44), 0);
  assert.ok(Math.abs(first.wav.readInt16LE(first.wav.length - 4)) < 100);
});

test('writeSoundtrack preserves an existing output and rejects invalid specs', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'kinetic-audio-test-'));
  const output = path.join(folder, 'sound.wav');
  const result = await writeSoundtrack(spec, output);
  const original = await readFile(output);
  assert.equal(result.sampleRate, 48_000);
  await assert.rejects(writeSoundtrack({ ...spec, seed: 41 }, output), { code: 'EEXIST' });
  assert.equal(hash(await readFile(output)), hash(original));
  assert.throws(() => synthesise({ ...spec, bpm: 0 }), /bpm/i);
});
