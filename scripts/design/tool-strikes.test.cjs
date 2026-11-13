const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {build}=require('esbuild');
(async()=>{
const root=process.cwd(), out=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'tool-strikes-'));process.on('exit',()=>fs.rmSync(out,{recursive:true,force:true}));
async function bundle(file,name,plugins=[]){const outfile=path.join(out,name+'.cjs');await build({entryPoints:[path.join(root,'src',file)],outfile,bundle:true,platform:'node',format:'cjs',plugins});return require(outfile)}
const timing=await bundle('components/beta-raid/heroActionTiming.ts','timing');
assert.deepEqual(timing.toolStrikeTimes(),[250,750,1250,1750,2250]);
for(const kind of ['wood','stone']){assert.equal(timing.heroActionDuration(kind),2500);let contacts=[];for(let t=1;t<2500;t++)if(timing.heroActionFrame(kind,t)===2&&timing.heroActionFrame(kind,t-1)!==2)contacts.push(t);assert.deepEqual(contacts,timing.toolStrikeTimes());}
for(const kind of ['fish','hand'])assert.equal(timing.heroActionDuration(kind),3000);
const {singleToolStrikeBuffer}=await bundle('lib/audio/toolStrikeBuffer.ts','buffer');
const original={sampleRate:1000,length:1950,numberOfChannels:2,getChannelData:()=>Float32Array.from({length:1950},(_,i)=>i)};
const context={createBuffer(ch,length,sampleRate){return {length,sampleRate,numberOfChannels:ch,data:[],copyToChannel(data,c){this.data[c]=data}}}};
for(const kind of ['axe','pick']){const b=singleToolStrikeBuffer(original,kind,context);assert.equal(b.length,300);assert.equal(b.data[0][0],kind==='axe'?50:0);assert.equal(b.data[1][299],0);assert.equal(original.getChannelData(0)[299],299)}
for(const kind of ['fist','cast'])assert.equal(singleToolStrikeBuffer(original,kind,context),original);
let now=0,id=0,timers=new Map(),cleanups=[];const realSet=setTimeout,realClear=clearTimeout,realDate=Date.now;
global.setTimeout=(fn,delay)=>{timers.set(++id,{at:now+delay,fn});return id};global.clearTimeout=id=>timers.delete(id);Date.now=()=>now;
function advance(to){while(true){const next=[...timers].filter(([,v])=>v.at<=to).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn()}now=to}
const events=[];let current;
const hook=await bundle('components/beta-raid/useChopStrike.ts','strike',[{name:'hook-harness',setup(build){
 build.onResolve({filter:/^react$/},()=>({path:'react',namespace:'mock'}));
 build.onResolve({filter:/^@\/hooks\/useRaidActionAudio$/},()=>({path:'audio',namespace:'mock'}));
 build.onResolve({filter:/^@\/lib\/audio\/raidActionPlayer$/},()=>({path:path.join(root,'src/lib/audio/raidActionPlayer.ts')}));
 build.onResolve({filter:/heroActionVisual$/},()=>({path:'visual',namespace:'mock'}));
 build.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='react'?`export const useCallback=f=>f;export const useRef=x=>({current:x});export const useEffect=f=>globalThis.testEffects.push(f());`:a.path==='audio'?`export const useRaidCueAudio=()=>globalThis.testCue;`:`export const startHeroAction=(...args)=>globalThis.testStart(...args);`}));
}}]);
global.testEffects=cleanups;global.testCue=sound=>events.push({at:now,sound});global.testStart=(kind,target,onVisible,onCancel)=>{current={kind,onVisible,onCancel}};
try{
 for(const [tool,kind] of [['Топор','axe'],['Кирка','pick']]){now=0;timers.clear();events.length=0;const strike=hook.useChopStrike();assert.equal(strike(tool,false,{q:0,r:0,decorId:'x'}),true);advance(200);assert.equal(events.filter(x=>x.sound).length,0,'must wait for visible PNG');current.onVisible();advance(2700);assert.deepEqual(events.filter(x=>x.sound).map(x=>x.at),[450,950,1450,1950,2450]);assert.equal(events.filter(x=>x.sound).every(x=>x.sound===kind),true);assert.equal(events.at(-1).sound,null);const before=events.length;advance(5000);assert.equal(events.length,before);}
 now=0;timers.clear();events.length=0;hook.useChopStrike()('Топор',false,{q:0,r:0,decorId:'x'});current.onVisible();advance(800);current.onCancel();advance(3000);assert.equal(events.filter(x=>x.sound).length,2,'cancel prevents remaining hits');
 const visual=await bundle('components/beta-raid/heroActionVisual.ts','visual');for(const kind of ['wood','stone','hand','fish']){timers.clear();now=0;visual.startHeroAction(kind);advance(400);assert.equal(visual.getHeroAction().action.startedAt,null);visual.beginHeroAction();advance(400+timing.heroActionDuration(kind)-1);assert(visual.heroActionActive());advance(400+timing.heroActionDuration(kind));assert.equal(visual.heroActionActive(),false)}
}finally{global.setTimeout=realSet;global.clearTimeout=realClear;Date.now=realDate}
console.log('PASS: five 500ms cycles, contact frames/audio timestamps, one-hit extraction, wait-for-visible, cancellation, exact expiry, hands/fishing regression');

})().catch(e=>{console.error(e);process.exitCode=1});
