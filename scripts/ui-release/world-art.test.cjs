const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '../..');
const source = 'src/components/beta-raid/world-art/';
function load(name) {
  const filename = path.join(root,source,name);
  const result = buildSync({ entryPoints:[filename], bundle:true, platform:'node', format:'cjs', write:false });
  const compiled = new Module(filename);
  compiled._compile(result.outputFiles[0].text,filename);
  return compiled.exports;
}
const {worldArtFor,worldArtFromMap,worldAssetImage,worldTerrainArt,WorldArtImages} = load('worldArt.ts');
const {loadWorldArt} = load('loadWorldArt.ts');
const art=worldArtFor('isle_XFgcEXJJqB');
test('the visual replacement is restricted to the approved demo ID',()=>{
  assert.ok(art);
  for(const id of [undefined,'isle_other','rmap_UthOURxc','Ванахейм','isle_XFgcEXJJqB ']) assert.equal(worldArtFor(id),null);
  assert.equal(worldArtFor(art.mapId,false),null);
});
test('image substitution preserves all gameplay fields and unknown terrain identity',()=>{
  const id=Object.keys(art.urls).find(k=>k.startsWith('t:')).slice(2);
  const source={ [id]:{id,name:'Original',imageUrl:'/old.png',cost:3,blocked:false},unknown:{imageUrl:'/unknown.png',cost:7} };
  const before=structuredClone(source),result=worldTerrainArt(source,art);
  assert.deepEqual(source,before);
  assert.deepEqual(result[id],{...before[id],imageUrl:art.urls['t:'+id]});
  assert.equal(result.unknown,source.unknown);assert.equal(worldTerrainArt(source,null),source);
  assert.equal(worldTerrainArt(result,art),result);
});
test('image overlay keeps dynamic original cache entries and lazy lookup intact',()=>{
  const old={},replacement={},base=new Map([['t:a',old],['b:castle',old]]);
  const images=new WorldArtImages(base,new Map([['t:a',replacement]]));
  assert.equal(images.get('t:a'),replacement);assert.equal(base.get('t:a'),old);
  base.set('hero',replacement);assert.equal(images.get('hero'),replacement);
  assert.equal(images.get('b:castle'),old);assert.equal(images.size,3);
  assert.equal(new Map(images).get('t:a'),replacement);
});
test('every mapped asset is a shipped WebP; no missing file or global URL',()=>{
  assert.equal(Object.keys(art.urls).length,31);
  for(const [key,url] of Object.entries(art.urls)){
    assert.match(key,/^[td]:/);assert.match(url,/^\/world-art\/vanaheim-v[23]\/[A-Za-z0-9_-]+\.webp$/);
    const bytes=fs.readFileSync(path.join(root,'public',url));
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
  }
});
function pending(timeout=1000){
  const images=[];
  const request=loadWorldArt({'t:a':'/a.webp','d:b':'/b.webp'},()=>{const image={src:'',naturalWidth:64,onload:null,onerror:null};images.push(image);return image;},timeout);
  return {images,request};
}
test('a partially loaded art set never becomes visible',async()=>{
  const {images,request}=pending();let done=false;request.promise.then(()=>done=true);
  images[0].onload();await Promise.resolve();assert.equal(done,false);
  images[1].onload();assert.equal((await request.promise).size,2);
});
test('404 keeps the entire original art set',async()=>{
  const {images,request}=pending();images[0].onload();images[1].onerror();assert.equal(await request.promise,null);
});
test('world changes cancel unfinished requests and keep completed textures valid',async()=>{
  const {images,request}=pending();images[0].onload();request.cancel();assert.equal(await request.promise,null);
  assert.equal(images[0].src,'/a.webp');assert.equal(images[1].src,'');assert.equal(images[1].onload,null);
});
test('timeout uses original art and removes stale completion handlers',async()=>{
  const {images,request}=pending(5);images[0].onload();assert.equal(await request.promise,null);assert.equal(images[1].onload,null);
});

test('real Vanaheim uses its existing server map name; other worlds/islands remain original',()=>{
  const map={id:'rmap_fixture_vanaheim',name:'Ванахейм'};
  assert.equal(worldArtFromMap(map,map.id),art);
  assert.equal(worldArtFor(map.id,false,map.name),null);
  for(const name of ['unknown','', 'Ванахейм copy'])
    assert.equal(worldArtFor(map.id,true,name),null);
  assert.equal(worldArtFor('isle_fixture',true,'Ванахейм'),null);
  assert.equal(worldArtFromMap(map,'rmap_fixture_other'),null);
  assert.equal(worldArtFromMap(map,null),null);
  assert.equal(worldArtFromMap(null,map.id),null);
});
test('construction thumbnails reuse the terrain/decor mapping, never buildings or resources',()=>{
  const tid=Object.keys(art.urls).find(k=>k.startsWith('t:')).slice(2);
  const did=Object.keys(art.urls).find(k=>k.startsWith('d:')).slice(2);
  assert.equal(worldAssetImage(art,'terrain',tid,'/original.png'),art.urls['t:'+tid]);
  assert.equal(worldAssetImage(art,'decoration',did,'/original.png'),art.urls['d:'+did]);
  for(const kind of ['building','road','chest','artifact','boss'])
    assert.equal(worldAssetImage(art,kind,tid,'/original.png'),'/original.png');
  assert.equal(worldAssetImage(art,'terrain','new-type','/original.png'),'/original.png');
  assert.equal(worldAssetImage(null,'terrain',tid,'/original.png'),'/original.png');
});
test('existing and newly placed cells use the same type without coordinate assignments',()=>{
  const tid=Object.keys(art.urls).find(k=>k.startsWith('t:')).slice(2);
  const old={terrainId:tid,q:1,r:1}, added={terrainId:tid,q:100,r:200};
  const initial={unmapped:{imageUrl:'/old.png',cost:9}};
  const delta={...initial,[tid]:{imageUrl:'/original.png',cost:4}};
  const result=worldTerrainArt(delta,art);
  assert.equal(result[old.terrainId].imageUrl,art.urls['t:'+tid]);
  assert.equal(result[added.terrainId].imageUrl,result[old.terrainId].imageUrl);
  assert.equal(result[tid].cost,4);
  assert.equal(delta[tid].imageUrl,'/original.png');
  assert.equal(result.unmapped,initial.unmapped);
});

const {createWorldArtStore}=load('worldArtStore.ts');
test('canvas and thumbnails share one load, including a whole-set failure',async()=>{
  let resolve,loads=0,cancels=0;
  const store=createWorldArtStore(()=>{loads++;return {promise:new Promise(r=>{resolve=r;}),cancel:()=>{cancels++;}};});
  const unsubscribeCanvas=store.subscribe(art,()=>{}),unsubscribePalette=store.subscribe(art,()=>{});
  assert.equal(loads,1);assert.equal(store.snapshot(art),null);
  resolve(null);await Promise.resolve();
  assert.equal(store.snapshot(art),null);
  unsubscribeCanvas();assert.equal(cancels,0);
  unsubscribePalette();assert.equal(cancels,1);
  const again=store.subscribe(art,()=>{});assert.equal(loads,2);
  const images=new Map([['t:a',{}]]);resolve(images);await Promise.resolve();
  assert.equal(store.snapshot(art),images);again();
  const remount=store.subscribe(art,()=>{});assert.equal(loads,2);
  assert.equal(store.snapshot(art),images);remount();
});
test('a cancelled old shared load cannot overwrite a new subscription',async()=>{
  const pending=[];
  const store=createWorldArtStore(()=>({promise:new Promise(r=>pending.push(r)),cancel:()=>{}}));
  const first=store.subscribe(art,()=>{});first();
  const second=store.subscribe(art,()=>{});
  pending[0](new Map([['stale',{}]]));await Promise.resolve();assert.equal(store.snapshot(art),null);
  const fresh=new Map([['fresh',{}]]);pending[1](fresh);await Promise.resolve();
  assert.equal(store.snapshot(art),fresh);second();
});

test('Svartalfheim and its old map name select a separate profile, never a player island',()=>{
  const dark=worldArtFor('rmap_fixture_builders',true,'Свартальвхейм');
  assert.ok(dark);assert.notEqual(dark,art);assert.equal(dark.version,'svartalfheim-v3');
  assert.equal(worldArtFor('rmap_fixture_builders',true,'Мир строителей'),dark);
  assert.equal(worldArtFor('isle_fixture',true,'Свартальвхейм'),null);
  assert.equal(worldArtFor('rmap_fixture_builders',false,'Свартальвхейм'),null);
  assert.equal(worldArtFor('rmap_fixture_builders',true,'toString'),null);
  assert.deepEqual(Object.keys(dark.urls).sort(),Object.keys(art.urls).sort());
  for(const [key,url] of Object.entries(dark.urls)){
    assert.notEqual(url,art.urls[key]);
    assert.match(url,/^\/world-art\/svartalfheim-v[23]\/[A-Za-z0-9_-]+\.webp$/);
    const bytes=fs.readFileSync(path.join(root,'public',url));
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
  }
});
test('completed art of one world cannot be reused as the next worlds texture set',async()=>{
  const dark=worldArtFor('rmap_fixture_builders',true,'Свартальвхейм');
  const pending=[];
  const store=createWorldArtStore(()=>({promise:new Promise(r=>pending.push(r)),cancel:()=>{}}));
  const a=store.subscribe(art,()=>{}),b=store.subscribe(dark,()=>{});
  const forest=new Map([['t:a',{}]]),cave=new Map([['t:a',{}]]);
  pending[0](forest);await Promise.resolve();
  assert.equal(store.snapshot(art),forest);assert.equal(store.snapshot(dark),null);
  pending[1](cave);await Promise.resolve();
  assert.equal(store.snapshot(dark),cave);assert.equal(store.snapshot(art),forest);
  a();b();
});

const {drawDecoration,decorationSprite}=load('../drawDecoration.ts');
function sprite(w,h,complete=true){return {naturalWidth:w,naturalHeight:h,complete};}
function recorder(images){
  const calls=[];
  return {calls,scene:{images,g:{drawImage:(...args)=>calls.push(args),beginPath(){},arc(){},fill(){}}}};
}
test('world skins retain original draw bounds, bottom anchor and every supplied scale',()=>{
  for(const [w,h] of [[723,1280],[1030,862],[1254,1254]]){
    const original=sprite(w,h),replacement=sprite(128,128),base=new Map([['d:tree',original]]);
    const overlay=new WorldArtImages(base,new Map([['d:tree',replacement]]));
    for(const width of [21,42,86,129,172]){
      const old=recorder(base),next=recorder(overlay);
      drawDecoration(old.scene,{x:100,y:150},'tree',width);
      drawDecoration(next.scene,{x:100,y:150},'tree',width);
      assert.equal(next.calls[0][0],replacement);
      assert.deepEqual(next.calls[0].slice(1),old.calls[0].slice(1));
      assert.equal(next.calls[0][2]+next.calls[0][4],150+28*.55);
    }
  }
});
test('lazy original dimensions remain missing until ready; no square frame or premature chunk rebake',()=>{
  let reads=0;
  const original=sprite(0,0,false),replacement=sprite(128,128);
  class LazyBase extends Map{get(key){reads++;return super.get(key);}}
  const base=new LazyBase([['d:tree',original]]),images=new WorldArtImages(base,new Map([['d:tree',replacement],['t:grass',replacement]]));
  assert.equal(reads,0);
  const initiallyEmpty=new WorldArtImages(new Map(),new Map([['d:tree',replacement]]));
  const empty=recorder(initiallyEmpty);drawDecoration(empty.scene,{x:0,y:0},'tree');
  assert.equal(empty.calls.length,0);
  const before=recorder(images);drawDecoration(before.scene,{x:0,y:0},'tree');
  assert.ok(reads>0);assert.equal(before.calls.length,0);
  assert.equal(images.get('d:tree'),original);assert.equal(images.get('t:grass'),replacement);
  original.complete=true; // Error: still no natural dimensions.
  assert.equal(images.get('d:tree'),original);
  original.naturalWidth=80;original.naturalHeight=160;
  assert.equal(images.get('d:tree'),replacement);
  const after=recorder(images);drawDecoration(after.scene,{x:0,y:0},'tree');
  assert.equal(after.calls[0][4],84);
  assert.equal(base.get('d:tree'),original);
});
function renderer(name,stubs){
  const filename=path.join(root,source,'..',name);
  const result=buildSync({entryPoints:[filename],bundle:true,platform:'node',format:'cjs',write:false,external:Object.keys(stubs)});
  const compiled=new Module(filename);compiled.require=(id)=>id in stubs?stubs[id]:require(id);
  compiled._compile(result.outputFiles[0].text,filename);return compiled.exports;
}
const {drawBlock,blocksOf}=renderer('drawMergedBlocks.ts',{
  './drawBuilding':{drawBuilding(){throw Error('Unexpected building');}},
  './drawObject':{},'./drawPlayers':{},'./mapIndex':{},'./chest/drawMagicChest':{},
});
test('real merged-block renderer preserves server group scales, one image and anchor after skinning',()=>{
  const original=sprite(723,1280),replacement=sprite(128,128),base=new Map([['d:tree',original]]);
  for(const scalePercent of [100,125,200]){
    const store={n:2,packed:{q:[0,1],r:[0,0],dec:[0,0],bld:[-1,-1],groups:[0,0,scalePercent,1,0,scalePercent],groupIds:['g']},geom:{x:[0,48],y:[0,0]},decorationId:()=> 'tree'};
    const block=blocksOf(store).list[0],old=recorder(base),next=recorder(new WorldArtImages(base,new Map([['d:tree',replacement]])));
    drawBlock({...old.scene,revealAll:true},store,block);drawBlock({...next.scene,revealAll:true},store,block);
    assert.equal(block.scale,scalePercent/100);assert.equal(next.calls.length,1);
    assert.deepEqual(next.calls[0].slice(1),old.calls[0].slice(1));
    assert.equal(next.calls[0][0],replacement);
  }
});
const {bakeCells}=renderer('chunkBake.ts',{
  './mapIndex':{forEachVisible:(index,view,visit)=>index.cells.forEach(visit)},
  './hexTileCache':{TILE_DRAW_H:56,TILE_DRAW_W:48},
  './roadRibbonCache':{RIBBON_DRAW_H:56,RIBBON_DRAW_W:48},
  './betaCanvasScene':{COLOR:{}},'./chunkIndex':{REACH:{x:28,y:28,dec:126}},
  './veinStore':{veinsOf:()=>new Map(),veinKey:()=>''},'./veinDraw':{},
});
test('chunk boundary retains a tall crown whose cell and square replacement lie below the chunk',()=>{
  const original=sprite(100,200),replacement=sprite(128,128),base=new Map([['d:tree',original]]);
  const images=new WorldArtImages(base,new Map([['d:tree',replacement]]));
  const capture=recorder(images);
  Object.assign(capture.scene.g,{save(){},restore(){},rect(){},clip(){},translate(){}});
  global.Path2D=class{moveTo(){}lineTo(){}closePath(){}};
  const store={n:1,packed:{groups:[],groupIds:[]}};
  const input={images,seen:{hasIndex:()=>true},revealAll:true,index:{store,cells:[{i:0,x:0,y:100,cell:{decorationId:'tree'}}]}};
  const missing=bakeCells(capture.scene.g,{minX:-50,maxX:50,minY:0,maxY:50},input);
  assert.deepEqual(missing,[]);assert.equal(capture.calls.length,1);
  assert.ok(capture.calls[0][2]<50);assert.equal(capture.calls[0][4],84);
  original.complete=false;
  assert.deepEqual(bakeCells(capture.scene.g,{minX:-50,maxX:50,minY:0,maxY:50},input),['d:tree']);
});

const worlds={
  'Асгард':'asgard-v4','Ванахейм':'vanaheim-v3',
  'Свартальвхейм':'svartalfheim-v3','Муспельхейм':'muspelheim-v3',
  'Нифльхейм':'niflheim-v3','Йотунхейм':'jotunheim-v3','Альфхейм':'alfheim-v3','Хельхейм':'helheim-v3',
};
test('all eight themed worlds have complete isolated WebP sets for the same existing types',()=>{
  const keys=Object.keys(art.urls).sort();
  for(const [name,version] of Object.entries(worlds)){
    const profile=worldArtFor('rmap_world',true,name);
    assert.equal(profile.version,version);assert.deepEqual(Object.keys(profile.urls).sort(),keys);
    assert.equal(worldArtFor('isle_player',true,name),null);
    assert.equal(worldArtFor('rmap_world',false,name),null);
    assert.equal(worldArtFromMap({id:'rmap_previous',name},'rmap_current'),null);
    for(const [key,url] of Object.entries(profile.urls)){
      assert.ok(url.startsWith('/world-art/'+version.replace(/-v\d+$/, '')+'-v'));
      const bytes=fs.readFileSync(path.join(root,'public',url));
      assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
      const kind=key.startsWith('t:')?'terrain':'decoration';
      assert.equal(worldAssetImage(profile,kind,key.slice(2),'/original.webp'),url);
    }
  }
});
test('known historical names use the same world profile, never substring matching',()=>{
  for(const [old,current] of [['Акания','Асгард'],['Планета воды','Ванахейм'],['Мир строителей','Свартальвхейм'],['Адский мир','Муспельхейм']]){
    assert.equal(worldArtFor('rmap_world',true,old),worldArtFor('rmap_world',true,current));
  }
  for(const name of Object.keys(worlds)){
    assert.equal(worldArtFor('rmap_world',true,'Остров '+name),null);
    assert.equal(worldArtFor('rmap_world',true,name+' copy'),null);
  }
});
test('every world keeps original decoration geometry and the supplied size multiplier',()=>{
  for(const name of Object.keys(worlds)){
    const profile=worldArtFor('rmap_world',true,name);
    for(const key of Object.keys(profile.urls).filter(k=>k.startsWith('d:'))){
      const original=sprite(160,283),skin=sprite(128,128);
      const base=new Map([[key,original]]),images=new WorldArtImages(base,new Map([[key,skin]]));
      for(const width of [21,42,84,168]){
        const old=recorder(base),next=recorder(images);
        drawDecoration(old.scene,{x:75,y:150},key.slice(2),width);
        drawDecoration(next.scene,{x:75,y:150},key.slice(2),width);
        assert.equal(next.calls[0][0],skin);
        assert.deepEqual(next.calls[0].slice(1),old.calls[0].slice(1));
      }
    }
  }
});

test('Midgard and its former name replace only water; other canvas, map and brush images stay original',()=>{
  for(const name of ['Мидгард','Мир Альфа']){
    const profile=worldArtFor('rmap_main',true,name);
    assert.equal(profile.version,'midgard-water-v1');
    assert.equal(worldArtFromMap({id:'rmap_main',name},'rmap_main'),profile);
    assert.deepEqual(Object.keys(profile.urls).filter(k=>!k.endsWith(':sparse')).sort(),['t:terrain_HkP00zwDo-','t:terrain_pRlK22YnWr'].sort());
    const original={grass:{imageUrl:'/original-grass.webp',cost:3}};
    assert.equal(worldTerrainArt(original,profile),original);
    for(const kind of ['terrain','decoration']){
      assert.equal(worldAssetImage(profile,kind,'original-id','/original.webp'),'/original.webp');
    }
  }
  assert.equal(fs.existsSync(path.join(root,source,'midgard.ts')),false);
  assert.equal(fs.existsSync(path.join(root,'public/world-art/midgard-v1')),false);
});


test('live Hel name selects approved Helheim art without widening island or stale-map scope',()=>{
  const expected=worldArtFor('rmap_fixture_hel',true,'Хельхейм');
  assert.ok(expected);
  assert.equal(worldArtFor('rmap_fixture_hel',true,'Хель'),expected);
  assert.equal(worldArtFromMap({id:'rmap_fixture_hel',name:'Хель'},'rmap_fixture_hel'),expected);
  assert.equal(worldArtFor('isle_fixture',true,'Хель'),null);
  assert.equal(worldArtFor('rmap_fixture_hel',false,'Хель'),null);
  assert.equal(worldArtFromMap({id:'rmap_fixture_hel',name:'Хель'},'rmap_other'),null);
});
