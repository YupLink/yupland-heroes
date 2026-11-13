const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const {checkFiles,checkStyles}=require('./contracts.cjs');
const {execFileSync}=require('node:child_process');
const paths=['src/components/chips/auctions/auction-approved.css','src/components/chips/auctions/auction-screen.css','src/components/admin/AuctionsAdminPanel.tsx','src/components/chips/auctions/AuctionOverlay.tsx','src/components/castle-live/bank/BankOverlay.tsx'];
const snapshot=process.env.UI_CONTRACT_SNAPSHOT ? JSON.parse(fs.readFileSync(process.env.UI_CONTRACT_SNAPSHOT,'utf8')) : {
 files:execFileSync('git',['ls-tree','-r','--name-only','HEAD'],{encoding:'utf8'}).trim().split('\n'),
 sources:Object.fromEntries(paths.map(p=>[p,fs.readFileSync(p,'utf8')]))
};
const read=p=>snapshot.sources[p];
test('current SHA CSS contracts pass',()=>assert.deepEqual(checkStyles(read),[]));
test('PR183 broad window selector fails',()=>{
 const errors=checkStyles(p=>read(p).replaceAll('.auction-window.auction-window--approved','.auction-window'));
 assert(errors.some(e=>e.includes('Unscoped')));
});
test('missing admin override fails',()=>{
 const errors=checkStyles(p=>read(p).replace('.auction-lot--admin{display:block}', '.auction-lot--admin{}'));
 assert(errors.some(e=>e.includes('Admin lot block')));
});
test('bank player-root leak fails',()=>{
 const errors=checkStyles(p=>p.endsWith('bank/BankOverlay.tsx')?read(p).replace('className="auction-window"','className="auction-window auction-window--approved"'):read(p));
 assert(errors.some(e=>e.includes('Bank incorrectly')));
});
function imports(missing){
 const files=new Set(snapshot.files);
 const entry='src/__release_control.ts';files.add(entry);
 if(missing)files.delete(missing);
 const sources={ [entry]: 'import "@/components/castle-live/castlePaths"; export {x} from "./release-export"; const lazy=()=>import("./release-lazy"); const image="/auction/house.webp";', 'src/release-export.ts':'export const x=1;', 'src/release-lazy.ts':'export default 1;', 'src/components/castle-live/castlePaths.ts':'export const paths=[];' };
 files.add('src/release-export.ts');files.add('src/release-lazy.ts');
 return checkFiles(files,p=>sources[p],[entry]).errors;
}
test('tracked dependency/resource control passes',()=>assert.deepEqual(imports(),[]));
test('PR180 missing castlePaths fails even if local file exists',()=>assert(imports('src/components/castle-live/castlePaths.ts').some(e=>e.includes('castlePaths'))));
test('missing public image fails',()=>assert(imports('public/auction/house.webp').some(e=>e.includes('house.webp'))));
test('dynamic import and reexport omissions fail',()=>{
 for(const statement of ['export {x} from "./absent"','const f=()=>import("./absent")'])assert.equal(checkFiles(new Set(['src/a.ts']),()=>statement,['src/a.ts']).errors.length,1);
});
test('actual CastlePathLayer dependency graph passes; deleted castlePaths fails',()=>{
 const entry='src/components/castle-live/CastlePathLayer.tsx';
 const get=p=>snapshot.sources[p] ?? fs.readFileSync(p,'utf8');
 const files=new Set(snapshot.files);
 assert.deepEqual(checkFiles(files,get,[entry]).errors,[]);
 files.delete('src/components/castle-live/castlePaths.ts');
 assert(checkFiles(files,get,[entry]).errors.some(e=>e.includes('missing tracked dependency ./castlePaths')));
});
test('actual CSS resource references pass; absent font fails',()=>{
 const entry='src/components/chips/auctions/auction-screen.css';
 const path=require('node:path').posix;
 const fontRefs=[...read(entry).matchAll(/url\(\s*['"]?([^)'"\s]+\.(?:woff2?|ttf|otf))['"]?\s*\)/gi)].map(m=>m[1]);
 assert(fontRefs.length>0,'The stylesheet must reference at least one font');
 assert.deepEqual(checkFiles(new Set(snapshot.files),read,[entry]).errors,[]);
 for(const ref of new Set(fontRefs)){
  const files=new Set(snapshot.files);
  const font=path.normalize(path.join(path.dirname(entry),ref));
  assert(files.delete(font),`Expected tracked font: ${font}`);
  assert(checkFiles(files,read,[entry]).errors.some(e=>e.includes(ref)),`Missing font must fail: ${ref}`);
 }
});
test('compound base selector cannot change bank lot layout',()=>{
 const errors=checkStyles(p=>p.endsWith('auction-screen.css')?read(p)+'\n.bank .auction-lot:hover{display:inline-grid}':read(p));
 assert(errors.some(e=>e.includes('Base lot layout')));
});
test('comment cannot substitute for actual player root class',()=>{
 const errors=checkStyles(p=>p.endsWith('AuctionOverlay.tsx')?read(p).replace('auction-window auction-window--approved','auction-window')+'\n// auction-window--approved':read(p));
 assert(errors.some(e=>e.includes('Player root marker')));
});
test('comment cannot substitute for actual admin lot class',()=>{
 const errors=checkStyles(p=>p.endsWith('AuctionsAdminPanel.tsx')?read(p).replace('auction-lot auction-lot--admin','auction-lot')+'\n// auction-lot--admin':read(p));
 assert(errors.some(e=>e.includes('Admin lot marker')));
});

test('extension fragments are not resource paths, but explicit missing paths fail',()=>{
 const entry='src/a.ts';
 const files=new Set([entry]);
 assert.deepEqual(checkFiles(files,()=> 'const png=".png"; const webp=".webp";', [entry]).errors,[]);
 for(const ref of ['./missing.png','/missing.webp']) assert.equal(checkFiles(files,()=>`const image="${ref}"`,[entry]).errors.length,1);
});
