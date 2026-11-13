const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {buildSync}=require('esbuild');
const root=path.resolve(__dirname,'../..');
const bundle=buildSync({stdin:{contents:`export * from './src/components/beta-raid/world-art/worldArt';
export * from './src/components/beta-raid/world-art/midgardWater';
export * from './src/components/beta-raid/hexTileCache';`,resolveDir:root},bundle:true,platform:'node',format:'cjs',write:false});
const mod=new Module(__filename);mod._compile(bundle.outputFiles[0].text,__filename);
const {worldArtFor,WorldArtImages,MIDGARD_WATER_IDS,registerMidgardWater,midgardWaterSparseImage,midgardWaterSparseUrl,waterTileHasPadding,HexTileCache}=mod.exports;
const names=['Асгард','Ванахейм','Свартальвхейм','Муспельхейм','Нифльхейм','Йотунхейм','Альфхейм','Хель'];
const sprite=src=>({src,complete:true,naturalWidth:64,naturalHeight:64});
test('all eight profiles ship the approved 32 lossless 64px water images below 36KB total',()=>{
 let bytes=0,files=0;
 for(const name of names){const profile=worldArtFor('rmap_current',true,name);let worldBytes=0;
  for(const id of MIDGARD_WATER_IDS){const url=profile.urls['t:'+id];assert.equal(midgardWaterSparseUrl(url),profile.urls['t:'+id+':sparse']);
   for(const suffix of ['',':sparse']){const data=fs.readFileSync(path.join(root,'public',profile.urls['t:'+id+suffix]));
    assert.equal(data.toString('ascii',8,12),'WEBP');assert.equal(data.toString('ascii',12,16),'VP8L');const bits=data.readUInt32LE(21);
    assert.equal((bits&0x3fff)+1,64);assert.equal(((bits>>>14)&0x3fff)+1,64);worldBytes+=data.length;files++;
   }
  }assert.ok(worldBytes<6144,`${name}: ${worldBytes}`);bytes+=worldBytes;
 }assert.equal(files,32);assert.ok(bytes<36000,`total ${bytes}`);
});
test('world switches keep their own sparse pair and pad only the new water, not Midgard or land',()=>{
 for(const name of [...names,'Мидгард']){const p=worldArtFor('rmap_current',true,name),id=MIDGARD_WATER_IDS[0];
  const regular=sprite('https://service.yupland.io'+p.urls['t:'+id]),sparse=sprite(p.urls['t:'+id+':sparse']);
  new WorldArtImages(new Map(),new Map([['t:'+id,regular],['t:'+id+':sparse',sparse]]));
  assert.equal(midgardWaterSparseImage(regular,0,0),sparse);assert.equal(waterTileHasPadding(regular),name!=='Мидгард');assert.equal(waterTileHasPadding(sparse),name!=='Мидгард');
 }
 assert.equal(waterTileHasPadding(sprite('/world-art/asgard-v4/grass.webp')),false);
 assert.equal(midgardWaterSparseUrl('/world-art/asgard-v4/grass.webp'),null);
 assert.equal(midgardWaterSparseUrl('/world-art/unknown-v3/terrain_HkP00zwDo-.webp'),null);
});
test('game canvas and atlas bake at most four water tiles per world; padding is never repeated on cache hits',()=>{
 const savedDoc=global.document,savedPath=global.Path2D;let made=[],scales=0;
 global.Path2D=class{moveTo(){}lineTo(){}closePath(){}};
 global.document={createElement(){const g={setTransform(){},translate(){},scale(){scales++},clip(){},drawImage(){},clearRect(){}};const c={width:0,height:0,getContext(){return g}};made.push(c);return c;}};
 try{for(const name of names){const p=worldArtFor('rmap_current',true,name),images=new Map();
  for(const id of MIDGARD_WATER_IDS)for(const suffix of ['',':sparse'])images.set(id+suffix,sprite(p.urls['t:'+id+suffix]));
  registerMidgardWater(images);const cache=new HexTileCache(),start=made.length;
  for(let q=-100;q<100;q++)for(let r=-50;r<50;r++)for(const id of MIDGARD_WATER_IDS)cache.get(id,images.get(id),q,r);
  assert.equal(made.length-start,4);cache.clear();assert.ok(made.every(c=>c.width===0&&c.height===0));
 }assert.equal(scales,32);
 }finally{global.document=savedDoc;global.Path2D=savedPath;}
});
