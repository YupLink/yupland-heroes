import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/components/slot/music/musicPlayer.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
  .replace(/import .* from .*;\n/g, '');
const stubs = `const SOUND_URLS={}; class ReelSounds {setSpin(){} land(){} preload(){} setActive(){} dispose(){}} class DigSounds {preload(){} setActive(){} dispose(){}};`;
const {SlotMusicPlayer} = await import('data:text/javascript;base64,'+Buffer.from(stubs+compiled).toString('base64'));
const flush = async () => { for(let i=0;i<24;i++) await Promise.resolve(); };
function context() {
  const gains=[], voices=[];
  return {currentTime:0,state:'running',destination:{},gains,voices,closed:0,suspended:0,
    createGain(){const g={gain:{value:1,events:[],cancelScheduledValues(){},setValueAtTime(v,t){this.value=v;this.events.push([v,t]);},linearRampToValueAtTime(v,t){this.events.push([v,t]);}},connect(){return this;},disconnect(){}};gains.push(g);return g;},
    createBufferSource(){const v={stopped:0,connect(){},disconnect(){},start(){},stop(){this.stopped++;this.onended?.();}};voices.push(v);return v;},
    resume(){return Promise.resolve();}, suspend(){this.suspended++;return Promise.resolve();},close(){this.closed++;return Promise.resolve();},decodeAudioData(){return Promise.resolve({duration:10});}};
}
test('prepared casino stays silent during splash, then restarts its intro on reveal',async t=>{
  t.mock.method(globalThis,'fetch',async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}));
  const ctx=context();globalThis.window={AudioContext:function(){}};
  const player=new SlotMusicPlayer(()=>{},ctx);
  player.setTransitionVisible(false,0);player.activate();await flush();
  assert.equal(ctx.gains[1].gain.value,0);assert.equal(ctx.voices.length,1);
  player.setTransitionVisible(true);await flush();
  assert.equal(ctx.voices[0].stopped,1);assert.equal(ctx.voices.length,2);
  assert.deepEqual(ctx.gains[1].gain.events.at(-1),[1,.75]);
  player.dispose();assert.equal(ctx.voices[1].stopped,1);assert.equal(ctx.closed,0);
});
test('casino mute/disposal never suspends or closes the shared world context',async t=>{
  t.mock.method(globalThis,'fetch',async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}));
  const ctx=context();globalThis.window={AudioContext:function(){}};
  const player=new SlotMusicPlayer(()=>{},ctx);player.activate();await flush();
  player.setEnabled(false);await flush();assert.equal(ctx.suspended,0);
  player.dispose();assert.equal(ctx.closed,0);assert.equal(ctx.voices[0].stopped,1);
});
test('leaving envelope reaches exact silence after 700ms',async t=>{
  t.mock.method(globalThis,'fetch',async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}));
  const ctx=context();globalThis.window={AudioContext:function(){}};
  const player=new SlotMusicPlayer(()=>{},ctx);player.activate();await flush();
  player.setTransitionVisible(false,.7);
  assert.deepEqual(ctx.gains[1].gain.events.at(-1),[0,.7]);player.dispose();
});
