const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=process.cwd(),cache=new Map();
// Run the real pure modules; artwork catalogues are fixtures, not API ownership.
function load(file){
 const full=path.resolve(root,file);if(cache.has(full))return cache.get(full).exports;
 const mod={exports:{}};cache.set(full,mod);
 const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const req=id=>{
  if(id==='./modularBuildingRegistry')return {isOwnedBuilding:id=>id==='mine_office',savedBuildingTemplate:id=>id==='mine_office'?profiles.building(id,id,'fixture',900,1000,190,.4):null};
  if(id==='./modularDecorCatalog')return {createDecor:()=>null};
  if(id==='./modularBuildingStyles')return {buildingStyleIds:['base']};
  if(id==='./castlePathStyles')return {castlePathStyles:[{id:'base'}]};
  if(id==='./castleTerritoryStyles')return {castleTerritoryStyles:[{id:'base'}]};
  if(id.startsWith('@/'))return load('src/'+id.slice(2)+'.ts');
  if(id.startsWith('.'))return load(path.relative(root,path.resolve(path.dirname(full),id))+'.ts');
  return require(id);
 };
 new Function('require','module','exports',code)(req,mod,mod.exports);return mod.exports;
}
const profiles=load('src/components/castle-live/modularCastleProfiles.ts');
const layout=load('src/components/castle-live/modularCastleLayout.ts');
const owned=load('src/components/castle-live/modularOwnedLayout.ts');
const placement=load('src/components/castle-live/modularPlacement.ts');
const schema=load('src/server/api/castle-layout/layout-schema.ts');
const appearance=load('src/components/castle-live/castleAppearanceAccess.ts');
const office=()=>profiles.building('mine_office','Mine office','fixture',900,1000,190,.4);
test('new API-owned building stays in common catalogue without occupying map',()=>{
 const b=owned.withOwnedLayout([],'mine_office',office())[0];assert.equal(b.placed,false);assert.equal(b.size,330);
 assert.equal(placement.placementProblem(b,[b]),null);
 assert.deepEqual(owned.withOwnedLayout([b],'mine_office',null),[]);
 assert.equal(owned.withOwnedLayout([],'bank',{...office(),id:'bank'})[0].placed,true);
});
test('unplaced survives server parse, decoding, styling and ownership hydration',()=>{
 const b=owned.withOwnedLayout([],'mine_office',office())[0];
 const remote=schema.parseSaveInput({revision:0,layout:layout.serializeModularLayout([b])});
 const decoded=layout.decodeModularLayout(remote.layout);
 const hydrated=owned.withOwnedLayout(decoded,'mine_office',office()).find(b=>b.id==='mine_office');
 assert.equal(hydrated.placed,false);assert.equal(hydrated.size,330);
 assert.equal(appearance.visibleAppearance([hydrated],appearance.castleAppearanceAccess())[0].placed,false);
});
test('placed size 1000%, expanded coordinates and flip round trip through server',()=>{
 const b=owned.withOwnedLayout([],'mine_office',office())[0];b.placed=true;b.x=-1400;b.y=1300;b.mirrored=true;profiles.resizeBuilding(b,3300);
 const saved=schema.parseSaveInput({revision:1,layout:layout.serializeModularLayout([b])});
 const hydrated=owned.withOwnedLayout(layout.decodeModularLayout(saved.layout),'mine_office',office()).find(b=>b.id==='mine_office');
 assert.equal(hydrated.placed,true);assert.equal(hydrated.size,3300);assert.equal(hydrated.x,-1400);assert.equal(hydrated.mirrored,true);
 assert.equal(placement.placementProblem(hydrated,[hydrated]),null);
});
test('legacy saved size and position stay unchanged, no flag means already placed',()=>{
 const b=office();b.size=220;b.baseSize=190;b.x=1000;
 const hydrated=owned.withOwnedLayout([b],'mine_office',office())[0];
 assert.equal(hydrated.placed,true);assert.equal(hydrated.size,220);assert.equal(hydrated.x,1000);
 const decoded=layout.decodeModularLayout(layout.serializeModularLayout([hydrated])).find(b=>b.id==='mine_office');
 assert.equal(decoded.size,220);assert.equal(decoded.placed,true);
});
test('collision ignores catalogue-only entries, rejects occupied or outside ground',()=>{
 const a=office(),b={...office(),id:'second'};assert.equal(placement.placementProblem(a,[a,b]),'occupied');
 b.placed=false;assert.equal(placement.placementProblem(a,[a,b]),null);
 a.x=3400;assert.equal(placement.placementProblem(a,[a]),'bounds');
 a.x=-1800;assert.equal(placement.placementProblem(a,[a]),null);
});
test('server bounds remain finite and capped; ownership checks are not bypassed',()=>{
 const item=layout.serializeModularLayout([office()])[0];
 for(const patch of [{size:6001},{size:Infinity},{x:3401},{x:-2601},{placed:'false'}])assert.throws(()=>schema.parseSaveInput({revision:0,layout:[{...item,...patch}]}));
 const endpoint=fs.readFileSync('src/server/api/castle-layout/castle-layout.ts','utf8');
 assert.match(endpoint,/await assertLayoutRights\(wallet, account, data.layout\)/);
 assert.match(endpoint,/updateLayoutSql\(account, data.revision, json, wallet\)/);
});
