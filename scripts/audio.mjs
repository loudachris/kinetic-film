import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { durationOf, validateSpec } from '../engine/renderer.mjs';

export const SAMPLE_RATE = 48_000;

// All voices share a beat clock. The seed chooses notes and the noise sequence.
// There are no samples, downloaded sounds, or runtime random sources.
export function synthesise(specification) {
  const spec = validateSpec(specification);
  const frames = Math.round(durationOf(spec) * spec.fps);
  const seconds = frames / spec.fps;
  const samples = Math.round(seconds * SAMPLE_RATE);
  const left = new Float32Array(samples);
  const right = new Float32Array(samples);
  const beatSeconds = 60 / spec.bpm;
  const boundaries = [0];
  for (const scene of spec.scenes) boundaries.push(boundaries.at(-1) + scene.beats);
  const tau = Math.PI * 2;
  const midi = (note) => 440 * 2 ** ((note - 69) / 12);
  const roots = [45, 41, 48, 43];
  const scale = [0, 3, 7, 10, 12, 7, 3, 14];
  let noiseState = ((spec.seed ^ 0x9e3779b9) >>> 0) || 1;
  let sceneIndex = 0;
  let peak = 0;
  let lastNoise = 0;

  for (let i = 0; i < samples; i += 1) {
    const time = i / SAMPLE_RATE;
    const beat = time / beatSeconds;
    const wholeBeat = Math.floor(beat);
    const phase = (beat - wholeBeat) * beatSeconds;
    while (sceneIndex < spec.scenes.length - 1 && beat >= boundaries[sceneIndex + 1]) sceneIndex += 1;
    const sceneAge = (beat - boundaries[sceneIndex]) * beatSeconds;
    const bar = Math.floor(beat / 4);
    const root = roots[(bar + spec.seed % roots.length) % roots.length];
    const bassHz = midi(root - 12);

    noiseState ^= noiseState << 13;
    noiseState ^= noiseState >>> 17;
    noiseState ^= noiseState << 5;
    const noise = (noiseState >>> 0) / 0x80000000 - 1;
    const brightNoise = (noise - lastNoise) * 0.5;
    lastNoise = noise;

    // Analytic frequency integration gives the kick a descending, phase-stable body.
    const kickPhase = tau * (43 * phase + 105 * 0.022 * (1 - Math.exp(-phase / 0.022)));
    const kick = Math.sin(kickPhase) * Math.exp(-phase * 15) * 0.65;
    const snare = wholeBeat % 4 === 1 || wholeBeat % 4 === 3
      ? (brightNoise * 0.25 + Math.sin(tau * 177 * phase) * 0.08) * Math.exp(-phase * 29)
      : 0;
    const halfBeat = beat * 2;
    const hatPhase = (halfBeat - Math.floor(halfBeat)) * beatSeconds / 2;
    const hat = brightNoise * Math.exp(-hatPhase * 105) * (Math.floor(halfBeat) % 2 ? 0.12 : 0.075);

    const bassEnvelope = Math.min(1, phase / 0.009) * Math.exp(-phase * 5.5);
    const bass = (Math.sin(tau * bassHz * phase) + 0.18 * Math.sin(tau * bassHz * 2 * phase)) * bassEnvelope * 0.23;
    const chordPhase = (beat % 4) * beatSeconds;
    const chordEnvelope = Math.min(1, chordPhase / 0.06) * Math.exp(-chordPhase * 0.8);
    const chord = [0, 3, 7].reduce((sum, note, index) => sum + Math.sin(tau * midi(root + 12 + note) * chordPhase + index * 0.13), 0) * chordEnvelope * 0.032;

    const step = Math.floor(halfBeat);
    const pluckHz = midi(root + 24 + scale[(step + (spec.seed >>> 4)) % scale.length]);
    const pluckEnvelope = Math.min(1, hatPhase / 0.004) * Math.exp(-hatPhase * 12);
    const pluck = (Math.sin(tau * pluckHz * hatPhase) + 0.2 * Math.sin(tau * pluckHz * 2 * hatPhase)) * pluckEnvelope * 0.105;
    const pan = Math.sin(step * 1.7 + spec.seed % 19) * 0.5;

    // Every scene starts with a soft impact and a high, descending shimmer.
    const impact = Math.sin(tau * (34 * sceneAge + 36 * 0.06 * (1 - Math.exp(-sceneAge / 0.06)))) * Math.exp(-sceneAge * 8) * 0.22;
    const shimmer = brightNoise * Math.exp(-sceneAge * 11) * 0.10;
    const fade = Math.min(1, time / 0.008, Math.max(0, (seconds - time) / 0.14));
    const centre = kick + snare + hat + bass + impact;
    left[i] = (centre + chord * 0.95 + pluck * (1 - pan) + shimmer) * fade;
    right[i] = (centre + chord * 1.05 + pluck * (1 + pan) - shimmer * 0.7) * fade;
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }

  const gain = peak > 0 ? 0.86 / peak : 0;
  const wav = Buffer.alloc(44 + samples * 4);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 4, 40);
  for (let i = 0; i < samples; i += 1) {
    wav.writeInt16LE(Math.round(left[i] * gain * 32_767), 44 + i * 4);
    wav.writeInt16LE(Math.round(right[i] * gain * 32_767), 46 + i * 4);
  }
  return { wav, samples, sampleRate: SAMPLE_RATE, channels: 2, duration: samples / SAMPLE_RATE, frames, peak: peak * gain };
}

export async function writeSoundtrack(spec, outPath) {
  const result = synthesise(spec);
  const destination = path.resolve(outPath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, result.wav, { flag: 'wx' });
  const { wav, ...metadata } = result;
  return { path: destination, ...metadata };
}
