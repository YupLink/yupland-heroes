const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {buildSync}=require('esbuild');
const root=path.resolve(__dirname,'../..');
const built=buildSync({entryPoints:[path.join(root,'src/components/castle-live/mine-office/repairGroupQuote.ts')],bundle:true,platform:'node',format:'cjs',write:false});
const compiled={exports:{}};
new Function('module','exports',built.outputFiles[0].text)(compiled,compiled.exports);
const {repairGroupQuote}=compiled.exports;
const cell=(mapId,q,r,lifeAt)=>({mapId,q,r,lifeAt});
const a=cell('alpha',1,2,100),b=cell('beta',1,2,200),c=cell('alpha',3,4,300);
const quote={mines:[{...a,kind:'diamonds',cost:{wood:100,stone:10}},{...b,kind:'diamonds',cost:{wood:100,stone:10}},{...c,kind:'wood',cost:{gold:20}}],cells:[a,b,c],skipped:[{mapId:'alpha',q:9,r:9,reason:'broken'},{mapId:'beta',q:9,r:9,reason:'island'}],total:{wood:200,stone:20,gold:20},short:{wood:50,gold:10},below:.6,serverNow:1000};

test('group scope preserves world identity and only sends quoted cells with lifeAt',()=>{
 const result=repairGroupQuote(quote,[a]);
 assert.deepEqual(result.cells,[a]);
 assert.deepEqual(result.mines,[quote.mines[0]]);
 assert.deepEqual(result.total,{wood:100,stone:10});
 assert.deepEqual(result.short,{}); // 150 wood covers this group despite global shortage.
 assert.equal(result.below,.6);assert.equal(result.serverNow,1000);
});
test('all-world resource group includes both worlds but excludes other resources',()=>{
 const result=repairGroupQuote(quote,[a,b]);
 assert.deepEqual(result.cells,[a,b]);
 assert.deepEqual(result.total,{wood:200,stone:20});
 assert.deepEqual(result.short,{wood:50});
});
test('subset shortage uses balances from the same server estimate',()=>{
 const result=repairGroupQuote(quote,[c]);
 assert.deepEqual(result.total,{gold:20});assert.deepEqual(result.short,{gold:10});
});
test('broken/captured/missing cells never become payable; skipped rows stay scoped',()=>{
 const broken=cell('alpha',9,9,400),gone=cell('alpha',12,12,500);
 const result=repairGroupQuote(quote,[broken,gone]);
 assert.deepEqual(result.cells,[]);assert.deepEqual(result.mines,[]);
 assert.deepEqual(result.total,{});assert.deepEqual(result.short,{});
 assert.deepEqual(result.skipped,[quote.skipped[0]]);
});
test('duplicate scope cells do not duplicate costs and source estimate is immutable',()=>{
 const before=JSON.stringify(quote);
 assert.deepEqual(repairGroupQuote(quote,[a,a]).total,{wood:100,stone:10});
 assert.equal(JSON.stringify(quote),before);
});
test('zero balance and fractional reported shortage cannot enable an unaffordable repair',()=>{
 assert.deepEqual(repairGroupQuote({...quote,short:{wood:200}},[a]).short,{wood:100});
 assert.deepEqual(repairGroupQuote({...quote,short:{wood:150.5}},[a]).short,{wood:50.5});
});
test('scope cannot add a cell absent from the server mine estimate',()=>{
 const rogue=cell('alpha',20,20,700);
 assert.deepEqual(repairGroupQuote({...quote,cells:[...quote.cells,rogue]},[rogue]).cells,[]);
});
