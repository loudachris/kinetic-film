import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSpec, durationOf, frameInfo, renderFrame } from '../engine/renderer.mjs';

const demo = JSON.parse(await readFile(new URL('../examples/demo.json', import.meta.url), 'utf8'));
const fresh = () => structuredClone(demo);

test('demo is valid, independent data with 40 beats and a 20-second duration', () => {
  const input = fresh(), validated = validateSpec(input);
  assert.equal(durationOf(validated), 20);
  assert.equal(validated.scenes.length, 6);
  assert.notEqual(validated, input);
  assert.notEqual(validated.scenes, input.scenes);
  validated.palette.accent = '#000000';
  assert.equal(input.palette.accent, '#FF735C');
});

test('validation rejects malformed, unsupported and executable-looking inputs', () => {
  const cases = [
    [s => { s.width = 721; }, /even/],
    [s => { s.height = 4000; }, /height/],
    [s => { s.fps = 29.97; }, /fps/],
    [s => { s.bpm = Infinity; }, /bpm/],
    [s => { s.seed = -1; }, /seed/],
    [s => { s.palette.accent = 'red'; }, /palette.accent/],
    [s => { s.scenes[0].beats = NaN; }, /beats/],
    [s => { s.scenes[0].type = 'javascript'; }, /type/],
    [s => { s.scenes[0].text = '<script>alert(1)</script>'; }, /plain text/],
    [s => { s.scenes[0].text = 'https://example.invalid/asset'; }, /plain text/],
    [s => { s.scenes[0].text = 'x'.repeat(201); }, /characters/],
    [s => { s.scenes[0].text = []; }, /lines/],
    [s => { s.scenes[0].audio = 'sound.wav'; }, /not supported/],
    [s => { s.scenes[0].caption = null; }, /characters/],
    [s => { s.scenes = []; }, /1 to 20/],
    [s => { s.assetPath = '../private'; }, /not supported/],
    [s => { s.bpm = 60; s.scenes.forEach(scene => { scene.beats = 16; }); }, /60 seconds/],
  ];
  for (const [mutate, error] of cases) { const input = fresh(); mutate(input); assert.throws(() => validateSpec(input), error); }
  assert.throws(() => validateSpec(null), /object/);
  assert.throws(() => validateSpec([]), /object/);
  const inherited = Object.create(demo);
  assert.throws(() => validateSpec(inherited), /plain object/);
});

test('scene boundaries and out-of-range times have defined behaviour', () => {
  const spec = validateSpec(demo);
  assert.deepEqual(frameInfo(spec, -1), { sceneIndex: 0, beat: 0, localBeat: 0 });
  assert.deepEqual(frameInfo(spec, 3), { sceneIndex: 1, beat: 6, localBeat: 0 });
  assert.deepEqual(frameInfo(spec, 20), { sceneIndex: 5, beat: 40, localBeat: 6 });
  assert.deepEqual(frameInfo(spec, 99), frameInfo(spec, 20));
  assert.throws(() => frameInfo(spec, Infinity), /finite/);
});

function recordingContext() {
  const commands = [];
  const target = { canvas: { width: 1, height: 1 }, commands, font: '10px Arial' };
  const methods = ['save', 'restore', 'setTransform', 'fillRect', 'beginPath', 'arc', 'ellipse', 'fill', 'stroke', 'moveTo', 'lineTo', 'closePath', 'translate', 'rotate', 'scale', 'fillText'];
  for (const method of methods) target[method] = (...args) => {
    assert(args.filter(value => typeof value === 'number').every(Number.isFinite), `${method} received a non-finite coordinate`);
    commands.push([method, ...args]);
  };
  target.measureText = text => ({ width: Array.from(text).length * Number(target.font.match(/([\d.]+)px/u)[1]) * 0.57 });
  return new Proxy(target, { set(object, name, value) { commands.push(['set', name, value]); object[name] = value; return true; } });
}

test('rendering is stateless and deterministic across scene types and 3 aspect ratios', () => {
  for (const [width, height] of [[1280, 720], [720, 1280], [1080, 1080]]) {
    const spec = validateSpec({ ...fresh(), width, height });
    for (const time of [0, 0.65, 2.95, 3.8, 6.8, 10.8, 14.8, 17.8, 20]) {
      const a = recordingContext(), b = recordingContext();
      const oldRandom = Math.random;
      try {
        Math.random = () => { throw new Error('Rendering must not use Math.random'); };
        renderFrame(a, spec, time); renderFrame(b, spec, time);
      } finally { Math.random = oldRandom; }
      assert.deepEqual(a.commands, b.commands);
      assert.equal(a.canvas.width, width); assert.equal(a.canvas.height, height);
      assert(a.commands.some(command => command[0] === 'fillText'));
    }
  }
});

test('seed changes the decorative texture and the next frame ignores previous draw state', () => {
  const spec = validateSpec(demo), other = { ...spec, seed: spec.seed + 1 };
  const a = recordingContext(), b = recordingContext();
  renderFrame(a, spec, 1); renderFrame(b, other, 1);
  assert.notDeepEqual(a.commands, b.commands);
  a.commands.length = 0;
  renderFrame(a, spec, 1);
  const c = recordingContext(); c.canvas.width = spec.width; c.canvas.height = spec.height;
  renderFrame(c, spec, 1);
  assert.deepEqual(a.commands, c.commands);
});

test('portrait headlines preserve whole words when the available width shrinks', () => {
  const spec = validateSpec({ ...fresh(), width: 720, height: 1280 });
  for (const [time, words] of [[1, ['YOUR', 'NEXT', 'IDEA']], [4, ['MAKE', 'SOME', 'NOISE']], [11, ['SHIFT', 'YOUR', 'PERSPECTIVE']], [15, ['BUILD', 'MOVE', 'REPEAT']]]) {
    const ctx = recordingContext(); renderFrame(ctx, spec, time);
    const drawn = ctx.commands.filter(command => command[0] === 'fillText').map(command => command[1]);
    for (const word of words) assert(drawn.includes(word), `Expected intact portrait word: ${word}`);
  }
});
