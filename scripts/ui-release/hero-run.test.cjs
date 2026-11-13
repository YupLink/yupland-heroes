const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");
const ts = require("typescript");
const root = process.cwd();
const heroes = ["knight", "bee", "yupik", "boar", "dragon", "dracat", "unicorn"];

function moduleAt(file, imports) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { document: { hidden: false, addEventListener() {}, removeEventListener() {} }, window: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) }, exports, require: id => imports(id), performance: { now: () => clock }, requestAnimationFrame: cb => { pending = cb; return 1; }, cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {}, Date, console });
  return exports;
}
let clock = 0, pending;
function renderer(atlas = { complete: true, naturalWidth: 1024, naturalHeight: 384 }, mount = "none", duration = 1000) {
  let cursor = 0;
  const refs = [], effects = [], frames = [];
  const react = {
    useRef(value) { const i = cursor++; return refs[i] ??= { current: value }; },
    useCallback(fn) { return fn; },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!effects[i] || deps.some((x, j) => x !== effects[i][j])) { effects[i] = deps; queued.push(fn); }
    },
  };
  let queued = [];
  const subscribe = () => () => {};
  const exports = moduleAt("src/components/beta-raid/useMapRenderer.ts", id => {
    if (id === "react") return react;
    if (id === "./waterRipples") return { WaterRipples: class { invalidate() {} clear() {} delay() { return null; } } };
    if (id === "./hexGeometry") return { R: 28, axialToPixel: (q, r) => ({ x: q * 30, y: r * 30 }) };
    if (id === "./drawFrame") return { drawFrame: (...args) => { frames.push({ position: { ...args[5] }, visual: { ...args[6] } }); return false; } };
    if (id === "./heroPace") return { heroStepMs: () => duration, heroRouteActive: () => false, subscribeHeroRoute: subscribe };
    if (id === "./heroMotionContinuity") return moduleAt("src/components/beta-raid/heroMotionContinuity.ts", () => ({}));
    if (id === "./frameStats") return { frameStats: { cells: 0 } };
    if (id === "./mapFrameHold") return { mapFramesHeld: () => false, subscribeMapHold: subscribe };
    if (id === "./tree-map/treePlacement") return { treePlacement: { subscribe } };
    return new Proxy({}, { get: (_, key) => {
      if (/Cache$|Layer$/.test(key)) return class { clear() {} setSnow() { return false; } setPuddles() { return false; } };
      if (key === "fishingIdleDelay") return () => null;
      if (key.startsWith("subscribe")) return subscribe;
      return () => false;
    } });
  });
  let input = { heroMount: mount, images: { current: new Map(atlas ? [["hero:gallop", atlas]] : []) }, playerPos: { q: 0, r: 0 }, centerQ: 0, c0q: 0, stepCamera: () => false };
  function render(next = {}) {
    input = { ...input, ...next }; cursor = 0; queued = [];
    exports.useMapRenderer(input); queued.forEach(fn => fn());
  }
  function tick(now) { clock = now; assert.ok(pending); const cb = pending; pending = null; cb(now); return frames.at(-1); }
  clock = 0; pending = null; render(); tick(0);
  return { render, tick, input, start(q = 1, r = 1) { clock = 0; render({ playerPos: { q, r } }); } };
}

test("new foot PNGs contain all eight complete poses and both idle views", () => {
  for (const hero of heroes) {
    const buf = fs.readFileSync(path.join(root, "public/hero-mounts", hero, "foot.png"));
    assert.equal(buf.subarray(1, 4).toString(), "PNG");
    assert.equal(buf.readUInt32BE(16), 1024);
    assert.equal(buf.readUInt32BE(20), 384);
    assert.equal(buf[25], 6, "RGBA required");
    // Decode PNG scanlines to ensure every motion cell really has visible pixels.
    let offset = 8, parts = [];
    while (offset < buf.length) { const len = buf.readUInt32BE(offset); if (buf.toString("ascii", offset + 4, offset + 8) === "IDAT") parts.push(buf.subarray(offset + 8, offset + 8 + len)); offset += len + 12; }
    const packed = zlib.inflateSync(Buffer.concat(parts)), stride = 4096, pixels = Buffer.alloc(stride * 384);
    for (let y = 0; y < 384; y++) {
      const filter = packed[y * (stride + 1)];
      for (let x = 0; x < stride; x++) {
        const raw = packed[y * (stride + 1) + x + 1], a = x >= 4 ? pixels[y * stride + x - 4] : 0, b = y ? pixels[(y - 1) * stride + x] : 0, c = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
        let predictor = 0;
        if (filter === 1) predictor = a;
        if (filter === 2) predictor = b;
        if (filter === 3) predictor = Math.floor((a + b) / 2);
        if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        pixels[y * stride + x] = (raw + predictor) & 255;
      }
    }
    for (let row = 0; row < 3; row++) for (let col = 0; col < (row === 2 ? 2 : 8); col++) {
      let visible = 0;
      for (let y = row * 128; y < row * 128 + 128; y++) for (let x = col * 128; x < col * 128 + 128; x++) visible += pixels[y * stride + x * 4 + 3] > 0;
      assert.ok(visible > 300, hero + " row " + row + " col " + col);
    }
  }
});

test("foot runs every pose in order, wraps, and stops on idle", () => {
  const r = renderer(); r.start();
  for (let i = 0; i < 16; i++) assert.equal(r.tick(i * 60).visual.phase, i % 8);
  assert.equal(r.tick(1000).visual.phase, null);
});

test("cell boundary does not reset the gait; four directions retain correct facing", () => {
  for (const [q, r, up, left] of [[1, 1, false, false], [-1, 1, false, true], [1, -1, true, false], [-1, -1, true, true]]) {
    const run = renderer(); run.start(q, r);
    const before = run.tick(180);
    assert.equal(before.visual.up, up); assert.equal(before.visual.left, left);
    clock = 180; run.render({ playerPos: { q: q * 2, r: r * 2 } });
    assert.equal(run.tick(240).visual.phase, 4);
  }
});

test("old/fallback foot atlases keep 50 ms cadence with linear travel", () => {
  for (const atlas of [{ complete: true, naturalWidth: 384, naturalHeight: 384 }, null, { complete: false, naturalWidth: 1024, naturalHeight: 384 }]) {
    const r = renderer(atlas); r.start();
    for (let i = 0; i < 9; i++) assert.equal(r.tick(i * 50).visual.phase, i % 3);
    const halfway = r.tick(500).position;
    assert.equal(halfway.x, 15); assert.equal(halfway.y, 15);
    assert.equal(r.tick(1000).visual.phase, null);
  }
});

test("switching loaded foot/mount images never sends a frame beyond the atlas", () => {
  const r = renderer(); r.start(); assert.equal(r.tick(420).visual.phase, 7);
  r.input.images.current.set("hero:gallop", { complete: true, naturalWidth: 384, naturalHeight: 384 });
  assert.equal(r.tick(430).visual.phase, 2);
  r.input.images.current.set("hero:gallop", { complete: true, naturalWidth: 1024, naturalHeight: 384 });
  assert.equal(r.tick(440).visual.phase, 7);
});

test("image loader versions only foot art; mounted URL and action assets remain", () => {
  const source = fs.readFileSync(path.join(root, "src/components/beta-raid/useImageCache.ts"), "utf8");
  assert.ok(source.includes("const footSrc = heroFootAtlas(animatedHero)"));
  const { heroFootAtlas } = moduleAt("src/lib/gameArt.ts", id => id === "./mineArt" ? { MINE_ART_PRELOAD: [] } : {});
  for (const hero of heroes) assert.equal(heroFootAtlas(hero), `/hero-mounts/${hero}/foot.webp?v=run8-20261030`);
  assert.equal(heroFootAtlas(null), "/hero-mounts/knight/foot.webp?v=run8-20261030");
  assert.ok(source.includes('visualVariant === "foot" ? footSrc'));
  assert.ok(source.includes('/hero-actions/'));
  assert.ok(source.includes('/hero-fishing-idle/'));
});

test("actual canvas renderer selects all 8 cells, both idle views and mirrors each left direction", () => {
  const source = fs.existsSync(path.join(root, "src/components/beta-raid/betaCanvasOverlay.ts"))
    ? "src/components/beta-raid/betaCanvasOverlay.ts"
    : "base/src/components/beta-raid/betaCanvasOverlay.ts";
  const overlay = moduleAt(source, id => {
    if (id === "./hexGeometry") return { R: 28, hexPath2D: () => ({}) };
    if (id === "./betaCanvasScene") return { COLOR: {} };
    if (id === "./heroActionVisual") return { getHeroAction: () => ({ action: null, fishingHold: false }), interruptFishingIdle() {} };
    return {};
  });
  for (const width of [360, 1280]) for (const up of [false, true]) for (const left of [false, true]) {
    for (const phase of [null, 0, 1, 2, 3, 4, 5, 6, 7]) {
      const draws = [], scales = [];
      const image = { complete: true, naturalWidth: 1024, naturalHeight: 384 };
      const g = new Proxy({}, { get: (_, key) => key === "drawImage" ? (...args) => draws.push(args) : key === "scale" ? (...args) => scales.push(args) : () => {} });
      overlay.drawMovesAndHero({ g, W: width, toPixel: () => ({ x: 0, y: 0 }), images: new Map([["hero:gallop", image]]), ships: new Map() }, [], { x: width / 2, y: 180 }, { up, left, phase });
      assert.equal(draws.length, 1);
      const [, sx, sy, sw, sh, dx, dy, dw, dh] = draws[0];
      assert.equal(sx, phase === null ? up ? 0 : 128 : phase * 128);
      assert.equal(sy, phase === null ? 256 : up ? 128 : 0);
      assert.equal(sw, 128); assert.equal(sh, 128);
      assert.ok(dx >= 0 && dx + dw <= width && dy >= 0 && dh > 0);
      assert.equal(scales.length, left ? 1 : 0);
      if (left) assert.deepEqual(scales[0], [-1, 1]);
    }
  }
});

test("every mount keeps 100 ms gait independent of travel duration", () => {
  for (const [mount, duration] of [["common",190],["rare",158],["epic",127],["legendary",109],["unique",109]]) {
    const r = renderer({ complete:true, naturalWidth:384, naturalHeight:384 }, mount, duration); r.start();
    assert.equal(r.tick(50).visual.phase, 0);
    assert.equal(r.tick(100).visual.phase, 1);
    const p = r.tick(duration/2).position;
    assert.equal(p.x,15); assert.equal(p.y,15);
    clock=duration; r.render({playerPos:{q:2,r:2}});
    assert.equal(r.tick(duration).position.x,30);
    assert.equal(r.tick(duration+10).visual.phase,Math.floor((duration+10)/100)%3);
  }
});

