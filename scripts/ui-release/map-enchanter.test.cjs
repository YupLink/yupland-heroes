const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/map-enchanter/manifest-v2.json'), 'utf8'));
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/components/beta-raid/mapEnchanter.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function setup() {
  let now = 1000, reduced = false, hidden = false;
  const api = {};
  vm.runInNewContext(code, { exports: api, URL, Date: { now: () => now }, window: { matchMedia: () => ({ matches: reduced }) }, document: { get hidden() { return hidden; } } });
  return { api, now: value => now = value, reduced: value => reduced = value, hidden: value => hidden = value };
}
test('only approved source artwork selects the shaman animation', () => {
  const { api } = setup();
  assert.equal(api.isMapEnchanterSource('/uploads/tasks/vo2fltwiAU.webp?v=1'), true);
  assert.equal(api.isMapEnchanterSource('/raid-shops/buildings/vo2fltwiAU.webp'), true);
  for (const url of ['/uploads/tasks/other.webp', '/other/vo2fltwiAU.webp', '/uploads/tasks/vo2fltwiAU.webp/extra']) assert.equal(api.isMapEnchanterSource(url), false);
});
test('all five complete stories alternate with quiet intervals and never repeat consecutively', () => {
  const { api } = setup(), order = [], frames = new Map(); let active = null;
  assert.equal(api.enchanterPose(0, '31,61').kind, 'idle');
  assert.equal(api.enchanterPose(10000, '31,61').kind, 'hand');
  for (let t = 0; t < 450000; t += 10) {
    const pose = api.enchanterPose(t, '31,61'), atlas = manifest.atlases[pose.kind];
    assert.ok(pose.delay > 0 && pose.delay <= 900);
    assert.ok(atlas && pose.frame >= 0 && pose.frame < atlas.frames);
    if (pose.kind === 'idle' || pose.kind === 'hand') { active = null; continue; }
    if (!frames.has(pose.kind)) frames.set(pose.kind, new Set());
    frames.get(pose.kind).add(pose.frame);
    if (active !== pose.kind) {
      if (order.length) assert.notEqual(order.at(-1), pose.kind);
      order.push(pose.kind); active = pose.kind;
    }
  }
  assert.deepEqual(order.slice(0, 5), ['boot', 'flower', 'snake', 'butterflies', 'spit']);
  assert.equal(frames.size, 5);
  for (const [kind, values] of frames) assert.equal(values.size, manifest.atlases[kind].frames);
  assert.ok(order.length >= 10 && order.length <= 13);
});
test('hidden/offscreen/reduced-motion/small/unrelated views neither load nor schedule animation', () => {
  for (const condition of ['hidden', 'reduced', 'offscreen', 'small', 'unrelated']) {
    const state = setup(), { api } = state; let gets = 0;
    const images = new Map([[api.enchanterImageKey('b:13:0', 'idle'), { complete: true, naturalWidth: 1536, naturalHeight: 768 }]]);
    const originalGet = images.get.bind(images); images.get = key => { gets++; return originalGet(key); };
    state.hidden(condition === 'hidden'); state.reduced(condition === 'reduced');
    const scene = { g: { drawImage() { throw Error('must remain static'); } }, images, scale: condition === 'small' ? .5 : 1, view: { minX: -100, maxX: 100, minY: -100, maxY: 100 } };
    api.beginEnchanterFrame();
    assert.equal(api.drawMapEnchanter(scene, condition === 'unrelated' ? 'b:other:0' : 'b:13:0', '31,61', condition === 'offscreen' ? 2000 : 0, 0, 47.6), false);
    assert.equal(gets, 0); assert.equal(api.enchanterFrameDelay(), null);
  }
});
test('every loaded scene stays in atlas bounds at one fixed destination and uses throttled redraw', () => {
  const state = setup(), { api } = state, images = new Map(); let calls = 0; const kinds = new Set(); let destination;
  for (const [kind, a] of Object.entries(manifest.atlases)) images.set(api.enchanterImageKey('b:13:0', kind), { kind, complete: true, naturalWidth: a.width, naturalHeight: a.height });
  const scene = { images, scale: 1, view: { minX: -100, maxX: 100, minY: -100, maxY: 100 }, g: { drawImage(image, sx, sy, sw, sh, ...to) {
    assert.ok(sx >= 0 && sy >= 0 && sx + sw <= image.naturalWidth && sy + sh <= image.naturalHeight);
    if (destination) assert.deepEqual(to, destination); else destination = to;
    kinds.add(image.kind); calls++;
  } } };
  for (let t = 1000; t < 451000; t += 100) {
    state.now(t); api.beginEnchanterFrame();
    assert.equal(api.drawMapEnchanter(scene, 'b:13:0', '31,61', 0, 0, 47.6), true);
    assert.ok(api.enchanterFrameDelay() >= 16 && api.enchanterFrameDelay() <= 100);
  }
  assert.equal(kinds.size, 7); assert.equal(calls, 4500);
});
test('missing rare sheets retain ambient rendering and are warmed only shortly before their event', () => {
  const state = setup(), { api } = state, idle = { complete: true, naturalWidth: 1536, naturalHeight: 768 };
  const images = new Map([[api.enchanterImageKey('b:13:0', 'idle'), idle]]); let drawn;
  const scene = { images, scale: 1, view: { minX: -100, maxX: 100, minY: -100, maxY: 100 }, g: { drawImage(image) { drawn = image; } } };
  for (const t of [1000, 11000, 33000, 40000]) {
    state.now(t); api.beginEnchanterFrame();
    assert.equal(api.drawMapEnchanter(scene, 'b:13:0', '31,61', 0, 0, 47.6), true); assert.equal(drawn, idle);
  }
  let warmed = false;
  for (let t = 0; t < 45000; t += 100) {
    const p = api.enchanterPose(t, '31,61');
    if (p.prefetch) { assert.equal(p.kind, 'idle'); assert.equal(p.prefetch, 'boot'); warmed = true; }
  }
  assert.ok(warmed);
});
function dimensions(data) {
  for (let p = 12; p + 12 < data.length;) {
    const size = data.readUInt32LE(p + 4);
    if (data.toString('ascii', p, p + 4) === 'VP8L') {
      assert.equal(data[p + 8], 0x2f); const bits = data.readUInt32LE(p + 9);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    p += 8 + size + (size & 1);
  }
  throw Error('Missing lossless WebP payload');
}
test('exact v2 atlases and their verified fixed foreground ship within the resource budget', () => {
  const crypto = require('node:crypto'), { api } = setup(); let bytes = 0, decoded = 0;
  assert.equal(api.ENCHANTER_ASSET_VERSION, 'v2');
  assert.deepEqual(Array.from(api.ENCHANTER_KINDS).sort(), Object.keys(manifest.atlases).sort());
  for (const [kind, a] of Object.entries(manifest.atlases)) {
    const data = fs.readFileSync(path.join(root, 'public/map-enchanter', a.file)); bytes += data.length; decoded += a.decodedBytes;
    assert.equal(data.toString('ascii', 0, 4), 'RIFF'); assert.equal(data.toString('ascii', 8, 12), 'WEBP');
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), a.sha256);
    assert.equal(a.file, `${kind}-v2.webp`); assert.deepEqual(dimensions(data), [1536, Math.ceil(a.frames / 8) * 192]);
    assert.deepEqual(a.fixedForegroundFailures, []);
  }
  assert.equal(bytes, manifest.totalBytes); assert.ok(bytes < 1500000);
  assert.equal(decoded, manifest.totalDecodedBytes); assert.ok(decoded < 18 * 1024 * 1024);
});
