const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const jsx = (type, props) => ({ type, props });

function load(file, react, imports, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name.endsWith('.webp') || name.endsWith('.css')) return name;
    if (name in imports) return imports[name];
    throw Error('Unexpected dependency: ' + name);
  }, ...globals }, { filename: file });
  return module.exports;
}

test('expiry hides stale weather without starting a second network request', () => {
  let now = 100000, refetches = 0, ticks = 0, callback, options;
  const data = { mapId: 'midgard', nextAt: now + 12000, temperatureC: 20, kind: 'clear' };
  const cleanups = [];
  const react = { memo: f => f, useState: () => [0, () => ticks++], useEffect: effect => cleanups.push(effect()) };
  class Clock extends Date { static now() { return now; } }
  const module = load('src/components/beta-raid/weather/RaidWeatherHud.tsx', react, {
    '@tanstack/react-query': { useQuery: input => { options = input; return { data, isError: false, refetch: () => refetches++ }; } },
    '@/lib/raid/weather': { weatherBandOf: () => ({ band: 'warm' }), weatherAnomalyOf: t => t <= -50 ? 'cold' : t >= 50 ? 'heat' : null },
    '@/server/api/beta-raid/weather/weather-get': { getRaidWeather: () => { throw Error('No API in test'); } },
    './visuals/AnomalyWeather': { AnomalyWeather: 'anomaly' }, './visuals/FrostHud': { FrostHud: 'frost' }, './visuals/WeatherLayer': { WeatherLayer: 'weather' },
    './RaidWeatherPanel': { RaidWeatherPanel: 'panel' },
  }, { Date: Clock, window: { setTimeout: fn => { callback = fn; return 7; }, clearTimeout: () => {} } });
  assert.notEqual(module.RaidWeatherHud({ mapId: 'midgard', ru: true, isAdmin: false }), null);
  assert.equal(options.refetchIntervalInBackground, false);
  assert.equal(options.refetchInterval({ state: { data } }), 12000);
  assert.equal(options.refetchInterval({ state: { data: { nextAt: now + 60000 } } }), 30000);
  const render = (enabled = true) => module.RaidWeatherHud({ mapId: 'midgard', ru: true, isAdmin: false, visualsEnabled: enabled }).props.children.filter(Boolean);
  data.temperatureC = 50;
  assert.equal(render().some(n => n.type === 'weather'), false);
  assert.equal(render().find(n => n.type === 'anomaly').props.mode, 'infernal');
  data.temperatureC = -50;
  assert.equal(render().find(n => n.type === 'anomaly').props.mode, 'frozen');
  assert.equal(render().some(n => n.type === 'weather'), true);
  assert.equal(render(false).some(n => n.type === 'anomaly'), false);
  data.temperatureC = 20;
  assert.equal(render().some(n => n.type === 'anomaly'), false);
  now = data.nextAt;
  callback();
  assert.equal(ticks, 1);
  assert.equal(refetches, 0);
  assert.equal(module.RaidWeatherHud({ mapId: 'midgard', ru: true, isAdmin: false }), null);
  cleanups.forEach(cleanup => cleanup?.());
});

test('Escape in sound or another panel leaves the weather drawer open', () => {
  const states = [], listeners = new Map();
  let stateIndex = 0;
  class Node {}
  const inside = new Node(), outside = new Node();
  const weatherRoot = { contains: node => node === inside };
  let refIndex = 0;
  const react = {
    useId: () => 'weather',
    useState: initial => { const index = stateIndex++; states[index] = initial; return [initial, value => states[index] = value]; },
    useRef: () => ({ current: refIndex++ === 0 ? weatherRoot : { focus() {} } }),
    useEffect: effect => effect(),
  };
  const module = load('src/components/beta-raid/weather/RaidWeatherPanel.tsx', react, { 'lucide-react': {} }, {
    Node, document: { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener() {} },
  });
  const result = module.RaidWeatherPanel({ ru: true, degrees: 20, kind: 'clear', coefs: { fish: 1, mine: 1, farm: 1, step: 1, ship: 1 }, effectsOn: true, isAdmin: false });
  result.type(result.props);
  listeners.get('keydown')({ key: 'Escape', target: outside });
  assert.equal(states[0], true);
  listeners.get('keydown')({ key: 'Escape', target: inside, defaultPrevented: true });
  assert.equal(states[0], true);
  listeners.get('keydown')({ key: 'Escape', target: inside });
  assert.equal(states[0], false);
});

test('HUD derivatives have bounded download and decoded-image budgets', () => {
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'raid-hud-assets.json'), 'utf8'));
  let bytes = 0, weatherBytes = 0, weatherRgba = 0;
  for (const asset of expected) {
    const raw = fs.readFileSync(path.join(root, asset.target));
    assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), asset.sha256);
    assert.equal(raw.toString('ascii', 12, 16), 'VP8L');
    const bits = raw.readUInt32LE(21), width = (bits & 16383) + 1, height = ((bits >>> 14) & 16383) + 1;
    assert.deepEqual([width, height], asset.dimensions);
    bytes += raw.length;
    if (asset.target.includes('/weather/')) { weatherBytes += raw.length; weatherRgba += width * height * 4; }
  }
  assert.ok(bytes < 150000, bytes);
  assert.ok(weatherBytes < 100000, weatherBytes);
  assert.ok(weatherRgba < 400000, weatherRgba);
});

test('optional hero and overview dialogs have no eager imports in raid modules', () => {
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { visit(file); continue; }
      if (!/\.tsx?$/.test(file)) continue;
      const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      for (const node of source.statements) {
        if (!ts.isImportDeclaration(node) || node.importClause?.isTypeOnly) continue;
        const target = node.moduleSpecifier.text;
        assert.ok(!/(?:HeroQuickModal|LiveStrategicMapDialog)$/.test(target), path.relative(root, file) + ' eagerly loads ' + target);
      }
    }
  };
  visit(path.join(root, 'src/components/beta-raid'));
});

test('anomaly music shares the visual classifier and creates only the selected audio channel', () => {
  const weather = load('src/lib/raid/weather.ts', {}, {});
  const source = fs.readFileSync(path.join(root, 'src/lib/audio/raidMusic.ts'), 'utf8');
  const assets = Object.fromEntries([...source.matchAll(/from "(@\/assets\/raid-music\/[^"]+)"/g)].map(m => {
    if (m[1].includes('/anomaly-')) assert.ok(fs.existsSync(path.join(root, 'src', m[1].slice(2))), m[1]);
    return [m[1], { default: m[1] }];
  }));
  let channelFactory;
  const created = [];
  const audio = load('src/lib/audio/raidMusic.ts', {}, {
    ...assets,
    '@/lib/raid/weather': weather,
    './castleMusicController': {
      CastleMusicController: class { constructor(factory) { channelFactory = factory; } },
      getExplorationMusicPreference: () => ({}),
    },
    './castleMusicChannel': {
      getExplorationAudioContext: () => ({}),
      createCastleMusicChannel: (_, url) => { created.push(url); return {}; },
    },
  });
  audio.getRaidMusic();
  assert.equal(created.length, 0, 'registering tracks must not fetch or decode them');
  for (const temp of [-60, -50, 50, 60]) {
    for (const kind of weather.WEATHER_KINDS) {
      const index = audio.raidMusicTrackFor(kind, temp);
      assert.equal(index, weather.weatherAnomalyOf(temp) === 'heat' ? 31 : 32);
    }
  }
  channelFactory(audio.raidMusicTrackFor('fire_rain', 50));
  channelFactory(audio.raidMusicTrackFor('blizzard', -50));
  assert.deepEqual(created, ['@/assets/raid-music/anomaly-heat.mp3', '@/assets/raid-music/anomaly-cold.mp3']);
  assert.equal(audio.raidMusicTrackFor('clear', 40), 25);
  assert.equal(audio.raidMusicTrackFor('clear', -40), 13);
  assert.equal(audio.raidMusicTrackFor('clear', 20), 1);
  for (const temp of [NaN, Infinity, -Infinity]) assert.equal(audio.raidMusicTrackFor('clear', temp), 0);
});

test('fire rain is bounded and pauses every animation while hidden',()=>{
 let callback,cleanup,removed=0;const element={dataset:{}};
 const document={hidden:false,addEventListener:(name,fn)=>{assert.equal(name,'visibilitychange');callback=fn},removeEventListener:(name,fn)=>{assert.equal(fn,callback);removed++}};
 const react={memo:f=>f,useRef:()=>({current:element}),useEffect:f=>{cleanup=f()}};
 const {FireRain}=load('src/components/beta-raid/weather/visuals/FireRain.tsx',react,{}, {document});
 const tree=FireRain();assert.equal(tree.props.children.length,12);
 assert.equal(element.dataset.paused,'false');document.hidden=true;callback();assert.equal(element.dataset.paused,'true');
 cleanup();assert.equal(removed,1);
 const css=fs.readFileSync(path.join(root,'src/components/beta-raid/weather/visuals/anomaly-weather.css'),'utf8');
 assert.match(css,/prefers-reduced-motion:reduce/);assert.doesNotMatch(css,/(?:backdrop-filter|filter)\s*:/);
 for(const name of ['fire-rain-ember.webp','fire-rain-spark.webp'])assert.ok(fs.statSync(path.join(root,'src/components/beta-raid/weather/visuals',name)).size<1024);
});
