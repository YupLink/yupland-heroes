const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

function loader(mocks = {}) {
  const cache = new Map();
  return function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: file,
    }).outputText;
    const local = (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.')) {
        const target = id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : path.resolve(path.dirname(file), id);
        return load(fs.existsSync(target) && fs.statSync(target).isFile() ? target : target + '.ts');
      }
      return require(id);
    };
    new Function('require', 'module', 'exports', '__filename', '__dirname', code)(local, module, module.exports, file, path.dirname(file));
    return module.exports;
  };
}
const p = 'src/lib/raid/island/';
const load = loader();
const short = load(p + 'shortTutorial.ts');
const steps = load(p + 'steps.ts');
const {placeSpotlightTip,reserveSpotlightFooter}=load('src/components/beta-raid/island/spotlightPlacement.ts');
const place = { spawn:{q:0,r:0}, chest:{q:1,r:0}, workshop:{q:2,r:0}, trees:[{q:2,r:1}], monsters:[{q:3,r:1}], crystals:[], mine:{q:4,r:0}, mines:[], treasure:{q:5,r:0}, digs:[], shipyard:{q:7,r:0}, gift:true, portal:{q:6,r:0}, hall:{q:0,r:1}, artifact:null, pack:null };
const lesson = { version:1, shore:{q:6,r:0}, water:Array.from({length:19}, (_,q)=>({q,r:0})) };

function viewHarness({done=[],record=async()=>({recorded:true})}={}) {
  const names=['document','window','IntersectionObserver','MutationObserver','getComputedStyle'];
  const previous=names.map(name=>[name,Object.getOwnPropertyDescriptor(global,name)]);
  const elements=[],observed=new Set(),calls=[];let intersection,mutation,retry,resume,stopped=false;
  global.document={body:{},visibilityState:'visible',querySelectorAll:sel=>elements.filter(el=>el.kind===(sel.startsWith('[data-island-hero-view]')?'hero':'chest_backpack')),
    addEventListener:(name,fn)=>{if(name==='visibilitychange')resume=fn;},removeEventListener:()=>{}};
  global.window={setInterval:fn=>{retry=fn;return 1;},clearInterval:()=>{stopped=true;}};
  global.getComputedStyle=el=>({visibility:el.hidden?'hidden':'visible'});
  global.IntersectionObserver=class{constructor(fn){intersection=fn;}observe(el){observed.add(el);}unobserve(el){observed.delete(el);}disconnect(){observed.clear();}};
  global.MutationObserver=class{constructor(fn){mutation=fn;}observe(){}disconnect(){}};
  const {watchIslandViews}=loader()('src/components/beta-raid/island/islandViewProgress.ts');
  const stop=watchIslandViews('isle_test',new Set(done),async(step,mapId)=>{calls.push([step,mapId]);return record(step,mapId);});
  return {calls,observed,
    add(kind,attrs={}){const el={kind,isConnected:true,hidden:false,inert:false,closest(){return this.inert?this:null;},...attrs};elements.push(el);mutation?.();return el;},
    show(el,ratio=1){intersection?.([{target:el,isIntersecting:ratio>0,intersectionRatio:ratio}]);},
    tick(){retry?.();},resume(){resume?.();},sync(){mutation?.();},
    close(){stop();for(const [name,d]of previous){if(d)Object.defineProperty(global,name,d);else delete global[name];}},
    get stopped(){return stopped;},
  };
}
const settled=()=>new Promise(resolve=>setImmediate(resolve));

const pillarPlan = {buildingId:'actual-pillar',buildingSkinId:'actual-skin',tier:2,
  spellbook:{learnPrices:[{resource:'gold',amount:7},{resource:'likes',amount:23}],forgetPrices:[],spells:['basic']}};

test('islet has no foot entrance, but its shore is reachable by a ship; pillar requires landing',()=>{
  const {generateIsland}=load(p+'generate.ts');
  const {testSpec,TEST_CATALOG,WATER,OCEAN}=load('src/test/worldSpec.ts');
  const {DIRS,hexDist,keyOf}=load('src/lib/raid/zonegen/town/hex.ts');
  const {reachFrom}=load(p+'carve.ts');
  for(const seed of [11,222,3333,44444,101,138,175,212,249,286,323,360]) {
    const spec=testSpec(7),island=generateIsland(spec,TEST_CATALOG,seed,{gift:true,short:true,pillar:pillarPlan});
    const {places,cells}=island,lesson=places.lesson,by=new Map(cells.map(c=>[keyOf(c),c]));
    assert.equal(lesson.water.length,30);assert.equal(lesson.islet.length,7);
    const wet=new Set(cells.filter(c=>[WATER,OCEAN].includes(c.terrainId)).map(keyOf));
    const foot=reachFrom({cells,water:wet,walk:new Set(spec.walk),start:places.spawn});
    assert.ok(!lesson.islet.some(c=>foot.has(keyOf(c))),`no land bridge, seed ${seed}`);
    for(const target of [places.chest,places.workshop,places.trees[0],places.monsters[0],places.shipyard])
      assert.ok([...foot].some(k=>{const[q,r]=k.split(',').map(Number);return hexDist({q,r},target)<=1;}),`mainland targets remain reachable, seed ${seed}`);
    const pending=lesson.water.filter(c=>hexDist(c,places.shipyard)===1),sailed=new Set();
    assert.ok(pending.length>0,'shipyard has launch water');
    while(pending.length){const c=pending.pop(),k=keyOf(c);if(sailed.has(k))continue;sailed.add(k);for(const[dq,dr]of DIRS){const n={q:c.q+dq,r:c.r+dr};if(wet.has(keyOf(n))&&!sailed.has(keyOf(n)))pending.push(n);}}
    assert.ok(lesson.water.some(c=>sailed.has(keyOf(c))&&hexDist(c,lesson.shore)===1),'ship reaches landing');
    assert.ok(lesson.water.every(c=>hexDist(c,lesson.pillar)>1),'cannot learn while afloat');
    const land=reachFrom({cells,water:wet,walk:new Set(spec.walk),start:lesson.shore});
    assert.ok(land.has(keyOf(lesson.pillar)),'disembarked hero can approach pillar');
    const building=by.get(keyOf(lesson.pillar));assert.equal(building.buildingId,pillarPlan.buildingId);
    assert.equal(building.buildingSkinId,pillarPlan.buildingSkinId);assert.equal(building.tier,pillarPlan.tier);
    assert.deepEqual(building.buildingConfig,{effect:'spellbook',spellbook:pillarPlan.spellbook});
    assert.deepEqual(steps.stepTarget('spell',places),lesson.pillar);
    assert.deepEqual(steps.parsePlaces(JSON.parse(JSON.stringify(places))).lesson,lesson);
    assert.ok([...places.trees,...places.monsters,places.chest,places.workshop].every(c=>!lesson.islet.some(x=>keyOf(x)===keyOf(c))));
  }
});

test('starter chest funds the copied price in addition to boat; replay gives no second budget',()=>{
  const f=loader({'@/lib/shipRules':{SHIPYARD_TIER_SMALL:1}})(p+'features.ts');
  const funded=f.chestReward(true,true,pillarPlan),base=f.chestReward(true,true),replay=f.chestReward(false,true,pillarPlan);
  const total=(kit,r)=>kit.fillers.filter(x=>x.resource===r||x.kind===r).reduce((n,x)=>n+x.amount,0);
  for(const price of pillarPlan.spellbook.learnPrices)assert.equal(total(funded,price.resource)-total(base,price.resource),price.amount);
  assert.equal(total(replay,'gold'),0);assert.equal(total(replay,'likes'),0);
  const {canFundPillar}=load(p+'shortSpell.ts');
  assert.equal(canFundPillar([]),false);
  for(const resource of ['token','tickets','item'])assert.equal(canFundPillar([{resource,amount:10}]),false);
  for(const amount of [0,-1,NaN,Infinity])assert.equal(canFundPillar([{resource:'gold',amount}]),false);
});

function planHarness({rows,spells}={}) {
  const row={building_id:'actual-pillar',building_skin_id:'actual-skin',config:{spellbook:pillarPlan.spellbook},meta:{},name:'Pillar'};
  let query;
  const planner=loader({
    '@/server/db/mcpClient':{mcpExec:async sql=>{query=sql;return rows??[row];}},
    '@/server/api/raid-shared':{sqlStr:s=>"'"+s+"'"},'../encounter-where':{activeBetaMapId:async()=>'world-active'},
    '@/lib/buildingEffect':{cellBuildingEffect:()=> 'spellbook'},
    '../spell-pillar':{spellPillarConfig:(config)=>config.spellbook},
    '../spell-tpl':{loadSpellTemplates:async()=>spells??[{id:'basic',minInt:0},{id:'other',minInt:0}]},
  })('src/server/api/beta-raid/island/island-spell-plan.ts');
  return {row,run:()=>planner.islandSpellPlan({byId:new Map([['actual-pillar',{id:'actual-pillar',tiers:3}]])}),get query(){return query;}};
}

test('planner copies a configured world building and its price; does not invent a free fallback',async()=>{
  const h=planHarness(),plan=await h.run();assert.deepEqual(plan,pillarPlan);assert.match(h.query,/map_id = 'world-active'/);
  assert.match(h.query,/COALESCE\(t.active, true\)/);
  for(const setup of [{rows:[]},{spells:[{id:'basic',minInt:2}]},{spells:[{id:'not-offered',minInt:0}]}])
    await assert.rejects(()=>planHarness(setup).run());
  const invalid=planHarness();invalid.row.config.spellbook={...pillarPlan.spellbook,learnPrices:[{resource:'token',amount:1}]};
  await assert.rejects(()=>invalid.run());
});

test('new maps reject the old direct free-spell endpoint even for cached clients',async()=>{
  const h=apiHarness({pillar:true});await assert.rejects(()=>h.api.claimShortTutorialSpell(),/столба/);assert.equal(h.grants,0);
});

function learnHarness({paymentFails=false,progressFails=false,mapId='isle_test',known=[]}={}) {
  const events=[];const sql={sqlStr:s=>"'"+s+"'"};
  const api=loader({
    '@tanstack/react-start':{createServerFn:()=>({inputValidator:()=>({handler:f=>f})})},
    '../../db/mcpClient':{mcpExec:async query=>{events.push(query.includes('WITH ins AS')?'book':'delete');return[{ins:1,used:0}];}},
    '../raid-shared':sql,'./gate':{requireBetaRaid:async()=>'wallet'},
    './hero-boost':{claimBoostOp:async()=>true,releaseBoostOp:async()=>{events.push('release');}},
    './resource-pay':{payResources:async(wallet,price)=>{events.push('pay');assert.deepEqual(price,pillarPlan.spellbook.learnPrices);if(paymentFails)throw Error('balance');}},
    './econ/trade-hooks':{noteEnergyInPrices:()=>{}},
    './spell-book':{learnedSpellIds:async()=>known,spellHero:async()=>({heroId:'hero',intellect:1,spec:null,rarity:'common'})},
    './spell-tpl':{loadSpellTemplates:async()=>[{id:'basic',minInt:0}]},
    './spell-pillar':{requirePillar:async()=>({mapId,cfg:pillarPlan.spellbook})},
    './spell-forget':{forgetInput:x=>x},'@/lib/hero/spellbookSlots':{spellbookSlots:()=>2},
    './island/island-spell-progress':{islandPillarSource:async()=> 'pending-attributed-source',noteIslandPillarLearn:async(...args)=>{events.push('progress');assert.deepEqual(args,['wallet','isle_test',4,5,'hero','basic','operation']);if(progressFails)throw Error('progress unavailable');}},
  })('src/server/api/beta-raid/spell-learn.ts');
  return {events,run:()=>api.learnSpell({data:{q:4,r:5,spellId:'basic',op:'operation'}})};
}

test('normal pillar purchase credits tutorial only after payment; failure rolls back book and grants no progress',async()=>{
  const h=learnHarness();assert.equal((await h.run()).ok,true);assert.deepEqual(h.events,['book','pay','progress']);
  const failed=learnHarness({paymentFails:true});assert.equal((await failed.run()).ok,false);assert.deepEqual(failed.events,['book','pay','delete','release']);
  const normal=learnHarness({mapId:'world'});assert.equal((await normal.run()).ok,true);assert.deepEqual(normal.events,['book','pay']);
  const already=learnHarness({known:['basic']});assert.equal((await already.run()).ok,false);assert.deepEqual(already.events,[]);
  const broken=learnHarness({progressFails:true}),warn=console.warn;console.warn=()=>{};
  try{assert.equal((await broken.run()).ok,true);}finally{console.warn=warn;}
});

test('paid receipt is owner/map/pillar scoped and written before progress for polling recovery',async()=>{
  const queries=[];const row={mapId:'isle_test',skippedAt:null,places:{lesson:{pillar:{q:4,r:5}}}};
  const api=loader({
    '@/server/db/mcpClient':{mcpExec:async(sql,opts)=>{queries.push({sql,opts});return[{op:'operation'}];}},
    '@/server/api/raid-shared':{sqlStr:s=>"'"+String(s).replaceAll("'","''")+"'"},
    '../owner':{raidOwner:async()=>'owner'},'./island-row':{loadIsland:async()=>row},
  })('src/server/api/beta-raid/island/island-spell-progress.ts');
  const note=(map='isle_test',q=4)=>api.noteIslandPillarLearn('wallet',map,q,5,'hero','basic','operation');
  await note();assert.equal(queries.length,2);assert.match(queries[0].sql,/isle_test:4:5:paid/);
  assert.match(queries[0].sql,/hero_id = 'hero'/);assert.match(queries[0].sql,/account_id = 'owner'/);
  assert.equal(queries[0].opts.wrapJsonCte,true);assert.match(queries[1].sql,/map_id = 'isle_test'/);
  assert.match(queries[1].sql,/tutorial_skipped_at IS NULL/);assert.match(queries[1].sql,/pillar'->>'q' = '4'/);
  await note('isle_new');await note('isle_test',6);row.skippedAt='date';await note();assert.equal(queries.length,2);
  const facts=loader({'@/server/db/mcpClient':{mcpExec:async()=>[{spell:true,pos_map:'isle_test',pos_q:4,pos_r:5}]},
    '@/server/api/raid-shared':{sqlStr:s=>"'"+s+"'"},'./island-write':{treasureIdSql:()=>"'treasure'"},'@/lib/raid/island/gift':{islandGiftRef:()=> 'gift'},
  })('src/server/api/beta-raid/island/island-facts.ts');
  const places={...place,lesson:{...lesson,pillar:{q:4,r:5}}};
  const result=await facts.islandFacts('owner','isle_test',places);assert.ok(result.done.includes('spell'));
  const query=facts.factsSql('owner','isle_test',places);assert.match(query,/right\(o.source,/);assert.match(query,/:island:isle_test:4:5:paid/);
  assert.doesNotMatch(query,/hero_spellbook/,'known spells alone cannot complete this step');
});

function offerProgressHarness({preexisting=false,paid=false,wrongMap=false,bookKnown=true}={}) {
  const queries=[],row={mapId:'isle_test',skippedAt:null,places:{lesson:{pillar:{q:4,r:5}}}};
  const pending={mapId:wrongMap?'isle_old':'isle_test',q:4,r:5,spellId:'basic',prices:pillarPlan.spellbook.learnPrices};
  const api=loader({
    '@/server/db/mcpClient':{mcpExec:async(sql,opts)=>{queries.push(sql);
      if(sql.startsWith('SELECT 1 FROM yuplink.hero_spellbook'))return preexisting?[{}]:[];
      if(sql.startsWith('SELECT o.op, o.source'))return[{op:'operation',source:'island_spell_pending:'+JSON.stringify(pending)+'#nonce'}];
      if(sql.startsWith('SELECT ('))return[{paid}];
      return[{op:'operation'}];}},
    '@/server/api/raid-shared':{sqlStr:s=>"'"+String(s).replaceAll("'","''")+"'"},
    '../owner':{raidOwner:async()=>'owner'},'./island-row':{loadIsland:async()=>row},
  })('src/server/api/beta-raid/island/island-spell-progress.ts');
  return {queries,run:()=>api.noteIslandPillarOffer('wallet','isle_test',4,5,'hero',bookKnown?['basic']:[])};
}

test('replay credits a real pillar visit for a spell known before this island, with no new charge or grant',async()=>{
  const h=offerProgressHarness({preexisting:true});await h.run();assert.equal(h.queries.length,2);
  assert.match(h.queries[0],/b.learned_at <= i.created_at/);
  assert.match(h.queries[0],/h.id = 'hero'/);assert.match(h.queries[0],/i.map_id = 'isle_test'/);
  assert.match(h.queries[1],/UPDATE yuplink.raid_island/);assert.doesNotMatch(h.queries.join('\n'),/INSERT|res_move|available/);
});

test('missing post-payment receipt recovers from all payment journals; pending/unpaid and other-map attempts never count',async()=>{
  const h=offerProgressHarness({paid:true});await h.run();assert.equal(h.queries.length,5);
  assert.match(h.queries[2],/res_ledger/);assert.match(h.queries[2],/like_spend_log/);
  assert.match(h.queries[2],/portal_refund/);assert.match(h.queries[2],/delta <= -7/);
  assert.match(h.queries[2],/spell_learn:operation:0:gold/);assert.match(h.queries[2],/spell_learn:operation:1:likes/);
  assert.match(h.queries[3],/isle_test:4:5:paid/);assert.match(h.queries[4],/UPDATE yuplink.raid_island/);
  for(const setup of [{paid:false},{paid:true,wrongMap:true},{paid:true,bookKnown:false}]) {
    const no=offerProgressHarness(setup);await no.run();assert.ok(no.queries.every(q=>!q.startsWith('UPDATE')));
  }
});

test('map facts cannot write spell completion into a concurrently restarted island',async()=>{
  const queries=[];
  const row=loader({'@/server/db/mcpClient':{mcpExec:async sql=>{queries.push(sql);return[];}},
    '@/server/api/raid-shared':{sqlStr:s=>"'"+s+"'"},
  })('src/server/api/beta-raid/island/island-row.ts');
  await row.markDone('owner',['spell'],'isle_old');assert.match(queries[0],/account_id = 'owner' AND map_id = 'isle_old'/);
});

test('opening the actual backpack item records progress without Show, a spotlight, or OK',async()=>{
  const h=viewHarness();try{
    const item=h.add('chest_backpack');h.show(item);await settled();
    assert.deepEqual(h.calls,[['chest_backpack','isle_test']]);
    h.tick();h.show(item);await settled();assert.equal(h.calls.length,1,'successful view is not posted repeatedly');
    const hero=h.add('hero');h.show(hero);await settled();assert.equal(h.calls[1][0],'hero');
  }finally{h.close();}assert.equal(h.stopped,true);
});

test('mounted but offscreen, hidden, inert, and background-tab content does not count as viewed',async()=>{
  const h=viewHarness();try{
    const item=h.add('chest_backpack');h.show(item,0);h.tick();h.show(item,0.1);await settled();assert.equal(h.calls.length,0);
    item.hidden=true;h.sync();h.show(item);await settled();assert.equal(h.calls.length,0);
    item.hidden=false;item.inert=true;h.sync();h.show(item);await settled();assert.equal(h.calls.length,0);
    item.inert=false;h.sync();document.visibilityState='hidden';h.show(item);await settled();assert.equal(h.calls.length,0);
    document.visibilityState='visible';h.resume();await settled();assert.equal(h.calls.length,1);
  }finally{h.close();}
});

test('view notes retry network failures and pending chest claims without requiring another click',async()=>{
  let attempts=0;const h=viewHarness({record:async()=>{attempts++;if(attempts===1)throw Error('offline');return{recorded:attempts>2};}});
  try{const item=h.add('chest_backpack');h.show(item);await settled();assert.equal(h.calls.length,1);
    h.tick();await settled();assert.equal(h.calls.length,2);h.tick();await settled();assert.equal(h.calls.length,3);
    h.tick();await settled();assert.equal(h.calls.length,3);
  }finally{h.close();}
});

test('closed views and completed or skipped notes are not credited later from stale DOM',async()=>{
  const h=viewHarness({done:['hero','skip:chest_backpack'],record:async()=>({recorded:false})});
  try{const item=h.add('chest_backpack');h.show(item);h.tick();await settled();assert.equal(h.calls.length,0);}finally{h.close();}
  const retry=viewHarness({record:async()=>({recorded:false})});try{
    const item=retry.add('chest_backpack');retry.show(item);await settled();item.isConnected=false;retry.sync();retry.tick();await settled();assert.equal(retry.calls.length,1);
  }finally{retry.close();}
});

function viewedAckHarness({mapId='isle_test',shortRoute=true,pilot=true,done=['hero_pick','chest'],chestFact=true,chestPending=false,restartDuringRequest=false}={}){
  const writes=[];let currentMap=mapId;const api=loader({
    '@tanstack/react-start':{createServerFn:()=>{let validate=x=>x;return{inputValidator(fn){validate=fn;return this;},handler(fn){return async(args={})=>fn({data:validate(args.data)});}};}},
    '@/server/islandTester':{isIslandTutorialPilot:()=>pilot},'@/server/auth':{getSessionTgId:()=>1},
    '../gate':{requireBetaRaid:async()=>'wallet'},'../owner':{raidOwner:async()=>'owner'},
    './island-row':{loadIsland:async account=>{assert.equal(account,'owner');return{mapId,places:{...place,...(shortRoute?{lesson}:{})},done,skippedAt:null,resetAt:null};},markDone:async(account,ids)=>{assert.equal(account,'owner');writes.push(ids);},markViewedForMap:async(account,expectedMap,ids)=>{assert.equal(account,'owner');if(currentMap!==expectedMap)return false;writes.push(ids);return true;}},
    './island-facts':{islandFacts:async()=>({done:chestFact?['chest']:[],onIsland:true,at:{q:1,r:0}})},
    './short-tutorial-service':{shortChestPending:async()=>{if(restartDuringRequest)currentMap='isle_new';return chestPending;}},
  })('src/server/api/beta-raid/island/island-api.ts');
  return{writes,ack:(step,mapId='isle_test')=>api.ackIsland({data:{step,...(mapId?{mapId}:{})}})};
}

test('actual view notes can be saved before their guide becomes current',async()=>{
  const h=viewedAckHarness({done:['hero_pick','chest']});
  assert.equal((await h.ack('chest_backpack')).recorded,true);assert.deepEqual(h.writes,[['chest','chest_backpack']]);
  assert.equal((await h.ack('hero')).recorded,true);
});

test('fast chest-to-backpack navigation uses real chest facts before the normal poll catches up',async()=>{
  const h=viewedAckHarness({done:['hero_pick'],chestFact:true});assert.equal((await h.ack('chest_backpack')).recorded,true);
  assert.deepEqual(h.writes,[['chest','chest_backpack']]);
});

test('automatic notes cannot cross an island restart or credit an unopened/unclaimed chest',async()=>{
  // 11.11.2026: short route for every island with a lesson, not only the pilot account.
  for(const options of [{mapId:'isle_new'},{shortRoute:false},{done:['hero_pick'],chestFact:false},{chestPending:true}]){
    const h=viewedAckHarness(options);assert.equal((await h.ack('chest_backpack')).recorded,false);assert.equal(h.writes.length,0);
  }
  const h=viewedAckHarness({done:[]});assert.equal((await h.ack('hero')).recorded,false);assert.equal((await h.ack('hello')).recorded,false);
  assert.equal(h.writes.length,0);await assert.rejects(()=>h.ack('chop'));
});

test('existing manual information acknowledgements keep their API contract',async()=>{
  const h=viewedAckHarness({shortRoute:false});assert.equal((await h.ack('hello',null)).ok,true);assert.deepEqual(h.writes,[['hello']]);
});

test('an island reset between validation and recording does not credit the new run',async()=>{
  const h=viewedAckHarness({restartDuringRequest:true});assert.equal((await h.ack('chest_backpack')).recorded,false);assert.equal(h.writes.length,0);
});

test('view recording checks map and skip state atomically in the actual SQL update',async()=>{
  const sqls=[];let result=[];
  const row=loader({
    '@/server/db/mcpClient':{mcpExec:async(sql,options)=>{sqls.push(sql);assert.equal(options.wrapJsonCte,true);return result;}},
    '@/server/api/raid-shared':{sqlStr:s=>"'"+String(s).replaceAll("'","''")+"'"},
  })('src/server/api/beta-raid/island/island-row.ts');
  assert.equal(await row.markViewedForMap('owner','isle_test',['hero']),false);
  assert.match(sqls[0],/WHERE account_id = 'owner' AND map_id = 'isle_test'/);
  assert.match(sqls[0],/tutorial_skipped_at IS NULL/);assert.match(sqls[0],/places->'lesson'->>'version' = '1'/);
  assert.match(sqls[0],/RETURNING account_id/);
  result=[{account_id:'owner'}];assert.equal(await row.markViewedForMap('owner','isle_test',['chest','chest_backpack']),true);
});

test('castle hint and Skip step use separate lanes even for a full-height hero highlight',()=>{
  for(const width of [320,360,397,748,1280]){
    const viewport={left:0,top:0,width,height:640};
    const skip={left:20,top:582,right:180,bottom:618};
    const target={x:0,y:0,w:width,h:1400};
    const available=reserveSpotlightFooter(viewport,skip);
    for(const height of [80,140,400,900]){
      const tip={width:Math.min(300,width-16),height};
      const pos=placeSpotlightTip(target,tip,available);
      assert.ok(pos.top>=8);
      assert.ok(pos.top+Math.min(height,pos.maxHeight)<=skip.top-8,'text and dismissal stay above the live skip control');
    }
  }
});

test('footer reservation respects the visible viewport and leaves map hints unchanged',()=>{
  const viewport={left:20,top:110,width:360,height:330};
  assert.equal(reserveSpotlightFooter(viewport),viewport);
  assert.equal(reserveSpotlightFooter(viewport,{left:30,top:600,right:180,bottom:636}),viewport);
  assert.equal(reserveSpotlightFooter(viewport,{left:500,top:300,right:650,bottom:336}),viewport);
  const skip={left:30,top:390,right:180,bottom:426};
  const available=reserveSpotlightFooter(viewport,skip);
  const tip={width:300,height:1000};
  const pos=placeSpotlightTip({x:0,y:0,w:720,h:1800},tip,available);
  assert.ok(pos.top>=118);assert.ok(pos.top+pos.maxHeight<=skip.top-8);
});

test('hero hint remains visible when the highlighted detail is taller than the viewport',()=>{
  const viewport={left:0,top:0,width:748,height:720};
  for(const target of [{x:0,y:0,w:748,h:1400},{x:0,y:-420,w:748,h:1400}]){
    const pos=placeSpotlightTip(target,{width:300,height:140},viewport);
    assert.ok(pos.top>=8);assert.ok(pos.top+140<=712);
    assert.ok(pos.left>=8);assert.ok(pos.left+300<=740);
  }
});

test('hint uses its actual height above a lower target and avoids a tutorial drawer',()=>{
  const viewport={left:0,top:0,width:360,height:640};
  const target={x:120,y:580,w:60,h:44};
  const above=placeSpotlightTip(target,{width:280,height:170},viewport);
  assert.ok(above.top+170<=target.y-10);
  const below=placeSpotlightTip({x:120,y:40,w:44,h:44},{width:280,height:100},viewport,{left:0,top:90,right:360,bottom:320});
  assert.ok(below.top>=328);assert.ok(below.top+100<=632);
});

test('hint fits the visible viewport after browser chrome or keyboard changes',()=>{
  const viewport={left:20,top:110,width:360,height:330};
  const pos=placeSpotlightTip({x:-100,y:-300,w:1000,h:1600},{width:500,height:900},viewport);
  assert.equal(pos.maxWidth,344);assert.equal(pos.maxHeight,314);
  assert.ok(pos.left>=28);assert.ok(pos.left+pos.maxWidth<=372);
  assert.ok(pos.top>=118);assert.ok(pos.top+pos.maxHeight<=432);
});

test('narrow and desktop hint placements stay inside viewport bounds',()=>{
  for(const width of [320,360,397,748,1280])for(const height of [240,640,900])for(let i=0;i<20;i++){
    const viewport={left:17,top:65,width,height},tip={width:100+i*25,height:40+i*45};
    const pos=placeSpotlightTip({x:-100+i*90,y:-300+i*80,w:50+i*30,h:40+i*90},tip,viewport);
    assert.ok(pos.left>=viewport.left+8);assert.ok(pos.top>=viewport.top+8);
    assert.ok(pos.left+Math.min(tip.width,pos.maxWidth)<=viewport.left+width-8);
    assert.ok(pos.top+Math.min(tip.height,pos.maxHeight)<=viewport.top+height-8);
  }
});

test('new route contains exactly twelve actions, and old islands retain their order', () => {
  assert.deepEqual([...short.SHORT_STEP_IDS], ['hello','hero_pick','hero','chest','chest_backpack','sell','axe','chop','slime','slime_loot','boat','sail','spell']);
  assert.equal(steps.islandTutorialOrder(true, place), steps.ISLAND_PILOT_STEP_IDS);
  // 11.11.2026: any island with a lesson takes the short route; old islands keep theirs.
  assert.equal(steps.islandTutorialOrder(false, {...place, lesson}), short.SHORT_STEP_IDS);
  assert.equal(steps.islandTutorialOrder(false, place), steps.ISLAND_STEP_IDS);
  assert.equal(steps.islandTutorialOrder(true, {...place, lesson}), short.SHORT_STEP_IDS);
  const done = new Set(['hello','hero_pick','hero','chest','chest_backpack','sell','axe','chop']);
  assert.equal(steps.currentStep(done, {...place,lesson}, short.SHORT_STEP_IDS), 'slime');
  done.add('skip:slime');
  assert.equal(steps.currentStep(done, {...place,lesson}, short.SHORT_STEP_IDS), 'slime_loot');
  assert.equal(done.has('slime'), false, 'skipping a hint is not a battle fact');
});

test('lake has a connected crossing and does not overwrite a city or road', () => {
  const cells = [];
  for(let q=-15;q<=15;q++) for(let r=-15;r<=15;r++) if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=15)
    cells.push({q,r,terrainId:'land',buildingId: q===0&&r===0?'hall':null,roadId:r===0&&q>=0&&q<5?'road':null,groupId:null,objectId:null,decorationId:'tree',buildingSkinId:null,buildingConfig:null,tier:null,objectConfig:null,mode:'base'});
  const frozen = JSON.stringify(cells);
  const a = short.shortLake(cells, 'water', new Set(), {q:0,r:0});
  const b = short.shortLake([...cells].reverse(), 'water', new Set(), {q:0,r:0});
  assert.deepEqual(a.lesson, b.lesson);
  assert.equal(JSON.stringify(cells), frozen);
  const protectedKey=`${a.lesson.water[0].q},${a.lesson.water[0].r}`;
  const protectedLake=short.shortLake(cells,'water',new Set(),{q:0,r:0},new Set([protectedKey]));
  assert.equal(protectedLake.cells.find(c=>`${c.q},${c.r}`===protectedKey).decorationId,'tree','manual template decor is preserved');
  const waters = a.cells.filter(c=>c.terrainId==='water'); assert.equal(waters.length,19);
  assert.equal(a.cells.find(c=>c.q===0&&c.r===0).buildingId,'hall');
  assert.equal(a.cells.find(c=>c.q===3&&c.r===0).roadId,'road');
  const dist=(a,b)=>Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r));
  const visited=new Set(); const pending=waters.filter(c=>dist(c,a.yard)<=1);
  while(pending.length){const c=pending.pop(),key=`${c.q},${c.r}`;if(visited.has(key))continue;visited.add(key);pending.push(...waters.filter(n=>dist(c,n)===1&&!visited.has(`${n.q},${n.r}`)));}
  assert.ok(waters.some(c=>dist(c,a.lesson.shore)<=1&&visited.has(`${c.q},${c.r}`)));
  assert.throws(()=>short.shortLake(cells,'water',new Set(cells.map(c=>`${c.q},${c.r}`)),{q:0,r:0}));
});

test('real generator keeps the castle start and all short-route targets reachable across seeds', () => {
  const {generateIsland}=load(p+'generate.ts');
  const {testSpec,TEST_CATALOG,WATER,OCEAN}=load('src/test/worldSpec.ts');
  const {DIRS,hexDist,keyOf}=load('src/lib/raid/zonegen/town/hex.ts');
  for(const seed of [11,222,3333,44444,101,138,175,212,249,286,323,360]) {
    const island=generateIsland(testSpec(7),TEST_CATALOG,seed,{gift:true,short:true});
    const {places,cells}=island;
    const spec=testSpec(7);assert.ok(places.lesson,`lake exists, seed ${seed}`);
    assert.deepEqual(places.spawn,places.hall);
    const by=new Map(cells.map(c=>[keyOf(c),c])), visited=new Set(), pending=[places.spawn];
    const walk=(c)=>c&&![WATER,OCEAN].includes(c.terrainId)&&(!c.decorationId||spec.walk.includes(c.decorationId))&&!c.objectId&&c.buildingConfig?.effect!=='mine';
    while(pending.length){const c=pending.pop(),k=keyOf(c);if(visited.has(k)||(k!==keyOf(places.spawn)&&!walk(by.get(k))))continue;visited.add(k);for(const [q,r] of DIRS)pending.push({q:c.q+q,r:c.r+r});}
    for(const target of [places.chest,places.workshop,places.trees[0],places.monsters[0],places.shipyard,places.lesson.shore]) {
      assert.ok([...visited].some(k=>{const [q,r]=k.split(',').map(Number);return hexDist({q,r},target)<=1;}),`reachable ${keyOf(target)}, seed ${seed}`);
    }
    assert.ok(places.lesson.water.every(c=>by.get(keyOf(c)).terrainId===WATER));
    assert.notEqual(by.get(keyOf(places.lesson.shore)).terrainId,WATER);
    assert.equal(by.get(keyOf(places.shipyard)).buildingId,'building_GvejiPrkBV');
  }
});

test('short chest provides the sale ingot and boat budget; legacy rewards remain unchanged', () => {
  const f = loader({'@/lib/shipRules':{SHIPYARD_TIER_SMALL:1}})(p+'features.ts');
  const kit=f.chestReward(true,true), old=f.chestReward(true,false), replay=f.chestReward(false,true);
  assert.ok(kit.fillers.some(x=>x.itemId==='cst_0chsk0wpqt2b'&&x.amount===1));
  assert.ok(kit.fillers.find(x=>x.kind==='likes').amount >= load('src/lib/buildingEffect.ts').SHIP_PRICE_LIKES);
  assert.equal(kit.fillers.some(x=>x.resource==='gold'&&x.amount>0),false);
  assert.equal(kit.packs.length,0); assert.equal(old.packs.length,3);
  assert.equal(old.fillers.find(x=>x.kind==='likes').amount,150);
  assert.equal(old.fillers.find(x=>x.resource==='gold').amount,10);
  assert.equal(replay.fillers.some(x=>x.kind==='likes'),false, 'one-time gift is not minted on restart');
});

test('shop prices the short-route axe in the proceeds currency, with no global recipe change', () => {
  const write=loader({
    '@/server/api/raid-shared':{sqlStr:s=>"'"+String(s).replaceAll("'","''")+"'"},
    '../worldgen/write-sql':{}, '@/lib/raid/island/shape':{}, '@/lib/raid/island/ids':{}, './island-extras':{}, './island-master':{}, './island-exit-cap':{}, './island-stores':{}, '@/lib/raid/island/stores':{},
  })('src/server/api/beta-raid/island/island-write.ts');
  const current=write.workshopSql('isle_test',{q:2,r:0},true).join('\n');
  const legacy=write.workshopSql('isle_test',{q:2,r:0},false).join('\n');
  for (const sql of write.workshopSql('isle_test',{q:2,r:0},true).slice(1)) {
    const cols=sql.match(/raid_market_item\s*\(([^)]+)\)/s)[1].split(',').length;
    const values=sql.match(/SELECT (.*?)\s+FROM yuplink/s)[1].split(',').length;
    assert.equal(values,cols,'generated SQL supplies every price column');
  }
  assert.match(current,new RegExp("ci.image, 'gold', NULL, "+short.SHORT_AXE_GOLD+", NULL, NULL, NULL, 'buy'"));
  assert.match(legacy,/ci.image, 'custom', 'cst_pykrpujitzq0', 1, NULL, NULL, NULL, 'buy'/);
  assert.equal(short.SHORT_AXE_GOLD,load(p+'loot.ts').ISLAND_SELL.find(x=>x.item==='goldIngot').amount);
});

function apiHarness({pilot=true,done,known=[],at={q:6,r:1},shortRoute=true,slots=1,extraSpell=false,intellect=1,minInt=0,pillar=false}={}) {
  const saved = new Set(done ?? short.SHORT_STEP_IDS.filter(x=>x!=='spell'));
  const writes=[]; let grants=0;
  const row={account:'owner',mapId:'isle_test',places:{...place,...(shortRoute?{lesson:{...lesson,...(pillar?{pillar:{q:4,r:5}}:{})}}:{})},done:[],resetAt:null,skippedAt:null};
  const api=loader({
    '@tanstack/react-start':{createServerFn:()=>({handler:f=>f})},
    '@/server/api/raid-reward-live':{liveRewardSql:()=>"true"},
    '@/server/db/mcpClient':{mcpExec:async sql=>{writes.push(sql);if(!known.includes('basic')){known.push('basic');grants++;return[{spell_id:'basic'}];}return[];}},
    '@/server/api/raid-shared':{sqlStr:s=>"'"+String(s).replaceAll("'","''")+"'"},
    '../gate':{requireBetaRaid:async()=>'wallet'},'../owner':{raidOwner:async()=>'owner'},'@/server/auth':{getSessionTgId:()=>1},'@/server/islandTester':{isIslandTutorialPilot:()=>pilot},
    '../spell-book':{spellHero:async()=>({heroId:'own-hero',spec:null,rarity:'common',intellect}),learnedSpellIds:async()=>[...known]},
    '../spell-tpl':{loadSpellTemplates:async()=>[{id:'basic',name:'Basic spell',description:'Description',image:null,minInt},...(extraSpell?[{id:'second',name:'Second spell',description:'Second',image:null,minInt:0}]:[])]},
    '@/lib/hero/spellbookSlots':{spellbookSlots:()=>slots},
    './island-row':{loadIsland:async()=>({...row,done:[...saved]}),markDone:async(account,ids)=>{assert.equal(account,'owner');for(const id of ids)saved.add(id);}},
    './island-facts':{islandFacts:async()=>({done:[],onIsland:true,at})},
  })('src/server/api/beta-raid/island/short-tutorial-service.ts');
  return {api,saved,writes,get grants(){return grants;}};
}

test('spell reward requires the real crossing, shore and a short-route island', async()=>{
  for(const setup of [{shortRoute:false},{at:{q:0,r:0}},{done:short.SHORT_STEP_IDS.filter(x=>!['sail','spell'].includes(x))}]){
    const h=apiHarness(setup);await assert.rejects(()=>h.api.claimShortTutorialSpell());assert.equal(h.grants,0);
  }
});
test('spell grant and repeat use the same choice and selected hero; skipping creates no reward',async()=>{
  const h=apiHarness();await h.api.claimShortTutorialSpell();await h.api.claimShortTutorialSpell();
  assert.equal(h.grants,1);assert.ok(h.saved.has('spell'));assert.ok(h.saved.has('spell-choice:basic'));
  assert.match(h.writes[0],/'own-hero'/);assert.match(h.writes[0],/ON CONFLICT ON CONSTRAINT hero_spellbook_pk DO NOTHING/);
  const skip=apiHarness({done:['hello','hero_pick','hero','chest','chest_backpack']});
  await skip.api.skipShortTutorialStep();assert.ok(skip.saved.has('skip:sell'));assert.equal(skip.saved.has('sell'),false);assert.equal(skip.grants,0);
});
test('a sale made independently advances the backpack explanation without Show',async()=>{
  const facts=loader({
    '@/server/db/mcpClient':{mcpExec:async()=>[{sell:true,pos_map:'isle_test',pos_q:1,pos_r:0}]},
    '@/server/api/raid-shared':{sqlStr:s=>"'"+String(s).replaceAll("'","''")+"'"},
    './island-write':{treasureIdSql:()=>"'treasure'"},
    '@/lib/raid/island/gift':{islandGiftRef:()=>"gift"},
  })('src/server/api/beta-raid/island/island-facts.ts');
  const result=await facts.islandFacts('owner','isle_test',{...place,lesson},new Set());
  assert.ok(result.done.includes('sell'));assert.ok(result.done.includes('chest_backpack'));
  const sql=facts.factsSql('owner','isle_test',{...place,lesson});
  assert.match(sql,/trade_journal/);assert.match(sql,/owner = 'owner'/);assert.match(sql,/map_id = 'isle_test'/);
});

test('an already known spell is shown without replacing the book or granting another',async()=>{
  const h=apiHarness({known:['basic']});const r=await h.api.claimShortTutorialSpell();
  assert.equal(r.alreadyKnown,true);assert.equal(h.grants,0);assert.ok(h.saved.has('spell'));
});

test('replaying with free book slots does not farm another spell',async()=>{
  const h=apiHarness({known:['basic'],slots:3,extraSpell:true});
  const r=await h.api.claimShortTutorialSpell();assert.equal(r.spellId,'basic');assert.equal(h.grants,0);
});

test('a reserved reward is revalidated after changing the selected hero',async()=>{
  const done=[...short.SHORT_STEP_IDS.filter(x=>x!=='spell'),'spell-choice:basic'];
  const h=apiHarness({done,intellect:0,minInt:2});await assert.rejects(()=>h.api.claimShortTutorialSpell());assert.equal(h.grants,0);
});

function squadHarness({ordinary=[],consumed=false}={}) {
  const state={training:[],ordinary,opened:consumed,grant:consumed,writes:[],opens:0};
  const packGrantSchema = fs.readFileSync(path.join(root, 'scripts/migrate-acc-payments-2026-08.sql'), 'utf8');
  const sourceConstraint = packGrantSchema.match(/ADD CONSTRAINT chip_pack_grants_source_check\s+CHECK \(source = ANY \(ARRAY\[([\s\S]+?)\]\)\)/);
  const allowedSources = new Set(Array.from(sourceConstraint[1].matchAll(/'([^']+)'::text/g), ([, source]) => source));
  const db=async sql=>{
    if(sql.includes('AS has_chips'))return[{has_chips:!!(state.training.length||state.ordinary.length)}];
    if(sql.includes('INSERT INTO yuplink.chip_pack_grants')){
      const grantSource = sql.match(/'([^']+)',\s*'island:short:[^']+:squad'/)?.[1];
      assert.ok(allowedSources.has(grantSource), `chip_pack_grants_source_check rejected ${grantSource}`);
      state.writes.push(sql);state.grant=true;return[];
    }
    if(sql.includes('SELECT id, account_id, opened_at'))return state.grant?[{id:'cpg_test',account_id:'owner',opened_at:state.opened?'date':null}]:[];
    if(sql.includes('INSERT INTO yuplink.hallway_training_chips')){
      state.opens++;
      for(const m of sql.matchAll(/'cpg_test_t(\d+)', 'wallet', ([\d.]+)/g)){
        const id='cpg_test_t'+m[1];if(!state.training.some(x=>x.id===id))state.training.push({id,star:Number(m[2])});
      }
      return[];
    }
    if(sql.includes('SELECT star FROM yuplink.hallway_training_chips'))return state.training;
    if(sql.includes('UPDATE yuplink.chip_pack_grants')){state.opened=true;return[];}
    if(sql.includes('SELECT id, star FROM yuplink.hallway_training_chips'))return state.training;
    if(sql.includes('SELECT c.id, c.template_id'))return state.ordinary;
    throw new Error('Unexpected SQL in squad test: '+sql);
  };
  const sql={sqlStr:s=>"'"+String(s).replaceAll("'","''")+"'"};
  const read=loader({
    '@/server/db/mcpClient':{mcpExec:db},'../../db/mcpClient':{mcpExec:db},
    '@/server/api/raid-shared':sql,'../raid-shared':sql,
    './owner':{raidOwner:async()=>'owner'},
    '../heroes-squad':{heroSquadBattlesEnabled:async()=>false},
    '../../hallwayConfig':{getHallwayConfig:async()=>({images:{chipByStar:{}}})},
  });
  return{state,prepare:read('src/server/api/beta-raid/island/short-tutorial-squad.ts').prepareShortTutorialSquad,
    resolve:read('src/server/api/beta-raid/encounter-lineup.ts').resolveLineupInfo};
}

test('fresh short-route account gets one real training pack and a server-valid battle lineup',async()=>{
  const h=squadHarness();const lineup=await h.prepare('wallet','owner');
  assert.equal(lineup.length,3);assert.equal(h.state.opens,1);
  for(const c of lineup){assert.equal(c.templateId,'train:'+c.level);assert.ok(c.trainingId);assert.equal(c.training,true);}
  const resolved=await h.resolve('wallet',lineup);assert.equal(resolved.lineup.length,3);
  assert.deepEqual(resolved.lineup.map(c=>c.level),lineup.map(c=>c.level));
  await h.prepare('wallet','owner');assert.equal(h.state.opens,1);assert.equal(h.state.writes.length,1);
  assert.match(h.state.writes[0],/substr\(md5\('owner'\), 1, 16\)/);
  const api=fs.readFileSync(path.join(root,'src/server/api/beta-raid/island/island-api.ts'),'utf8');
  assert.match(api,/short && !row.skippedAt && facts.onIsland && done.has\("chest"\) && !done.has\("slime"\)/);
});

test('existing normal chips are used without minting another starter pack',async()=>{
  const h=squadHarness({ordinary:[{id:'own',template_id:'normal',level:3,name:'Owned'}]});
  const lineup=await h.prepare('wallet','owner');assert.equal(lineup[0].templateId,'normal');
  assert.equal(h.state.writes.length,0);assert.equal(h.state.opens,0);
});

test('consumed starter squad is not replenished by reopening the tutorial',async()=>{
  const h=squadHarness({consumed:true});assert.deepEqual(await h.prepare('wallet','owner'),[]);
  assert.equal(h.state.opens,0);assert.match(h.state.writes[0],/ON CONFLICT \(id\) DO NOTHING/);
});

test('remembered lineup preserves the training instance needed by battle validation',()=>{
  const previous=global.window;let saved;let events=0;
  global.window={localStorage:{setItem:(key,value)=>{saved=JSON.parse(value);}},dispatchEvent:()=>{events++;}};
  try{
    const {rememberLineup}=loader({react:{}})('src/components/beta-raid/useRememberedLineup.ts');
    rememberLineup([{templateId:'train:2',level:2,training:true,trainingId:'actual-instance'},{templateId:'normal',level:3}]);
    assert.equal(saved[0].trainingId,'actual-instance');assert.equal(saved[0].training,true);
    assert.equal(saved[1].training,undefined);assert.equal(events,1);
  }finally{if(previous===undefined)delete global.window;else global.window=previous;}
});



