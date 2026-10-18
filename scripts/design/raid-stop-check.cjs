const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),ts=require(root+'/node_modules/typescript');
function load(file,imports,globals={}) {const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(root+'/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:id=>{if(!(id in imports))throw Error(id);return imports[id]},...globals});return exports;}
const lifetime=load('src/components/beta-raid/routeLifetime.ts',{});
function harness() {
 let calls=0,resolveStep,rejectStep,cleanup,setup;
 const effects=[],noop=()=>{};
 const imports={
 './routeLifetime':lifetime,'react':{useRef:v=>({current:v}),useState:v=>[v,noop],useEffect:fn=>{setup=fn;cleanup=fn();}},
 '@tanstack/react-query':{useQueryClient:()=>({invalidateQueries:noop})},'sonner':{toast:{error:noop}},
 './gateToll':{announceToll:noop},'./approaches':{},'./pathTolls':{},'./routeSearch':{},
 '@/server/api/beta-raid':{moveBetaRaid:()=>{calls++;return new Promise((a,b)=>{resolveStep=a;rejectStep=b;})}},
 './usePathfinding':{DIRS:[]},'./hexStepCost':{isWaterCell:()=>false},'@/lib/hooks/useEnergy':{ENERGY_KEY:[]},
 '@/lib/i18n':{useT:()=>x=>x},'@/lib/serverErrorText':{serverErrorText:()=>''},'./applyFled':{applyFled:noop},
 './fleeFlash':{emitFlee:noop},'./fleeReveal':{revealFled:noop},
 './stepCache':{STATE_KEY:[],makeStepCache:()=>({snapshot:()=>({}),applyStep:noop,applyServerEnergy:()=>effects.push('server'),rollback:()=>effects.push('rollback')})},
 './patchShipsCache':{SHIPS_KEY:[]},'./routeFleet':{makeRoutePilot:()=>({step:()=>({deltas:[],snapshot:{}}),rollback:noop})},
 };
 const mod=load('src/components/beta-raid/useBetaMovement.ts',imports,{setTimeout:fn=>{fn();return 1},clearTimeout:noop});
 const hook=mod.useBetaMovement({playerPos:{q:0,r:0},cells:{},energy:100});
 return {hook,effects,get calls(){return calls},resolve:()=>resolveStep({remainingEnergy:99}),reject:()=>rejectStep(Error('test')),unmount:()=>cleanup(),remount:()=>{cleanup=setup()}};
}
(async()=>{
 const step={q:1,r:0,cost:1};
 for(const last of [false,true])for(const mode of ['stop','leave']) {
  const h=harness(),p=h.hook.moveAlongPath(last?[step]:[step,step]);
  assert.equal(h.calls,1);mode==='stop'?h.hook.stopWalk():h.unmount();h.resolve();
  assert.equal(await p,false);assert.equal(h.calls,1);assert(h.effects.includes('server'));
 }
 let h=harness(),p=h.hook.moveAlongPath([step]);assert.equal(await h.hook.moveAlongPath([step]),false);h.resolve();assert.equal(await p,true);assert.equal(h.calls,1);
 h=harness();p=h.hook.moveAlongPath([step]);h.reject();assert.equal(await p,false);assert(h.effects.includes('rollback'));
 h=harness();p=h.hook.moveAlongPath([step]);h.unmount();h.remount();h.resolve();assert.equal(await p,false);
 p=h.hook.moveAlongPath([step]);h.resolve();assert.equal(await p,true);
 for(const kind of ['build','object'])for(const leave of [false,true]) {
  let cleanup,resolve,moves=0,actions=0;
  const noop=()=>{};
  const mod=load('src/components/beta-raid/useApproachDone.ts',{
   react:{useRef:v=>({current:v}),useEffect:fn=>{cleanup=fn()}},'./routeLifetime':lifetime,
   sonner:{toast:noop},'@tanstack/react-query':{useQueryClient:()=>({getQueryData:()=>undefined})},
   '@/lib/i18n':{useT:()=>x=>x},'./patchMapCache':{},
  });
  const run=mod.useApproachDone({cells:{'1,0':{objectId:'obj'}},objects:{obj:{id:'obj',kind:'loot'}},pendingPath:[step],pendingAction:{kind,q:1,r:0},moveAlongPath:()=>{moves++;return new Promise(r=>{resolve=r})},openBuilding:()=>actions++,interact:()=>actions++});
  const done=run();await run();assert.equal(moves,1);if(leave)cleanup();resolve(true);await done;assert.equal(actions,leave?0:1);
 }
 console.log('PASS actual arrival hook: no terminal action after leaving, no duplicate confirmation; normal arrival opens/interacts');
 console.log('PASS actual movement hook: Stop/unmount mid-route and final step, in-flight result, duplicate click, server rejection, StrictMode cleanup/setup');
})().catch(e=>{console.error(e);process.exitCode=1});
