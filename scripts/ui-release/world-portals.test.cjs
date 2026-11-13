const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../src/components/beta-raid/strategic-map/portalMapData.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};
new Function('exports','module',js)(mod.exports,mod);
const {portalPoints,markWorldPortals}=mod.exports;
const wire={mapId:'alpha',mode:'seen',portals:[{q:3,r:4,to:['Акания','Мир строителей'],alsoHere:true}]};
test('personal portal data keeps every destination and the same-world warning',()=>{
  assert.deepEqual(portalPoints(wire,'alpha','seen'),[{kind:'worldPortal',q:3,r:4,to:['Акания','Мир строителей'],alsoHere:true}]);
});
test('foreign-map and unknown-map responses never show',()=>{
  assert.deepEqual(portalPoints(wire,'water','seen'),[]);
  assert.deepEqual(portalPoints(wire,null,'seen'),[]);
});
test('all-mode results never enter the ordinary map',()=>{
  assert.deepEqual(portalPoints({...wire,mode:'all'},'alpha','seen'),[]);
  assert.deepEqual(portalPoints(wire,'alpha','all'),[]);
});
test('detailed map replaces matching portal only; keeps local portals and other objects',()=>{
  const p=portalPoints(wire,'alpha','seen');
  const points=[{kind:'portal',q:3,r:4},{kind:'portal',q:7,r:8},{kind:'mine',q:3,r:4}];
  assert.deepEqual(markWorldPortals(points,p),[p[0],points[1],points[2]]);
  assert.equal(points[0].kind,'portal');
});
test('missing or empty portal data never invents a marker or direction',()=>{
  assert.deepEqual(portalPoints(undefined,'alpha','seen'),[]);
  assert.deepEqual(portalPoints({...wire,portals:[]},'alpha','seen'),[]);
});

const hookSource=fs.readFileSync(path.resolve(__dirname,'../../src/components/beta-raid/strategic-map/useWorldPortals.ts'),'utf8');
function hookCase({mapId='alpha',hero='h1',account='a',seen=wire,allWire,failed=false}={}) {
  const calls=[];
  const hook={exports:{}};
  const api={getSession(){},getMyBackpack(){},getWorldPortals:async()=>seen};
  const query=o=>{
    calls.push(o);
    if(o.queryKey[0]==='session')return {data:{wallet:account}};
    if(o.queryKey[0]==='my-hero-backpack')return {data:{heroId:hero,stacks:[]}};
    return {data:o.queryKey.at(-1)==='all'?allWire:seen,isError:failed,isPending:false,refetch(){}};
  };
  new Function('exports','module','require',ts.transpileModule(hookSource,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(hook.exports,hook,p=>{
    if(p==='react')return {useMemo:f=>f()};
    if(p==='@tanstack/react-query')return {useQuery:query};
    if(p==='../useEnergyMult')return {useRaidMapId:()=>mapId};
    if(p==='./portalMapData')return {portalPoints};
    if(p.startsWith('@/server/'))return api;
    throw new Error(p);
  });
  return {render:hook.exports.useWorldPortals,calls};
}

test('ordinary map loads without a map item, never requests all, and scopes hero/account/world',()=>{
  const h=hookCase(); const data=h.render(false);
  assert.equal(data.personal.length,1);
  assert.deepEqual(h.calls.at(-2).queryKey,['world-map','view','portals','a','h1','alpha','seen']);
  assert.equal(h.calls.at(-2).enabled,true);
  assert.equal(h.calls.at(-1).enabled,false);
  assert.equal(hookCase({hero:'h2',account:'b',mapId:'water'}).render(false).personal.length,0);
});

test('all remains distinct, failures and unavailable identity hide portal markers',()=>{
  const allWire={...wire,mode:'all',portals:[{q:99,r:99,to:['Адский мир'],alsoHere:false}]};
  const result=hookCase({allWire}).render(true);
  assert.equal(result.personal[0].q,3);
  assert.equal(result.detailed[0].q,99);
  assert.deepEqual(hookCase({failed:true}).render(false).personal,[]);
  assert.equal(hookCase({failed:true}).render(false).detailedReady,false);
  assert.equal(hookCase({mapId:'water'}).render(false).detailedReady,false);
  assert.equal(result.detailedReady,true);
  assert.deepEqual(hookCase({account:null}).render(false).personal,[]);
});

test('late response from another map rejects rather than entering query cache',async()=>{
  const h=hookCase({mapId:'water'});h.render(false);
  await assert.rejects(h.calls.at(-2).queryFn,/Map changed/);
});

test('detailed map includes authorized entrances missing from its base markers',()=>{
  const p=portalPoints({...wire,portals:[...wire.portals,{q:20,r:21,to:['Мир Альфа'],alsoHere:false}]},'alpha','seen');
  const points=[{kind:'portal',q:7,r:8},{kind:'mine',q:3,r:4}];
  assert.deepEqual(markWorldPortals(points,p),[...points,...p]);
  assert.deepEqual(markWorldPortals([],p),p);
});
test('detailed portal merge deduplicates entrances without dropping other objects',()=>{
  const p=portalPoints(wire,'alpha','seen');
  const points=[{kind:'portal',q:3,r:4},{kind:'worldPortal',q:3,r:4,to:['old'],alsoHere:false},{kind:'mine',q:3,r:4}];
  assert.deepEqual(markWorldPortals(points,[...p,...p]),[p[0],points[2]]);
  assert.equal(points[1].to[0],'old');
});

const strategySource=fs.readFileSync(path.resolve(__dirname,'../../src/components/beta-raid/strategic-map/strategicData.ts'),'utf8');
const strategyModule={exports:{}};
new Function('exports','module',ts.transpileModule(strategySource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(strategyModule.exports,strategyModule);
const {personalStrategicPoints}=strategyModule.exports;

test('personal map isolates identical mine and field coordinates by world',()=>{
  const mines=[{mapId:'alpha',q:4,r:5},{mapId:'builders',q:4,r:5},{mapId:'alpha',q:9,r:10}];
  const fields=[{mapId:'alpha',q:11,r:12},{mapId:'builders',q:11,r:12}];
  assert.deepEqual(personalStrategicPoints('builders',[],mines,fields).map(({kind,q,r})=>({kind,q,r})),[
    {kind:'mine',q:4,r:5},{kind:'farm',q:11,r:12},
  ]);
});
test('lost mines and unknown-world harvest rows are never personal markers',()=>{
  assert.deepEqual(personalStrategicPoints('builders',[],[
    {mapId:'builders',q:4,r:5,lost:{id:'old',amount:7}},
    {q:6,r:7},
  ],[{q:8,r:9}]),[]);
});
test('unknown current world hides personal sources; occupied local warehouses survive',()=>{
  const warehouses=[{q:1,r:2,items:[{count:1}]},{q:2,r:3,items:[{count:0}]}];
  assert.deepEqual(personalStrategicPoints(null,warehouses,[{mapId:'alpha',q:4,r:5}],[]),[]);
  assert.deepEqual(personalStrategicPoints('alpha',warehouses,[],[]).map(p=>p.kind),['warehouse']);
});

const adapterSource=fs.readFileSync(path.resolve(__dirname,'../../src/components/beta-raid/strategic-map/LiveStrategicMapDialog.tsx'),'utf8');
function personalAdapter() {
  let mapId='alpha',identity='account:hero:alpha',cursor=0;
  const slots=[],effects=[];
  let harvest=()=>Promise.resolve({mines:[{mapId:'alpha',q:4,r:5},{mapId:'builders',q:8,r:9}],fields:[]});
  let home=()=>Promise.resolve({home:{q:10,r:11},away:false,island:false});
  const react={
    useMemo:f=>f(),
    useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useEffect:(fn,deps)=>{const i=cursor++;const prior=slots[i];if(!prior||deps.some((x,j)=>x!==prior.deps[j]))effects.push(()=>{prior?.cleanup?.();slots[i]={deps,cleanup:fn()};});},
  };
  const adapter={exports:{}};
  new Function('exports','module','require',ts.transpileModule(adapterSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(adapter.exports,adapter,p=>{
    if(p==='react')return react;
    if(p==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'};
    if(p.endsWith('/warehouse-mine'))return {myWarehouses:async()=>({list:[]})};
    if(p.endsWith('/harvest-summary'))return {getHarvestSummary:()=>harvest()};
    if(p.endsWith('/home-castle'))return {getHomeCastle:()=>home()};
    if(p==='./strategicData')return strategyModule.exports;
    if(p==='./StrategicMapDialog')return {StrategicMapDialog:'dialog'};
    if(p==='./useDetailedMap')return {useDetailedMap:()=>({access:false,points:[]})};
    if(p==='./useWorldPortals')return {useWorldPortals:()=>({identity,personal:[],detailed:[],detailedReady:false})};
    if(p==='./portalMapData')return {markWorldPortals};
    if(p==='../playerDots')return {usePlayerDots:()=>new Map()};
    if(p==='../mapFrameHold')return {holdMapFrames:()=>()=>{}};
    if(p==='../useEnergyMult')return {useRaidMapId:()=>mapId};
    throw new Error(p);
  });
  return {
    render(){cursor=0;return adapter.exports.LiveStrategicMapDialog({ru:true,map:{castleShown:true,castle:{q:10,r:11}}}).props.map.strategicPoints;},
    commit(){effects.splice(0).forEach(f=>f());},
    switchWorld(next){mapId=next;identity='account:hero:'+next;},
    switchAccount(){identity='other:hero:'+mapId;},
    setHarvest(fn){harvest=fn;},
    setHome(fn){home=fn;},
  };
}
const settlePersonal=()=>new Promise(resolve=>setImmediate(resolve));
test('world/account switches hide old markers before effects and reload personal data',async()=>{
  const h=personalAdapter();h.render();h.commit();await settlePersonal();
  assert.equal(h.render().some(p=>p.kind==='mine'&&p.q===4),true);
  h.switchWorld('builders');
  assert.deepEqual(h.render(),[]);
  h.setHome(async()=>({home:{q:10,r:11},away:true}));
  h.commit();await settlePersonal();
  assert.deepEqual(h.render().map(p=>[p.kind,p.q,p.r]),[['mine',8,9]]);
  h.switchAccount();
  assert.deepEqual(h.render(),[]);
});
test('late harvest from old world cannot overwrite the current map',async()=>{
  const h=personalAdapter();let resolveOld;
  h.setHarvest(()=>new Promise(resolve=>{resolveOld=resolve;}));
  h.render();h.commit();
  h.switchWorld('builders');h.setHarvest(async()=>({mines:[{mapId:'builders',q:8,r:9}],fields:[]}));
  h.setHome(async()=>({home:{q:10,r:11},island:true}));
  h.render();h.commit();await settlePersonal();
  resolveOld({mines:[{mapId:'alpha',q:4,r:5}],fields:[]});await settlePersonal();
  assert.deepEqual(h.render().map(p=>[p.kind,p.q,p.r]),[['mine',8,9]]);
});
