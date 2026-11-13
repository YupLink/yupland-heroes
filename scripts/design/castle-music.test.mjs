import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function load(name) {
  const file = new URL(`../../src/lib/audio/${name}.ts`, import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  let code = outputText;
  if (name === 'castleMusicChannel') {
    const controller = ts.transpileModule(readFileSync(new URL('../../src/lib/audio/castleMusicController.ts', import.meta.url), 'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
    code = code.replace('"./castleMusicController"', JSON.stringify(`data:text/javascript;base64,${Buffer.from(controller).toString('base64')}`));
  }
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const { CastleMusicController, MusicPreference, getExplorationMusicPreference, purchaseMusicFocus, SCENE_FADE_OUT_SECONDS } = await load('castleMusicController');
const { createCastleMusicChannel, getExplorationAudioOutput, getExplorationMediaOutput } = await load('castleMusicChannel');
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function fixture(storage, options) {
  const channels = [];
  const player = new CastleMusicController(track => {
    const channel = { track, pauses: [], disposals: [], volumes: [], fades: [], plays: 0, unlock() {}, setVolume(v) { this.volumes.push(v); },
      play(fadeSeconds) { this.fades.push(fadeSeconds); this.plays++; return Promise.resolve(); },
      pause(s) { this.pauses.push(s); }, dispose(s) { this.disposals.push(s); } };
    channels.push(channel); return channel;
  }, storage, options);
  return { player, channels };
}
test('1 → 2 → 1 on scene entries; effect replay and rerender retain the first visit', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { player, channels } = fixture();
  const leave = player.enter(); leave();
  const replayLeave = player.enter();
  t.mock.timers.tick(1); await flush();
  assert.deepEqual(channels.map(c => c.track), [0]);
  assert.equal(player.getSnapshot().playing, true);
  replayLeave(); t.mock.timers.tick(1);
  assert.deepEqual(channels[0].disposals, [1.4]);
  const leave2 = player.enter(); await flush(); leave2(); t.mock.timers.tick(1);
  player.enter();
  assert.deepEqual(channels.map(c => c.track), [0, 1, 0]);
});
test('mute and background resume retain track and position; muted visits do not load audio', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { player, channels } = fixture();
  const leave = player.enter(); await flush();
  player.setHidden(true); player.setHidden(false); await flush();
  player.toggle(); assert.equal(player.getSnapshot().muted, true);
  player.resume(true); assert.equal(channels.length, 1);
  leave(); t.mock.timers.tick(1); player.enter();
  assert.equal(player.getSnapshot().track, 1);
  assert.equal(channels.length, 1);
  player.toggle(); await flush();
  assert.deepEqual(channels.map(c => c.track), [0, 1]);
});
test('persist the next visit and mute preference; blocked storage is harmless', async () => {
  const entries = new Map();
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  const a = fixture(storage); a.player.enter(); await flush(); a.player.toggle();
  const b = fixture(storage); b.player.enter();
  assert.equal(b.player.getSnapshot().track, 1);
  assert.equal(b.player.getSnapshot().muted, true);
  assert.equal(b.channels.length, 0);
  const c = fixture({ getItem() { throw Error(); }, setItem() { throw Error(); } });
  assert.doesNotThrow(() => c.player.enter());
});
test('late play completion after leaving cannot claim the next scene', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = deferred();
  const { player, channels } = fixture();
  const leave = player.enter(); await flush();
  player.setHidden(true); channels[0].play = () => pending.promise; player.setHidden(false);
  leave(); t.mock.timers.tick(1);
  pending.resolve(); await flush();
  assert.equal(player.getSnapshot().playing, false);
  player.enter(); await flush();
  assert.equal(player.getSnapshot().track, 1);
  assert.equal(player.getSnapshot().playing, true);
});
test('a real gesture retries pending autoplay; obsolete rejection does not undo success', async () => {
  const first = deferred(); let calls = 0;
  const player = new CastleMusicController(() => ({ unlock() {}, pause() {}, dispose() {},
    play() { return ++calls === 1 ? first.promise : Promise.resolve(); } }));
  player.enter(); player.resume(true); await flush();
  assert.equal(calls, 2); assert.equal(player.getSnapshot().playing, true);
  first.reject(Error('autoplay denied')); await flush();
  assert.equal(player.getSnapshot().playing, true);
  assert.equal(player.getSnapshot().blocked, false);
});
test('sound button mutes effects even when music autoplay failed, then permits retry', async () => {
  let calls = 0;
  const player = new CastleMusicController(() => ({ unlock() {}, pause() {}, dispose() {},
    play() { return ++calls === 1 ? Promise.reject(Error('NotAllowed')) : Promise.resolve(); } }));
  player.enter(); await flush(); assert.equal(player.getSnapshot().blocked, true);
  player.toggle(); await flush();
  assert.equal(player.getSnapshot().muted, true);
  player.toggle(); await flush();
  assert.equal(player.getSnapshot().playing, true); assert.equal(player.getSnapshot().muted, false);
});
function browserAudio(t) {
  const ramps = [], nodes = [];
  class Audio {
    paused = true; removed = false; pauses = 0; loaded = 0;
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; this.pauses++; }
    removeAttribute(name) { assert.equal(name, 'src'); this.removed = true; }
    load() { this.loaded++; }
  }
  t.mock.method(globalThis, 'Audio', function () { return new Audio(); });
  const audio = [];
  const node = () => { const n = { disconnected: false, connect(next) { return next; }, disconnect() { this.disconnected = true; } }; nodes.push(n); return n; };
  const context = { currentTime: 0, state: 'running', destination: {}, resume: () => Promise.resolve(),
    createMediaElementSource(el) { audio.push(el); return node(); },
    createGain() { return Object.assign(node(), { gain: { value: 0,
      setTargetAtTime(value, at, tau) { ramps.push(["target",value,at,tau]); },
      cancelScheduledValues(at) { ramps.push(['cancel', at]); },
      setValueAtTime(value, at) { ramps.push(['set', value, at]); },
      linearRampToValueAtTime(value, at) { ramps.push(['ramp', value, at]); } } }); } };
  return { context, audio, ramps, nodes };
}
// Node has no native Audio; this descriptor is restored after the test file exits.
globalThis.Audio = function () {};
test('streaming channel fades in/out, handles an interrupted fade, and releases its resources', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = browserAudio(t); const channel = createCastleMusicChannel(f.context, '/castle-01.mp3');
  assert.equal(f.audio[0].preload, 'none'); assert.equal(f.audio[0].loop, true);
  await channel.play(); assert.deepEqual(f.ramps.at(-1), ['ramp', .48, 1.6]);
  f.context.currentTime = .8; channel.dispose(1.4);
  assert.deepEqual(f.ramps.at(-2), ['set', .24, .8]);
  assert.deepEqual(f.ramps.at(-1), ['ramp', 0, 2.2]);
  assert.equal(f.audio[0].paused, false);
  t.mock.timers.tick(1400);
  assert.equal(f.audio[0].paused, true); assert.equal(f.audio[0].removed, true);
  // Channel-owned source and gain are released; shared effects, media, and transition gains persist.
  assert.ok(f.nodes.slice(0, 2).every(n => n.disconnected));
  assert.equal(f.nodes.filter(n => !n.disconnected).length, 3);
});
test('unmute during fade cancels the obsolete pause timer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = browserAudio(t); const channel = createCastleMusicChannel(f.context, '/castle-01.mp3');
  await channel.play(); channel.pause(.35); await channel.play(); t.mock.timers.tick(500);
  assert.equal(f.audio[0].paused, false);
  channel.pause(0); assert.equal(f.audio[0].paused, true);
});


test('raid repeats the selected track without changing the castle playlist', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const values = new Map([['yupland.castle-music.next', '1'], ['yupland.castle-music.muted', '1']]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const played = [];
  const raid = new CastleMusicController(track => {
    played.push(track);
    return { unlock() {}, play: () => Promise.resolve(), pause() {}, dispose() {} };
  }, storage, { storagePrefix: 'yupland.raid-music', trackCount: 1 });
  const leave = raid.enter(); await flush();
  assert.equal(raid.getSnapshot().muted, false);
  leave(); t.mock.timers.tick(1); raid.enter(); await flush();
  assert.deepEqual(played, [0, 0]);
  raid.toggle();
  assert.equal(values.get('yupland.raid-music.muted'), '1');
  assert.equal(values.get('yupland.castle-music.next'), '1');
  assert.equal(values.get('yupland.castle-music.muted'), '1');
});

test('scene transition starts the new stream and fades out the outgoing one', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const castle = fixture(); const raid = fixture();
  const leaveCastle = castle.player.enter(); await flush();
  leaveCastle(); const leaveRaid = raid.player.enter();
  t.mock.timers.tick(1); await flush();
  assert.deepEqual(castle.channels[0].disposals, [1.4]);
  assert.equal(castle.player.getSnapshot().playing, false);
  assert.equal(raid.player.getSnapshot().playing, true);
  leaveRaid(); castle.player.enter(); t.mock.timers.tick(1); await flush();
  assert.deepEqual(raid.channels[0].disposals, [1.4]);
  assert.equal(castle.player.getSnapshot().track, 1);
  assert.equal(castle.player.getSnapshot().playing, true);
});

test('one switch follows castle → raid → castle, including inactive mounted scenes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const preference = new MusicPreference(storage);
  const castle = fixture(storage, { preference });
  const raid = fixture(storage, { preference, storagePrefix: 'yupland.raid-music', trackCount: 1 });
  let leaveCastle = castle.player.enter(); await flush();
  castle.player.toggle(); // User mutes in castle.
  assert.equal(raid.player.getSnapshot().muted, true);
  leaveCastle(); t.mock.timers.tick(1);
  const leaveRaid = raid.player.enter(); await flush();
  assert.equal(raid.channels.length, 0);
  raid.player.toggle(); await flush(); // User enables in raid.
  assert.equal(raid.player.getSnapshot().playing, true);
  assert.equal(castle.player.getSnapshot().muted, false);
  assert.equal(castle.player.getSnapshot().playing, false);
  leaveRaid(); t.mock.timers.tick(1);
  leaveCastle = castle.player.enter(); await flush();
  assert.equal(castle.player.getSnapshot().playing, true);
  assert.equal(castle.player.getSnapshot().track, 1);
  castle.player.toggle(); leaveCastle(); t.mock.timers.tick(1);
  raid.player.enter(); await flush();
  assert.equal(raid.player.getSnapshot().playing, false);
  assert.equal(raid.channels.length, 1);
  assert.equal(values.get('yupland.exploration-music.muted'), '1');
});

test('shared preference migrates the active scene once and survives reload over stale scene settings', async () => {
  const values = new Map([['yupland.castle-music.muted', '1'], ['yupland.raid-music.muted', '0']]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const preference = new MusicPreference(storage);
  const castle = fixture(storage, { preference }); // Hidden castle mounts first.
  const raid = fixture(storage, { preference, storagePrefix: 'yupland.raid-music', trackCount: 1 });
  raid.player.enter(); await flush();
  assert.equal(raid.player.getSnapshot().playing, true);
  raid.player.toggle();
  const afterReload = fixture(storage, { preference: new MusicPreference(storage) });
  afterReload.player.enter(); await flush();
  assert.equal(afterReload.channels.length, 0);
  afterReload.player.toggle(); await flush();
  const anotherReload = fixture(storage, { preference: new MusicPreference(storage) });
  anotherReload.player.enter(); await flush();
  assert.equal(anotherReload.player.getSnapshot().playing, true);
  assert.equal(castle.player.getSnapshot().playing, false);
});

test('shared mute still synchronizes when storage is blocked', async () => {
  const storage = { getItem() { throw Error(); }, setItem() { throw Error(); } };
  const preference = new MusicPreference(storage);
  const castle = fixture(storage, { preference }); const raid = fixture(storage, { preference });
  castle.player.enter(); await flush(); castle.player.toggle();
  raid.player.enter(); await flush();
  assert.equal(raid.channels.length, 0);
  raid.player.toggle(); await flush();
  assert.equal(castle.player.getSnapshot().playing, true);
  assert.equal(raid.player.getSnapshot().playing, true);
});

test('volume follows castle, raid and battle, persists, and zero avoids loading a new stream', async () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) };
  const preference = new MusicPreference(storage);
  const castle = fixture(storage,{preference}); const raid = fixture(storage,{preference});
  castle.player.enter(); await flush(); castle.player.setVolume(.37);
  raid.player.enter(); await flush();
  assert.equal(raid.player.getSnapshot().volume,.37);
  assert.equal(raid.channels[0].volumes.at(-1),.37);
  assert.equal(new MusicPreference(storage).getVolume(),.37);
  raid.player.setVolume(0);
  const battle = fixture(storage,{preference}); battle.player.enter(); await flush();
  assert.equal(battle.channels.length,0);
  battle.player.toggle(); await flush();
  assert.equal(castle.player.getSnapshot().volume,.6);
  assert.equal(battle.player.getSnapshot().playing,true);
  battle.player.toggle(); assert.equal(raid.player.getSnapshot().muted,true);
});

test('boss suspension retains the raid stream and prevents gestures or visibility from restarting it', async () => {
  const preference = new MusicPreference();
  const raid = fixture(undefined,{preference}); const battle = fixture(undefined,{preference});
  raid.player.enter(); await flush();
  raid.player.setSuspended(true); battle.player.enter(); await flush();
  raid.player.resume(true); raid.player.setHidden(true); raid.player.setHidden(false);
  battle.player.setVolume(.24); await flush();
  assert.equal(raid.channels[0].plays,1);
  assert.equal(raid.player.getSnapshot().playing,false);
  assert.equal(battle.player.getSnapshot().playing,true);
  raid.player.setSuspended(false); await flush();
  assert.equal(raid.channels.length,1);
  assert.equal(raid.channels[0].plays,2);
  assert.equal(raid.player.getSnapshot().volume,.24);
});

test('volume ramp is independent of the scene fade and stale playback cannot revive a paused stream', async t => {
  const f = browserAudio(t); const pending = deferred();
  const channel = createCastleMusicChannel(f.context,'/battle.mp3');
  f.audio[0].play = () => pending.promise.then(() => { f.audio[0].paused = false; });
  const starting = channel.play(); channel.pause(0); pending.resolve(); await starting;
  assert.equal(f.audio[0].paused,true);
  getExplorationMusicPreference().setVolume(.32);
  assert.deepEqual(f.ramps.at(-1),['set',Math.sqrt(.32),.04]);
  assert.equal(f.audio[0].volume, Math.sqrt(.32));
  f.audio[0].play = () => { f.audio[0].paused = false; return Promise.resolve(); };
  await channel.play();
  assert.deepEqual(f.ramps.at(-1),['ramp',.48,1.6]);
});



test('purchase focus spans nested windows and React effect replay, then restarts the same selected scene track', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const scene = fixture(); const leave = scene.player.enter(); await flush();
  const track = scene.channels[0];
  const close1 = purchaseMusicFocus.acquire();
  assert.equal(scene.player.getSnapshot().playing, false);
  const close2 = purchaseMusicFocus.acquire(); close1(); t.mock.timers.tick(150);
  assert.equal(purchaseMusicFocus.getSnapshot(), true);
  scene.player.setSuspended(false); scene.player.resume(true); await flush();
  assert.equal(scene.player.getSnapshot().playing, false);
  close2(); t.mock.timers.tick(80);
  const close3 = purchaseMusicFocus.acquire(); t.mock.timers.tick(150);
  assert.equal(purchaseMusicFocus.getSnapshot(), true);
  close3(); close3(); t.mock.timers.tick(121); await flush();
  assert.equal(purchaseMusicFocus.getSnapshot(), false);
  assert.equal(scene.channels.length, 2);
  assert.notEqual(scene.channels[1], track);
  assert.equal(scene.channels[1].track, track.track);
  assert.equal(track.disposals.at(-1), SCENE_FADE_OUT_SECONDS);
  assert.equal(scene.player.getSnapshot().playing, true);
  leave(); t.mock.timers.tick(1);
});
test('shared mute and volume control purchase while underlying scene is paused', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pref = new MusicPreference();
  const scene = fixture(undefined, {preference:pref});
  const shop = fixture(undefined, {preference:pref, purchase:true, trackCount:1});
  const leave = scene.player.enter(); await flush();
  const close = purchaseMusicFocus.acquire(); const leaveShop = shop.player.enter(); await flush();
  assert.equal(shop.player.getSnapshot().playing, true);
  scene.player.toggle(); await flush();
  assert.equal(pref.getSnapshot(), true);
  assert.equal(shop.player.getSnapshot().playing, false);
  scene.player.setVolume(.3); await flush();
  assert.equal(shop.player.getSnapshot().volume, .3);
  assert.equal(shop.player.getSnapshot().playing, true);
  assert.equal(scene.player.getSnapshot().playing, false);
  scene.player.setHidden(true); shop.player.setHidden(true); await flush();
  assert.equal(shop.player.getSnapshot().playing, false);
  leaveShop(); close(); t.mock.timers.tick(121); await flush();
  assert.equal(scene.player.getSnapshot().playing, false);
  scene.player.setHidden(false); await flush();
  assert.equal(scene.player.getSnapshot().playing, true);
  leave(); t.mock.timers.tick(1);
});
test('opening purchase first preserves legacy mute rather than enabling music', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = new Map([['yupland.castle-music.muted','1']]);
  const storage = {getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
  const pref = new MusicPreference(storage);
  const shop = fixture(storage,{preference:pref,purchase:true,trackCount:1,storagePrefix:'yupland.purchase-music'});
  const close = purchaseMusicFocus.acquire(); const leave = shop.player.enter(); await flush();
  assert.equal(shop.channels.length,0); assert.equal(pref.getSnapshot(),true);
  leave(); close(); t.mock.timers.tick(121);
});


test('purchase uses the same simultaneous fade envelope as castle and raid in both directions', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const scene = fixture(); const shop = fixture(undefined, {purchase:true,trackCount:1});
  const leaveScene = scene.player.enter(); await flush();
  const close = purchaseMusicFocus.acquire(); const leaveShop = shop.player.enter(); await flush();
  assert.equal(scene.channels[0].pauses.at(-1), SCENE_FADE_OUT_SECONDS);
  assert.equal(shop.channels[0].plays, 1, 'incoming starts without a handoff delay');
  assert.equal(shop.channels[0].fades.at(-1), scene.channels[0].fades[0], 'same default fade-in');
  leaveShop(); close(); t.mock.timers.tick(121); await flush();
  assert.equal(shop.channels[0].disposals.at(-1), SCENE_FADE_OUT_SECONDS);
  assert.equal(scene.channels.length, 2);
  assert.equal(scene.channels[1].plays, 1, 'return starts at the intro without extra delay');
  assert.equal(scene.channels[1].track, scene.channels[0].track, 'return keeps the selected castle melody');
  leaveScene(); t.mock.timers.tick(1);
  assert.equal(scene.channels[1].disposals.at(-1), shop.channels[0].disposals.at(-1));
});
test('closing a purchase immediately cannot later restart its music', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const shop = fixture(undefined, {purchase:true,trackCount:1});
  const close = purchaseMusicFocus.acquire(); const leave = shop.player.enter(); await flush();
  leave(); close(); t.mock.timers.tick(121); await flush();
  const plays = shop.channels[0].plays;
  shop.player.resume(true); t.mock.timers.tick(5000); await flush();
  assert.equal(shop.channels[0].plays, plays);
  assert.equal(shop.player.getSnapshot().playing, false);
});

test('purchase return keeps mute and restarts raid intro only when enabled', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pref = new MusicPreference();
  const raid = fixture(undefined, {preference:pref,trackCount:1});
  const leave = raid.player.enter(); await flush();
  const close = purchaseMusicFocus.acquire();
  pref.setMuted(true); close(); t.mock.timers.tick(121); await flush();
  assert.equal(raid.channels.length,1, 'muted return does not start another stream');
  assert.equal(raid.player.getSnapshot().playing,false);
  pref.setMuted(false); await flush();
  assert.equal(raid.channels.length,2);
  assert.equal(raid.channels[1].track,0);
  assert.equal(raid.channels[1].plays,1);
  leave(); t.mock.timers.tick(1);
});


test('master output remains controllable after channel disposal and reaches zero on mute', async t => {
  const f=browserAudio(t), pref=getExplorationMusicPreference();
  pref.setVolume(.8);
  const channel=createCastleMusicChannel(f.context,'/raid.mp3');
  const output=getExplorationAudioOutput(f.context);
  assert.equal(output.gain.value,.8);
  await channel.play(); channel.dispose(1.4);
  pref.setVolume(.2); assert.deepEqual(f.ramps.at(-1),['set',Math.sqrt(.2),.04]);
  assert.equal(f.audio[0].volume, Math.sqrt(.2));
  pref.setMuted(true); assert.deepEqual(f.ramps.at(-1),['set',0,.04]);
  assert.equal(getExplorationAudioOutput(f.context),output);
  assert.equal(getExplorationMediaOutput(f.context).gain.value,Math.sqrt(.8));
  pref.setVolume(0); assert.deepEqual(f.ramps.at(-1),['set',0,.04]);
});
test('streaming media keeps two volume paths in sync and releases its preference listener', async t => {
  const f=browserAudio(t), pref=getExplorationMusicPreference();
  pref.setMuted(false); pref.setVolume(1);
  const channel=createCastleMusicChannel(f.context,'/weather.mp3');
  const media=getExplorationMediaOutput(f.context);
  assert.equal(f.audio[0].volume,1);
  assert.equal(media.gain.value,1);
  pref.setVolume(.25);
  assert.equal(f.audio[0].volume,.5);
  assert.deepEqual(f.ramps.at(-1),['set',.5,.04]);
  channel.dispose(0);
  pref.setVolume(.64);
  assert.equal(f.audio[0].volume,.5, 'disposed channel no longer follows the preference');
});
test('pending music cannot prevent the shared switch from muting', async () => {
  const pref=new MusicPreference(), pending=deferred();
  const f=fixture(undefined,{preference:pref});
  f.player.enter(); await flush();
  f.player.setHidden(true); f.channels[0].play=()=>pending.promise; f.player.setHidden(false);
  f.player.toggle(); assert.equal(pref.getSnapshot(),true);
  pending.resolve(); await flush(); assert.equal(f.player.getSnapshot().playing,false);
});

