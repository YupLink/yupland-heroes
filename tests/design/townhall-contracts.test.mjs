import {readFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const base=path.resolve('src/components/castle-live/town-hall');
function load(name){const code=ts.transpileModule(readFileSync(path.join(base,name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const module={exports:{}};new Function('require','module','exports',code)((id)=>load(id.replace('./','')),module,module.exports);return module.exports;}
const {canExecute,validPrice}=load('guards');
const model={revision:'v1',level:1,used:0,buildings:Array.from({length:8},(_,i)=>({id:'base'+i,level:'—'})),resources:{gold:100,wood:100},levels:[{level:1,purchaseLimit:8,priceId:'capacity:1'},{level:2,purchaseLimit:15,priceId:'capacity:2'}],prices:{'building:11':[{currency:'wood',amount:20}],'capacity:2':[{currency:'gold',amount:50}]},decor:[],buildingStyles:[],activeBuildingStyle:null,upgrades:{}};
const buy={kind:'build',id:'temple',priceId:'building:11',revision:'v1'};
test('base roster is not mistaken for occupied purchase capacity',()=>assert.equal(canExecute(model,buy),true));
test('unknown state, price, stale revision and full capacity block spending',()=>{for(const m of [null,{...model,prices:{}},{...model,revision:'v2'},{...model,used:8}])assert.equal(canExecute(m,buy),false);});
test('owned alpha temple, inadequate balance and server restrictions block purchase',()=>{for(const m of [{...model,buildings:[{id:'temple',level:'—'}]},{...model,resources:{wood:19}},{...model,blockedPrices:['building:11']}])assert.equal(canExecute(m,buy),false);});
test('capacity purchase targets only the server next level and its price',()=>{assert.equal(canExecute(model,{kind:'capacity',level:2,priceId:'capacity:2',revision:'v1'}),true);assert.equal(canExecute(model,{kind:'capacity',level:3,priceId:'capacity:2',revision:'v1'}),false);});
test('invalid or duplicate resource prices cannot enable transactions',()=>{for(const p of [null,[],[{currency:'gold',amount:0}],[{currency:'gold',amount:-1}],[{currency:'gold',amount:1.5}],[{currency:'gems',amount:1}],[{currency:'gold',amount:1},{currency:'gold',amount:2}]])assert.equal(validPrice(p),null);});
test('unowned style cannot be applied, even with a valid price',()=>assert.equal(canExecute(model,{kind:'apply-style',id:'winter',revision:'v1'}),false));
test('unconfigured base upgrades are not maximum or purchasable',()=>assert.equal(canExecute(model,{kind:'upgrade',id:'base0',level:2,priceId:'capacity:2',revision:'v1'}),false));
test('game UI contains no preview account mutations or URL navigation',()=>{for(const file of ['TownHallCatalogue.tsx','TownHallOwnedBuildings.tsx','TownHallPresentation.tsx'])assert.doesNotMatch(readFileSync(path.join(base,file),'utf8'),/sessionStorage|createRoot|window.location|setConfirmedLevel/);});
