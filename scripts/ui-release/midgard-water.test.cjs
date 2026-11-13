const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {buildSync}=require('esbuild');
const root=path.resolve(__dirname,'../..');
const bundle=buildSync({stdin:{contents:`export * from './src/components/beta-raid/world-art/worldArt';
export * from './src/components/beta-raid/world-art/midgardWater';
export * from './src/components/beta-raid/world-art/loadWorldArt';
export * from './src/components/beta-raid/hexTileCache';`,resolveDir:root},bundle:true,platform:'node',format:'cjs',write:false});
const compiled=new Module(__filename);compiled._compile(bundle.outputFiles[0].text,__filename);
const {worldArtFor,worldTerrainArt,WorldArtImages,MIDGARD_WATER_IDS,registerMidgardWater,midgardWaterSparseImage,midgardWaterSparseUrl,HexTileCache,loadWorldArt}=compiled.exports;
const art=worldArtFor('rmap_alpha',true,'Мидгард');
const sprite=()=>({complete:true,naturalWidth:64,naturalHeight:64});
function pair(id=MIDGARD_WATER_IDS[0]){const regular=sprite(),sparse=sprite();const images=new Map([['t:'+id,regular],['t:'+id+':sparse',sparse]]);return {regular,sparse,images};}

test('water scope is exact: two terrains, four small shipped WebP, no decoration or island replacement',()=>{
 assert.equal(art,worldArtFor('rmap_other',true,'Мир Альфа'));
 assert.equal(worldArtFor('isle_player',true,'Мидгард'),null);
 assert.equal(worldArtFor('rmap_alpha',false,'Мидгард'),null);
 assert.equal(worldArtFor('rmap_alpha',true,'Мидгард copy'),null);
 assert.equal(Object.keys(art.urls).length,4);let size=0;
 for(const [key,url] of Object.entries(art.urls)){
  assert.ok(MIDGARD_WATER_IDS.some(id=>key==='t:'+id||key==='t:'+id+':sparse'));
  const b=fs.readFileSync(path.join(root,'public',url));size+=b.length;
  assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WEBP');
  assert.equal(b.toString('ascii',12,16),'VP8L');
  const bits=b.readUInt32LE(21);assert.equal((bits&0x3fff)+1,64);assert.equal(((bits>>>14)&0x3fff)+1,64);
 }
 assert.ok(size<=4096,`asset budget exceeded: ${size}`);
 const original={grass:{imageUrl:'/grass.webp',cost:3},[MIDGARD_WATER_IDS[0]]:{imageUrl:'/old.webp',cost:8,blocked:false}};
 const next=worldTerrainArt(original,art);assert.equal(next.grass,original.grass);
 assert.equal(next[MIDGARD_WATER_IDS[0]].cost,8);assert.equal(original[MIDGARD_WATER_IDS[0]].imageUrl,'/old.webp');
});
test('sparse variant removes exactly 10 percent of static crests over positive and negative coordinates',()=>{
 const {regular,sparse,images}=pair();registerMidgardWater(images);
 let count=0;for(let q=-100;q<100;q++)for(let r=-10;r<10;r++)if(midgardWaterSparseImage(regular,q,r)===sparse)count++;
 assert.equal(count,1200);assert.equal((4000*3-count)/(4000*3),.9);
 assert.equal(midgardWaterSparseImage(regular),undefined);
});
test('a loaded world overlay registers sparse art, but other worlds and missing images remain original',()=>{
 const {regular,sparse,images}=pair();const base=new Map([['t:'+MIDGARD_WATER_IDS[0],sprite()]]);
 new WorldArtImages(base,images);assert.equal(midgardWaterSparseImage(regular,0,0),sparse);
 const other=sprite();assert.equal(midgardWaterSparseImage(other,0,0),undefined);
 assert.equal(midgardWaterSparseImage(base.get('t:'+MIDGARD_WATER_IDS[0]),0,0),undefined);
 const missing=pair();missing.sparse.complete=false;registerMidgardWater(missing.images);
 assert.equal(midgardWaterSparseImage(missing.regular,0,0),undefined);
});
test('four water cache entries stay bounded across 40000 cell lookups and are freed on clear',()=>{
 const savedDocument=global.document,savedPath=global.Path2D;let canvases=[];
 global.Path2D=class{moveTo(){}lineTo(){}closePath(){}};
 global.document={createElement(){const g={setTransform(){},translate(){},clip(){},drawImage(img){cv.drawn=img},clearRect(){}};const cv={width:0,height:0,getContext(){return g}};canvases.push(cv);return cv;}};
 try{
  const pairs=MIDGARD_WATER_IDS.map(id=>pair(id));pairs.forEach(p=>registerMidgardWater(p.images));
  const cache=new HexTileCache();const first=cache.get('t:'+MIDGARD_WATER_IDS[0],pairs[0].regular,0,0);
  assert.equal(first.drawn,pairs[0].sparse);
  for(let q=-100;q<100;q++)for(let r=-50;r<50;r++)for(let i=0;i<2;i++)cache.get('t:'+MIDGARD_WATER_IDS[i],pairs[i].regular,q,r);
  assert.equal(canvases.length,4);assert.equal(cache.get('t:'+MIDGARD_WATER_IDS[0],pairs[0].regular,0,0),first);
  cache.clear();assert.ok(canvases.every(c=>c.width===0&&c.height===0));
 }finally{global.document=savedDocument;global.Path2D=savedPath;}
});
test('strategic-map sparse URL stays scoped to the two exact Midgard resources',()=>{
 assert.equal(midgardWaterSparseUrl('/world-art/midgard-water-v1/water.webp'),'/world-art/midgard-water-v1/water-sparse.webp');
 assert.equal(midgardWaterSparseUrl('/world-art/midgard-water-v1/ocean.webp'),'/world-art/midgard-water-v1/ocean-sparse.webp');
 for(const url of ['/original/water.webp','/world-art/asgard-v3/terrain_HkP00zwDo-.webp','/world-art/midgard-water-v1/grass.webp'])assert.equal(midgardWaterSparseUrl(url),null);
});
test('failure of any sparse asset keeps the all-or-nothing world fallback',async()=>{
 const images=[];const req=loadWorldArt(art.urls,()=>{const i={src:'',naturalWidth:64,onload:null,onerror:null};images.push(i);return i;});
 assert.equal(images.length,4);images[0].onload();images[1].onload();images[2].onload();images[3].onerror();
 assert.equal(await req.promise,null);
});
