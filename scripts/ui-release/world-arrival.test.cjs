const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/components/beta-raid/world-arrival/worldArrival.ts'), 'utf8');
const mod = { exports: {} };
new Function('exports', 'module', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod.exports, mod);
const { createWorldArrival, announceWorldArrival, subscribeWorldArrival } = mod.exports;
function harness(read) {
  let now = 0; let id = 0;
  const pending = new Map(); const visible = []; const removed = [];
  const arrival = createWorldArrival({
    read, now: () => now,
    show: name => { visible.push(name); return () => removed.push(name); },
    schedule: (fn, ms) => { pending.set(++id, { fn, ms }); return id; },
    cancel: id => pending.delete(id),
  });
  return { arrival, pending, visible, removed, time: value => { now = value; } };
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
test('actual destination ID is requested and the server name is shown for 1200ms', async () => {
  const calls = [];
  const h = harness(async mapId => { calls.push(mapId); return { mapId, worldName: 'Переименованный мир' }; });
  await h.arrival.arrive('random-exit-2');
  assert.deepEqual(calls, ['random-exit-2']);
  assert.deepEqual(h.visible, ['Переименованный мир']);
  const timer = [...h.pending.values()][0]; assert.equal(timer.ms, 1200);
  timer.fn(); assert.deepEqual(h.removed, h.visible);
});
test('ordinary loads and same-world results do not request or show a title', async () => {
  let reads = 0;
  const h = harness(async () => { reads++; return null; });
  assert.equal(h.pending.size, 0);
  await h.arrival.arrive(null); assert.equal(reads, 0); assert.deepEqual(h.visible, []);
});
test('null, blank, foreign-map and failed readings cannot invent a world', async () => {
  for (const data of [null, {mapId:'b', worldName:'Wrong'}, {mapId:'a',worldName:null}, {mapId:'a',worldName:'  '}]) {
    const h = harness(async () => data); await h.arrival.arrive('a'); assert.deepEqual(h.visible, []);
  }
  const h = harness(async () => { throw Error('offline'); });
  await h.arrival.arrive('a'); assert.deepEqual(h.visible, []);
});
test('a delayed old destination cannot overwrite the next arrival', async () => {
  const old = deferred();
  const h = harness(id => id === 'old' ? old.promise : Promise.resolve({mapId:id,worldName:'New'}));
  const first = h.arrival.arrive('old'); await h.arrival.arrive('new');
  old.resolve({mapId:'old',worldName:'Old'}); await first;
  assert.deepEqual(h.visible, ['New']);
});
test('unmount cancels pending name and clears an already visible title', async () => {
  const d = deferred(); const h = harness(() => d.promise);
  const request = h.arrival.arrive('a'); h.arrival.dispose();
  d.resolve({mapId:'a',worldName:'A'}); await request;
  assert.deepEqual(h.visible, []);
  const active = harness(async mapId => ({mapId,worldName:'A'}));
  await active.arrival.arrive('a'); active.arrival.dispose();
  assert.equal(active.pending.size, 0); assert.deepEqual(active.removed, ['A']);
});
test('late network results and a later same-world move suppress a stale caption', async () => {
  const d = deferred(); const h = harness(() => d.promise);
  const p = h.arrival.arrive('a'); h.time(5001); d.resolve({mapId:'a',worldName:'A'}); await p;
  assert.deepEqual(h.visible, []);
  const d2=deferred(); const h2=harness(() => d2.promise);
  const p2=h2.arrival.arrive('a'); await h2.arrival.arrive(null);
  d2.resolve({mapId:'a',worldName:'A'}); await p2; assert.deepEqual(h2.visible, []);
});
test('subscriptions do not replay prior travel and unsubscribe cleanly', () => {
  announceWorldArrival('past'); const seen = [];
  const off=subscribeWorldArrival(id => seen.push(id));
  assert.deepEqual(seen, []); announceWorldArrival('now'); off(); announceWorldArrival('later');
  assert.deepEqual(seen, ['now']);
});
test('title is connected to confirmed portal success and existing player weather API', () => {
  const read = file => fs.readFileSync(path.join(root, file),'utf8');
  const portal=read('src/components/beta-raid/PortalAction.tsx');
  assert.match(portal, /onSuccess: \(res\) => \{\s*announceWorldArrival\(!door/);
  const hook=read('src/components/beta-raid/world-arrival/useWorldArrival.ts');
  assert.match(hook, /getRaidWeather\(\{ data: \{ mapId \} \}\)/);
  assert.match(hook, /title.textContent = worldName/);
  assert.doesNotMatch(hook, /innerHTML|adminPortalPlaces|to\[0\]/);
  assert.match(read('src/components/beta-raid/BetaRaidScreen.tsx'), /useWorldArrival\(\)/);
});
