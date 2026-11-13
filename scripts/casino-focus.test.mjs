import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const url = s => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const compile = p => ts.transpileModule(readFileSync(new URL('../src/' + p, import.meta.url), 'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const controllerURL = url(compile('lib/audio/castleMusicController.ts'));
const {CastleMusicController, MusicPreference, casinoMusicFocus, purchaseMusicFocus} = await import(controllerURL);
const {getExplorationAudioOutput} = await import(url(compile('lib/audio/castleMusicChannel.ts').replaceAll('"./castleMusicController"', JSON.stringify(controllerURL))));
const flush = async () => { for(let i=0;i<6;i++) await Promise.resolve(); };
function fixture(options={}) {
 const channels=[];
 const player=new CastleMusicController(() => {
  const c={plays:0, pauses:[], disposed:0, unlock(){},setVolume(){},play(){this.plays++;return Promise.resolve()},pause(s){this.pauses.push(s)},dispose(){this.disposed++}};
  channels.push(c); return c;
 },undefined,{trackCount:1,...options});
 return {player,channels};
}
test('casino interrupts world; gestures/visibility/volume do not restart it; exit restores same channel',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const pref=new MusicPreference();const {player,channels}=fixture({preference:pref});
 const leave=player.enter();await flush();
 const close=casinoMusicFocus.acquire();
 assert.equal(player.getSnapshot().playing,false);assert.equal(channels[0].pauses.at(-1),0);
 player.resume(true);player.setHidden(false);pref.setVolume(.3);await flush();
 assert.equal(channels[0].plays,1);
 close();t.mock.timers.tick(1);await flush();
 assert.equal(channels[0].plays,2);assert.equal(channels.length,1);assert.equal(player.getSnapshot().volume,.3);
 leave();t.mock.timers.tick(1);
});
test('nested owners and effect replay never release focus early; cleanup is idempotent',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const a=casinoMusicFocus.acquire(), b=casinoMusicFocus.acquire();a();a();t.mock.timers.tick(1);
 assert.equal(casinoMusicFocus.getSnapshot(),true);b();
 const replay=casinoMusicFocus.acquire();t.mock.timers.tick(1);assert.equal(casinoMusicFocus.getSnapshot(),true);
 replay();t.mock.timers.tick(1);assert.equal(casinoMusicFocus.getSnapshot(),false);
});
test('scene mounted inside casino stays silent and a closed scene cannot resume',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const close=casinoMusicFocus.acquire();const {player,channels}=fixture();const leave=player.enter();await flush();
 assert.equal(channels.length,0);leave();t.mock.timers.tick(1);close();t.mock.timers.tick(1);await flush();assert.equal(channels.length,0);
});
for(const mode of ['mute','zero','hidden','battle']){
 test('casino return respects '+mode,async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {player,channels}=fixture();const leave=player.enter();await flush();const close=casinoMusicFocus.acquire();
  if(mode==='mute')player.toggle();if(mode==='zero')player.setVolume(0);if(mode==='hidden')player.setHidden(true);if(mode==='battle')player.setSuspended(true);
  close();t.mock.timers.tick(1);await flush();assert.equal(channels[0].plays,1);leave();t.mock.timers.tick(1);
 });
}
test('purchase changes during casino never revive world or purchase audio',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const world=fixture(),shop=fixture({purchase:true});const leave=world.player.enter();await flush();
 const close=casinoMusicFocus.acquire();const done=purchaseMusicFocus.acquire();const leaveShop=shop.player.enter();await flush();
 assert.equal(shop.channels.length,0);done();t.mock.timers.tick(121);await flush();assert.equal(world.channels.length,1);
 close();t.mock.timers.tick(1);await flush();assert.equal(world.channels.length,2);assert.equal(shop.channels.length,0);
 leave();leaveShop();t.mock.timers.tick(1);
});
test('output mutes already fading tails and effects, then restores gain without changing preference',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const values=[];
 const gain={value:0,cancelScheduledValues(){},setTargetAtTime(v){values.push(v)},setValueAtTime(v){values.push(v)}};
 const context={currentTime:0,destination:{},createGain(){return {gain,connect(){return this}}}};
 const output=getExplorationAudioOutput(context);assert.equal(output.gain.value,1);
 const close=casinoMusicFocus.acquire();assert.equal(values.at(-1),0);
 close();t.mock.timers.tick(1);assert.equal(values.at(-1),1);
});
