const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve, dirname} = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = resolve(__dirname,'../..');
const market = resolve(root,'src/components/beta-raid/market');
const memo = new Map();
function load(file) {
  if(memo.has(file))return memo.get(file);
  const mod={exports:{}};
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext('(function(require,module,exports){'+code+'})',{})(id=>{
    if(id==='./exchange')return {priceNames:()=>({})};
    if(id==='./townQuote')return {cityCartTotals:()=>new Map()};
    if(id.startsWith('.'))return load(resolve(dirname(file),id+'.ts'));
    throw new Error('Unexpected dependency: '+id);
  },mod,mod.exports);
  memo.set(file,mod.exports);return mod.exports;
}
const {ownedStock,hasOwnedStock}=load(resolve(market,'sellInventory.ts'));
const source=data=>({data,isPending:false,isError:false});
function sources(){return {
  stacks:source({stacks:[{stackKey:'custom:cst_bread',count:1200},{stackKey:'hero:named',count:2},{stackKey:'pack:p',count:3},{stackKey:'boss:b',count:4},{stackKey:'custom:mkt_old',count:5}]}),
  arts:source([{templateId:'a',rarity:'common',count:2,wear:0}]),
  wornArts:source([{templateId:'a',rarity:'common',count:2,wear:0},{templateId:'a',rarity:'common',count:3,wear:70}]),
  heroes:{rare:source([{itemId:'h1',rarity:'rare'}])},have:()=>42,
};}
const item={kind:'custom',refId:'cst_bread',side:'sell',giveAmount:10,buyable:true,remaining:1};

test('ownership uses the returned backpack count without buyout, bundle or cart limits',()=>{
  const stock=ownedStock(item,sources());assert.equal(stock.count,1200);assert.equal(hasOwnedStock(stock),true);
  assert.equal(hasOwnedStock(ownedStock({...item,remaining:0,buyable:false,giveAmount:2000},sources())),true);
  assert.equal(hasOwnedStock({count:1}),true);assert.equal(hasOwnedStock({count:0}),false);
});
test('existing exact backpack keys work, including old market keys; names are not guessed',()=>{
  const s=sources();assert.equal(ownedStock({...item,refId:'mkt_old'},s).count,5);
  assert.equal(ownedStock({...item,refId:'different-id',name:'Bread'},s).count,null);
  assert.equal(ownedStock({...item,kind:'hero',refId:'named'},s).count,2);
  assert.equal(ownedStock({...item,kind:'pack',refId:'p'},s).count,3);
  assert.equal(ownedStock({...item,kind:'boss',refId:'b'},s).count,4);
});
test('missing, loading and failed reads do not invent a zero or an owned border',()=>{
  const s=sources();assert.equal(ownedStock(item,{...s,stacks:source({stacks:[]})}).count,null);
  const pending=ownedStock(item,{...s,stacks:{isPending:true,isError:false}});assert.equal(pending.count,null);assert.equal(pending.loading,true);assert.equal(hasOwnedStock(pending),false);
  const failed=ownedStock(item,{...s,stacks:{isPending:false,isError:true}});assert.equal(failed.count,null);assert.equal(failed.retryable,true);assert.equal(hasOwnedStock(failed),false);
});
test('artifact and hero ownership uses existing free inventory sources',()=>{
  const s=sources();assert.equal(ownedStock({...item,kind:'art',refId:'a'},s).count,2);
  assert.equal(ownedStock({...item,kind:'art',refId:'art_any_common'},s).count,5);
  assert.equal(ownedStock({...item,kind:'hero',refId:'hero_any_rare'},s).count,1);
  const heroes=Array.from({length:200},(_,i)=>({itemId:String(i),rarity:'rare'}));
  const limited=ownedStock({...item,kind:'hero',refId:'hero_any_rare'},{...s,heroes:{rare:source(heroes)}});
  assert.equal(limited.count,200);assert.equal(limited.limited,true);
});
test('resource balances preserve the existing unknown state',()=>{
  const it={...item,kind:'resource',refId:'wood'},s=sources();assert.equal(ownedStock(it,s).count,42);
  assert.equal(ownedStock(it,{...s,have:()=>null}).count,null);
});
test('price icons use the existing small-image proxy while local resource URLs stay intact',()=>{
  const image=load(resolve(root,'src/lib/image.ts'));
  assert.equal(image.thumb('/uploads/tasks/S88MxJiW9x.png',48),'/api/img?u=%2Fuploads%2Ftasks%2FS88MxJiW9x.png&w=48');
  assert.equal(image.thumb('/resources/gold.webp',48),'/resources/gold.webp');
  assert.equal(image.thumb('/api/img?u=x&w=96',48),'/api/img?u=x&w=96');
});
