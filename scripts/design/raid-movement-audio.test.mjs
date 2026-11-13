import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/lib/audio/raidMovementController.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022}});
const { RaidMovementController } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const flush = async () => { for(let i=0;i<6;i++) await Promise.resolve(); };
function fixture() {
  let resolve, reject, loads = 0;
  const promise = new Promise((a,b) => { resolve=a;reject=b; });
  const voice = { playing:false, starts:0, volume:0, disposed:false,
    start() { if(!this.playing) this.starts++; this.playing=true; },
    stop() { this.playing=false; }, setVolume(v) { this.volume=v; }, setSceneActive(v) { this.active=v; },
    dispose() { this.disposed=true;this.playing=false; } };
  const player = new RaidMovementController(() => {loads++;return promise;});
  return { player, voice, resolve:()=>resolve(voice), reject, loads:()=>loads };
}
test('muted/zero/inactive scenes do not load; visual motion alone never overrides them', async () => {
  const f=fixture();f.player.setMoving(true);
  f.player.configure(true,true,1);f.player.configure(true,false,0);f.player.configure(false,false,1);
  assert.equal(f.loads(),0);
  f.player.configure(true,false,.28);assert.equal(f.loads(),1);
  f.resolve();await flush();assert.equal(f.voice.playing,true);assert.equal(f.voice.volume,1);
});
test('decoded sound follows visible steps and stops immediately in network pauses', async () => {
  const f=fixture();f.player.configure(true,false,1);f.resolve();await flush();
  assert.equal(f.voice.playing,false);
  for(let i=0;i<120;i++)f.player.setMoving(true);
  assert.equal(f.voice.starts,1);assert.equal(f.loads(),1);
  f.player.setMoving(false);assert.equal(f.voice.playing,false);
  f.player.setMoving(true);assert.equal(f.voice.starts,2);
});
test('late decoding after a completed step never starts a ghost gallop', async () => {
  const f=fixture();f.player.configure(true,false,1);f.player.setMoving(true);f.player.setMoving(false);
  f.resolve();await flush();assert.equal(f.voice.playing,false);assert.equal(f.voice.starts,0);
});
test('mute, zero volume, scene exit and return preserve the master preference', async () => {
  const f=fixture();f.player.configure(true,false,.28);f.resolve();await flush();f.player.setMoving(true);
  f.player.configure(true,true,.28);assert.equal(f.voice.playing,false);
  f.player.configure(true,false,.14);assert.equal(f.voice.playing,true);assert.equal(f.voice.volume,1);
  f.player.configure(true,false,0);assert.equal(f.voice.playing,false);
  f.player.configure(false,false,.14);assert.equal(f.voice.playing,false);
  f.player.setMoving(false);f.player.configure(true,false,.14);assert.equal(f.voice.playing,false);
});
test('unmount releases a loaded voice and a pending voice without playing', async () => {
  for(const loaded of [false,true]) {
    const f=fixture();f.player.configure(true,false,1);f.player.setMoving(true);
    if(loaded){f.resolve();await flush();}
    f.player.dispose();if(!loaded){f.resolve();await flush();}
    assert.equal(f.voice.disposed,true);assert.equal(f.voice.playing,false);
    f.player.configure(true,false,1);f.player.setMoving(true);assert.equal(f.voice.playing,false);
  }
});
test('failed asset load remains silent and does not retry on every frame', async () => {
  const f=fixture();f.player.configure(true,false,1);f.reject(Error('offline'));await flush();
  for(let i=0;i<120;i++)f.player.setMoving(i%2===0);
  assert.equal(f.loads(),1);assert.equal(f.voice.playing,false);
});

test('suspending map frames during movement cannot leave the hoof loop playing', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  const f=fixture();f.player.configure(true,false,1);f.resolve();await flush();
  f.player.setMoving(true);t.mock.timers.tick(70);f.player.setMoving(true);
  t.mock.timers.tick(70);assert.equal(f.voice.playing,true);
  t.mock.timers.tick(31);assert.equal(f.voice.playing,false);
});

test('the real renderer reports hero interpolation, not camera motion or stationary redraws', () => {
  const file = new URL('../../src/components/beta-raid/useMapRenderer.ts', import.meta.url);
  const code = ts.transpileModule(readFileSync(file,'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}})
    .outputText.replace(/^import .*;\n/gm,'').replace('export function useMapRenderer','function useMapRenderer');
  const effects=[], frames=[], motion=[];let time=0, camera=false;
  class Cache { clear(){} }
  const deps={useCallback:f=>f,useRef:value=>({current:value}),useEffect:f=>effects.push(f),
    HexTileCache:Cache,RoadRibbonCache:Cache,ChunkLayer:Cache,SpriteCache:Cache,
    R:48,axialToPixel:(q,r)=>({x:q*80,y:r*80}),placeBadge(){},flashAlive:()=>false,
    drawFrame:()=>false,frameStats:{cells:0},probeFrame(){},performance:{now:()=>time},
    mapFramesHeld:()=>false,subscribeMapHold(){},noteMapFrame(){},noteMapMount(){},placeMineBuildUi(){},
    subscribePlayerDots(){},subscribeIslandGoal(){},subscribeMineBars(){},subscribeMineBuild(){},subscribeMineBlasts(){},
    requestAnimationFrame:f=>{frames.push(f);return frames.length;},cancelAnimationFrame(){}};
  const useRenderer = new Function(...Object.keys(deps),code+';return useMapRenderer;')(...Object.values(deps));
  const input={playerPos:{q:0,r:0},centerQ:0,c0q:0,stepCamera:()=>camera,onHeroMotion:v=>motion.push(v)};
  const renderer=useRenderer(input);
  const cleanups=effects.map(f=>f());
  const draw=at=>{time=at;const f=frames.shift();assert.ok(f);f(at);};
  draw(0);draw(16);assert.ok(motion.every(v=>v===false));
  time=100;input.playerPos={q:1,r:0};effects[1]();draw(116);assert.equal(motion.at(-1),true);
  draw(301);assert.equal(motion.at(-1),false);
  camera=true;renderer.requestRedraw();draw(320);assert.equal(motion.at(-1),false);
  camera=false;draw(340);
  // An identical coordinate can be redrawn without a footstep.
  time=400;effects[1]();draw(416);assert.equal(motion.at(-1),false);
  cleanups[0]();assert.equal(motion.at(-1),false);
});

