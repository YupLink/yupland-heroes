const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = require('node:path').resolve(__dirname, '../..') + '/';
const ts = require(root + 'node_modules/typescript');
function moduleOf(path, imports) {
  const output = ts.transpileModule(fs.readFileSync(root + path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  vm.runInNewContext(output.outputText, { exports, require: (id) => { if (!(id in imports)) throw Error('Unexpected import: ' + id); return imports[id]; } });
  return exports;
}
(async () => {
 let sqls = [], mode = 'owned';
 const hero = moduleOf('src/server/api/beta-raid/hero-load.ts', {
  '../../db/mcpClient': {mcpExec: async (sql) => {sqls.push(sql); if(mode === 'failed') throw Error('offline DB failure'); return mode === 'missing' ? [] : [{id:'hero-B',level:4,rarity:'rare',equipped:{},squad:[],name:'B'}]; }},
  '../raid-shared': {sqlStr: (s) => "'" + s.replaceAll("'", "''") + "'"},
  './owner': {raidOwner: async () => 'account-A'},
  '../heroes-squad': {SQUAD_SLOTS:4},
 });
 const viewed = await hero.loadOwnedHero('wallet-A', 'hero-B');
 assert.equal(viewed.heroId,'hero-B');
 assert.match(sqls[0], /h.account_id IN \('account-A'\)/);
 assert.match(sqls[0], /h.id = 'hero-B'/);
 assert.doesNotMatch(sqls[0], /selected_at IS NOT NULL/);
 assert(sqls.every(q=>!/^\s*(INSERT|UPDATE|DELETE)/i.test(q)));
 mode='missing'; await assert.rejects(()=>hero.loadOwnedHero('wallet-A','other-hero'),/unavailable/);
 mode='failed'; await assert.rejects(()=>hero.loadOwnedHero('wallet-A','hero-B'),/offline DB failure/);
 await assert.rejects(()=>hero.loadOwnedHero('wallet-A',''),/unavailable/);
 console.log('PASS owned hero selection, owner predicate, missing ownership, DB error propagation, empty id');
 let writes=0;
 const mutation = async () => {writes++;};
 const castle = moduleOf('src/components/beta-raid/castle/useCastle.ts', {
  '@/lib/store': {useAppStore: (fn)=>fn({walletAddress:'wallet-A'})},
  '@tanstack/react-query': {useMutation:(o)=>o,useQuery:()=>({}),useQueryClient:()=>({})},
  'sonner': {toast:{}}, '@/lib/i18n': {useT:()=>()=>''}, '@/lib/humanError': {humanError:()=>''},
  '@/server/api/heroes-read': {listMyHeroes:()=>[]},
  '@/server/api/heroes-select': {getMySelectedHero:()=>({}),selectMyHero:mutation},
  '@/server/api/heroes-gear': {equipArtifact:mutation,unequipArtifact:mutation},
  '@/server/api/beta-raid/market-backpack-read': {}, '@/lib/query': {invalidateHeroQueries:()=>{}},
 });
 for (const opts of [{viewedHeroId:'hero-B'}, {readOnly:true}]) {
  const c=castle.useCastle(opts);
  assert.throws(()=>c.mut.pickHero.mutationFn({id:'hero-B'}),/Read only/);
  assert.throws(()=>c.mut.equip.mutationFn({itemId:'art-A',slotKey:'body'}),/Read only/);
  assert.throws(()=>c.mut.unequip.mutationFn('body'),/Read only/);
 }
 assert.equal(writes,0);
 const legacy=castle.useCastle(); await legacy.mut.equip.mutationFn({itemId:'art-A',slotKey:'body'});assert.equal(writes,1);
 console.log('PASS viewed/readOnly mutation guards; legacy write callback preserved');
})().catch(e=>{console.error(e);process.exitCode=1});
(async () => {
 const sqls=[];let authorized=false;
 const chain={inputValidator:()=>chain,handler:(fn)=>fn};
 const book=moduleOf('src/server/api/beta-raid/spell-book.ts', {
  'zod':require(root+'node_modules/zod'),
  './hero-load':{loadOwnedHero:async(w,id)=>{assert.equal(w,'authenticated-wallet');assert.equal(id,'hero-B');authorized=true;return {heroId:id,name:'B',spec:null,rarity:'rare'};}},
  './hero-power':{heroPowerEnabled:async()=>true,buildHeroPower:()=>({info:{stats:{int:17}}}),loadHeroView:()=>{throw Error('Must not load active hero');}},
  './hero-buff':{loadBuffsFor:async()=>({}),buffHero:(i)=>i},
  './hero-weaken':{loadWeakenFor:async()=>({}),weakenHero:(i)=>i},
  '@tanstack/react-start':{createServerFn:()=>chain},
  '../../db/mcpClient':{mcpExec:async(sql)=>{assert(authorized);sqls.push(sql);return sql.includes('hero_spellbook')?[{spell_id:'spell-B'}]:[];}},
  '../raid-shared':{sqlStr:(s)=>"'"+s+"'"},'./gate':{requireBetaRaid:async()=> 'authenticated-wallet'},
  './spell-tpl':{spellTemplateMap:async()=>new Map(),spellCostFor:()=>({})},
  '@/lib/hero/spellbookSlots':{spellbookSlots:()=>3},'@/lib/hero/spellPower':{spellDiscountPercent:()=>0},
 });
 const result=await book.getOwnedHeroSpellbook({data:{heroId:'hero-B'}});
 assert.equal(result.hero.heroId,'hero-B');assert.equal(result.slots.used,1);
 assert.equal(sqls.length,2);for(const sql of sqls)assert.match(sql,/hero_id = 'hero-B'/);
 console.log('PASS owned spellbook ownership first, learned spells and cooldowns share viewed hero, no active loader');
})().catch(e=>{console.error(e);process.exitCode=1});
(() => {
 const BestGearButton=()=>{}, GearPresets=()=>{};
 const ui=moduleOf('src/components/beta-raid/castle/CastleGearTab.tsx', {
  'react/jsx-runtime':require(root+'node_modules/react/jsx-runtime'),
  'react':{useState:()=>[null,()=>{}]}, 'lucide-react':{Loader2:()=>{},Plus:()=>{}},
  '@/lib/utils':{cn:()=>''}, '@/lib/image':{thumb:()=>''}, '@/lib/i18n':{useT:()=>()=>'',useLang:()=> 'ru'},
  '@/components/heroMeta':{metaLabel:()=>'',stripStatSuffix:()=>''}, '@/components/heroes/heroLabels':{RARITY_COLOR:{}},
  '../BestGearButton':{BestGearButton}, '../gear/GearPresets':{GearPresets}, './GearItemLines':{GearItemLines:()=>{}},
 });
 function types(node,out=[]) {if(!node)return out;if(Array.isArray(node)){for(const v of node)types(v,out);}else if(typeof node==='object'){out.push(node.type);types(node.props?.children,out);}return out;}
 const castle={gear:{data:{heroId:'hero-B',slots:[],available:{},noSlot:[]}},mut:{equip:{},unequip:{}}};
 let found=types(ui.CastleGearTab({castle:{...castle,readOnly:true},atCastle:true}));
 assert(!found.includes(BestGearButton));assert(!found.includes(GearPresets));
 found=types(ui.CastleGearTab({castle:{...castle,readOnly:false},atCastle:true}));
 assert(found.includes(BestGearButton));assert(found.includes(GearPresets));
 console.log('PASS read-only gear tree excludes autoequip and presets containers; legacy mounts both');
})();
