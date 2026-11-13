const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
const newspaper={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/newspaper.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:newspaper,Date,Map,Math,URL});
function load(file,mocks){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(n in mocks)return mocks[n];throw Error(n);},Date,Map,Math,console,setTimeout,clearTimeout});return exports;}
const jsx=(type,props)=>typeof type==='function'?type(props):({type,props});const runtime={'react/jsx-runtime':{jsx,jsxs:jsx}};
const lang={'@/lib/i18n':{useLang:()=> 'ru'},'@/lib/humanError':{humanError:()=> 'failed'},'@/lib/newspaper':newspaper};
function nodes(n){return !n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];}
function reader(){const states=[],refs=[];let cursor=0,rc=0;const R=load('src/components/newspaper/Reader.tsx',{...runtime,...lang,react:{useEffect:()=>{},useRef:v=>refs[rc++]??(refs[rc-1]={current:v}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=v;return [states[i],n=>states[i]=typeof n==='function'?n(states[i]):n];}}}).Reader;let counts={back:0,collect:0,defer:0};const props={issue:{issueId:'npi_aaaaaa',date:'2026-11-03',title:'Paper',imageUrl:'/paper.png',read:false,canDefer:true,kiosk:true},onBack:()=>counts.back++,onCollect:()=>counts.collect++,onDefer:()=>counts.defer++};const render=()=>{cursor=rc=0;return R(props);};return {render,counts,props};}
const settle=()=>new Promise(r=>setImmediate(r));
test('Back and Escape never mark read, even after image load',async()=>{const r=reader();nodes(r.render()).find(n=>n.type==='img').props.onLoad();let tree=r.render();nodes(tree).find(n=>n.props?.['aria-label']==='Назад').props.onClick();await settle();tree=r.render();tree.props.onKeyDown({key:'Escape',stopPropagation(){}});await settle();assert.deepEqual(r.counts,{back:2,collect:0,defer:0});});
test('Collect waits for image and does not double submit; defer stays separate',async()=>{const r=reader();let tree=r.render();let b=nodes(tree).find(n=>n.props?.className==='np-collect');assert.equal(b.props.disabled,true);b.props.onClick();await settle();assert.equal(r.counts.collect,0);nodes(tree).find(n=>n.type==='img').props.onLoad();tree=r.render();b=nodes(tree).find(n=>n.props?.className==='np-collect');assert.equal(b.props.disabled,false);b.props.onClick();b.props.onClick();await settle();assert.equal(r.counts.collect,1);nodes(r.render()).find(n=>n.props?.className==='np-defer').props.onClick();await settle();assert.equal(r.counts.defer,1);assert.equal(r.counts.back,0);});
test('Failure keeps reader open and permits retry',async()=>{const r=reader();r.props.onCollect=()=>{throw Error('network');};nodes(r.render()).find(n=>n.type==='img').props.onLoad();nodes(r.render()).find(n=>n.props?.className==='np-collect').props.onClick();await settle();assert.equal(r.counts.back,0);assert.equal(nodes(r.render()).find(n=>n.props?.role==='alert').props.children,'failed');assert.equal(nodes(r.render()).find(n=>n.props?.className==='np-collect').props.disabled,false);});
test('near query excludes read AND deferred, scoped to account and issue; never deletes copies',()=>{const sql=load('src/server/api/newspaper/paper-sql.ts',{'@/server/api/raid-shared':{sqlStr:s=>"'"+s+"'"},
'@/server/api/beta-raid/sight/sight-sql':{sightRadiusSql:()=> '20'},'@/lib/lootBag':{LOOT_BAG_SEE:5},'@/server/api/beta-raid/cell-sql':{WATER_SQL:'false',buildingHeldSql:()=> 'false'},'@/server/api/beta-raid/voidCells':{voidSql:()=> 'false'},'@/server/api/beta-raid/loot-bag/bag-read-sql':{distSql:()=> '0',hiddenSql:()=> ''}});
const query=sql.nearSql({account:'alice',activeMapId:'world'});assert.match(query,/rd\.account_id = 'alice' AND rd\.issue_id = x\.issue_id/);assert.match(query,/AND rd\.read_at IS NULL AND rd\.deferred_at IS NULL/);assert.doesNotMatch(query,/DELETE|UPDATE/);
for(const q of [sql.readSql('alice','npi_aaaaaa',true),sql.deferSql('alice','npi_aaaaaa')]){assert.match(q,/rd\.account_id = 'alice' AND rd\.issue_id = 'npi_aaaaaa'/);assert.doesNotMatch(q,/DELETE/);}
});
test('Map cache removes every copy of this issue after cancellation, preserves other issues',async()=>{
 let selected=null;const calls=[];let cache=[{id:'a',issueId:'npi_aaaaaa',q:0,r:0},{id:'b',issueId:'npi_aaaaaa',q:1,r:0},{id:'c',issueId:'npi_bbbbbb',q:2,r:0}];
 let collected=[];const qc={getQueryData:()=>collected,setQueryData:(_,fn)=>{collected=fn(collected)},cancelQueries:async()=>calls.push('cancel'),setQueriesData:(_,fn)=>{calls.push('filter');cache=fn(cache)},invalidateQueries:async()=>calls.push('invalidate')};
 const hook=load('src/components/newspaper/useNewspapers.tsx',{...runtime,react:{useEffect:()=>{},useMemo:f=>f(),useState:()=>[selected,v=>selected=v]},'@tanstack/react-query':{useQuery:o=>({data:o.queryKey[0]==='session'?{wallet:'alice',telegramId:1}:o.queryKey[0]==='newspapers-collected'?collected:cache}),useQueryClient:()=>qc},sonner:{toast:{error:()=>{}}},'@/lib/i18n':{useT:()=>s=>s},'@/lib/raid/hex':{hexDistance:()=>0},'@/server/api/newspaper/paper-map':{},'@/server/api/user-auth':{},'./NewspaperMapReader':{NewspaperMapReader:'map-reader'},'./NewspaperFrame':{NewspaperFrame:'frame'}}).useNewspapers;
 assert.equal(hook('world',{q:0,r:0},{}).tap(0,0),true);
 const tree=hook('world',{q:0,r:0},{}).sheet;
 await nodes(tree).find(n=>n.type==='map-reader').props.onCollected('npi_aaaaaa');
 assert.deepEqual(calls,['cancel','filter','invalidate']);assert.equal(cache.length,1);assert.equal(cache[0].id,'c');assert.equal(selected,null);
});
test('Map reader notifies collection only after server success; closing never writes',async()=>{
 let stateIndex=0;const issue={issueId:'npi_aaaaaa'};const calls=[];let fail=false;
 const Component=load('src/components/newspaper/NewspaperMapReader.tsx',{...runtime,...lang,react:{useEffect:()=>{},useState:()=>{const i=stateIndex++;return[i===0?issue:null,()=>{}]}},'./Reader':{Reader:'reader'},'@/server/api/newspaper/paper-map':{markNewspaperRead:async()=>{calls.push('read');if(fail)throw Error('failed')},deferNewspaper:async()=>{calls.push('defer');if(fail)throw Error('failed')}}}).NewspaperMapReader;
 const tree=Component({copyId:'a',onClose:()=>calls.push('close'),onCollected:id=>calls.push(id)});
 tree.props.onBack();assert.deepEqual(calls,['close']);calls.length=0;
 await tree.props.onCollect();assert.deepEqual(calls,['read','npi_aaaaaa']);calls.length=0;
 await tree.props.onDefer();assert.deepEqual(calls,['defer','npi_aaaaaa']);calls.length=0;
 fail=true;await assert.rejects(tree.props.onCollect());assert.deepEqual(calls,['read']);calls.length=0;await assert.rejects(tree.props.onDefer());assert.deepEqual(calls,['defer']);
});

