const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function setup() {
  const state = {muted:false,volume:0.4};
  const sources=[]; const listeners=[]; const master={};
  const context={resume:async()=>{},decodeAudioData:async()=>({}),destination:{},
    createGain:()=>({gain:{value:0},connect(target){this.destination=target;return target;},disconnect(){}}),
    createBufferSource:()=>{const s={start(){s.started=true;},stop(){s.stopped=true;},connect(g){s.gain=g;},disconnect(){}};sources.push(s);return s;}};
  return {exports:{},state,sources,listeners,context,master};
}

function ready() {
  const x=setup();
  // Use immediate fetch for the executable module to test cached buffers and transitions.
  const code=ts.transpileModule(fs.readFileSync('src/lib/audio/buildingWindowAudio.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let time=0;
  vm.runInNewContext(code,{exports:x.exports,performance:{now:()=>time},document:{hidden:false,addEventListener(){}},window:{addEventListener(){}},fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}),require:p=>p.includes('castleMusicChannel')?{getExplorationAudioContext:()=>x.context,getExplorationAudioOutput:()=>x.master}:p.includes('castleMusic')?{getCastleMusic:()=>({getSnapshot:()=>x.state,subscribe:f=>x.listeners.push(f)})}:{default:p}});
  x.setClock=n=>time=n; return x;
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('approved cues follow shared volume; mute stops active cue',async()=>{
  const x=ready();await x.exports.warmBuildingAudio();x.exports.playBuildingAudio(true);await flush();
  assert.equal(x.sources.length,1);assert.equal(x.sources[0].started,true);assert.ok(Math.abs(x.sources[0].gain.gain.value-3.2)<1e-9);
  x.state.muted=true;x.listeners.forEach(f=>f());assert.equal(x.sources[0].stopped,true);
  x.exports.playBuildingAudio(false);await flush();assert.equal(x.sources.length,1);
});
test('rapid open-close cancels stale open and plays only latest event',async()=>{
  const x=ready();await x.exports.warmBuildingAudio();x.exports.playBuildingAudio(true);x.exports.playBuildingAudio(false);await flush();assert.equal(x.sources.length,1);assert.equal(x.sources[0].gain.gain.value,8);
});
test('late loading never produces delayed cue',async()=>{
  const x=ready();x.exports.playBuildingAudio(true);x.setClock(300);await flush();assert.equal(x.sources.length,0);
});


test('window cues route through master once and keep their approved local mix',async()=>{
 const x=ready();await x.exports.warmBuildingAudio();x.exports.playBuildingAudio(true);await flush();
 assert.equal(x.sources[0].gain.destination,x.master);
 x.state.volume=.1;x.listeners.forEach(f=>f());
 assert.equal(x.sources[0].gain.gain.value,3.2,'master applies user volume, local cue must not square it');
 x.state.volume=0;x.listeners.forEach(f=>f());assert.equal(x.sources[0].stopped,true);
});
test('all three movement surfaces route through the shared output',async()=>{
 const code=ts.transpileModule(fs.readFileSync('src/lib/audio/raidMovementVoice.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const master={},nodes=[],exports={};
 const context={currentTime:0,state:'running',destination:{},decodeAudioData:async()=>({duration:1}),createGain(){const n={gain:{value:0,setTargetAtTime(v){this.value=v;},cancelScheduledValues(){},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}},connect(target){this.destination=target;return target;},disconnect(){}};nodes.push(n);return n;}};
 vm.runInNewContext(code,{exports,fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}),require:p=>p.includes('castleMusicChannel')?{getExplorationAudioContext:()=>context,getExplorationAudioOutput:()=>master}:{default:p}});
 for(const surface of ['earth','stone','water']){const start=nodes.length;const voice=await exports.createRaidMovementVoice(surface);voice.setVolume(1);assert.equal(nodes[start].destination,nodes[start+1]);assert.equal(nodes[start+1].destination,master);assert.equal(nodes[start].gain.value,surface==='earth'?1.6:1);voice.dispose();}
});


test('resident voices share master volume and observer failures cannot block volume delivery',()=>{
const errors=[];
const load=(p,scope={})=>{const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,setTimeout,clearTimeout,console:{error:(...e)=>errors.push(e)},...scope});return exports;};
const {MusicPreference,CastleMusicController}=load('src/lib/audio/castleMusicController.ts');
const pref=new MusicPreference();let output=1;
pref.subscribe(()=>{throw Error('optional observer');});pref.subscribe(()=>{output=pref.getSnapshot()?0:pref.getVolume();});
for(const v of [.1,.5,1,0]){pref.setVolume(v);assert.equal(output,v);}
pref.setMuted(true);assert.equal(output,0);
const shared=new MusicPreference();const player=new CastleMusicController(()=>({unlock(){},play:async()=>{},pause(){},dispose(){}}),undefined,{preference:shared});
player.subscribe(()=>{throw Error('scene observer');});let after=1;shared.subscribe(()=>{after=shared.getVolume();});shared.setVolume(.1);assert.equal(after,.1);assert.equal(player.getSnapshot().volume,.1);
const master={},connections=[],players=[],handlers={};let now=1000;
const preference=new MusicPreference();const ctx={resume:async()=>{},createMediaElementSource(player){const source={player,connect(node){connections.push(node);},disconnect(){this.disconnected=true;}};return source;}};
const {residentReaction}=load('src/components/castle-live/residentReaction.ts',{require:p=>p.includes('castleMusicChannel')?{getExplorationAudioContext:()=>ctx,getExplorationAudioOutput:()=>master}:p.includes('castleMusicController')?{getExplorationMusicPreference:()=>preference}:{default:'clip.mp3'},Audio:class{constructor(){players.push(this);this.dataset={};}load(){}play(){this.played=true;return Promise.resolve();}pause(){this.played=false;}removeAttribute(){}remove(){}},performance:{now:()=>now},document:{hidden:false,addEventListener(){},removeEventListener(){}},window:{addEventListener(){},removeEventListener(){}},matchMedia:()=>({matches:true})});
const root={contains:()=>true,addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener(){}};const resident={getAttribute:()=>1,querySelector:()=>null,closest(){return this;}};
const fire=()=>{now+=1000;handlers.keydown({key:'Enter',repeat:false,target:resident,preventDefault(){},stopPropagation(){}});};
const reactions=residentReaction(root);
preference.setVolume(.1);fire();assert.ok(players.some(p=>p.played));assert.ok(connections.length>0&&connections.every(c=>c===master));
preference.setVolume(0);assert.ok(players.every(p=>!p.played));fire();assert.ok(players.every(p=>!p.played));
preference.setVolume(1);fire();assert.ok(players.some(p=>p.played));preference.setMuted(true);assert.ok(players.every(p=>!p.played));
reactions.dispose();
assert.ok(errors.length>=6);


});

