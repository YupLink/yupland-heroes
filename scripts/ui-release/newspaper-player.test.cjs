const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
const newspaper={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/newspaper.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:newspaper,Date,Map,Math,URL});
const issue={issueId:'npi_abcdef',date:'2026-10-30',title:null,imageUrl:'/paper.png',read:false,kiosk:false,canDefer:true};
function load(file,states=[],api={}){
 const jsx=(type,props)=>typeof type==='function'?type(props):({type,props});const exports={};let at=0;
 const react={useState:v=>[states[at++]??v,()=>{}],useRef:v=>({current:v}),useEffect:()=>{}};
 const source=ts.transpileModule(fs.readFileSync(path.join(root,'src/components/newspaper',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{exports,require:p=>p==='react'?react:p==='react/jsx-runtime'?{jsx,jsxs:jsx}:p.endsWith('/i18n')?{useLang:()=> 'ru'}:p.endsWith('/humanError')?{humanError:()=> 'Error'}:p.endsWith('/lib/newspaper')?newspaper:p.endsWith('/paper-map')?api:p==='./Reader'?{Reader:'Reader'}:{},Map,Date,Math,Promise});return exports;
}
test('unloaded image closes without marking read',async()=>{let marks=0,closes=0;const c=load('NewspaperMapReader.tsx',[issue,null,0],{markNewspaperRead:async()=>{marks++;}}).NewspaperMapReader({copyId:'copy',onClose:()=>closes++});await c.props.onBack(false);assert.equal(marks,0);assert.equal(closes,1);});
test('explicit collect marks before returning',async()=>{const order=[];const c=load('NewspaperMapReader.tsx',[issue,null,0],{markNewspaperRead:async d=>{assert.equal(d.data.issueId,issue.issueId);order.push('read');}}).NewspaperMapReader({copyId:'copy',onClose:()=>order.push('close'),onCollected:()=>order.push('close')});await c.props.onCollect();assert.deepEqual(order,['read','close']);});
test('defer does not mark read',async()=>{const order=[];const c=load('NewspaperMapReader.tsx',[issue,null,0],{markNewspaperRead:async()=>order.push('read'),deferNewspaper:async()=>order.push('defer')}).NewspaperMapReader({copyId:'copy',onClose:()=>order.push('close'),onCollected:()=>order.push('close')});await c.props.onDefer();assert.deepEqual(order,['defer','close']);});
test('failed mutation keeps reader open',async()=>{let closes=0;const c=load('NewspaperMapReader.tsx',[issue,null,0],{markNewspaperRead:async()=>{throw Error('offline');}}).NewspaperMapReader({copyId:'copy',onClose:()=>closes++});await assert.rejects(c.props.onCollect());assert.equal(closes,0);});
function find(node,match){if(!node)return null;if(Array.isArray(node)){for(const n of node){const result=find(n,match);if(result)return result;}return null;}if(typeof node!=='object')return null;if(match(node))return node;return find(node.props?.children,match);}
test('reader blocks repeated defer while pending',async()=>{let calls=0,done;const wait=new Promise(r=>done=r);const view=load('Reader.tsx').Reader({issue,onBack:()=>{},onDefer:async()=>{calls++;await wait;}});const b=find(view,n=>n.type==='button'&&n.props.className==='np-defer');b.props.onClick();b.props.onClick();assert.equal(calls,1);done();await wait;});
test('read issues have no defer button and no kiosk hint',()=>{const view=load('Reader.tsx').Reader({issue:{...issue,read:true},onBack:()=>{},onDefer:()=>{}});assert.equal(find(view,n=>n.props?.className==='np-defer'),null);assert.equal(find(view,n=>n.props?.className==='np-defer-hint'),null);});
test('without kiosk, defer stays available with the agreed explanation',()=>{const view=load('Reader.tsx').Reader({issue,onBack:()=>{},onDefer:()=>{}});assert.ok(find(view,n=>n.props?.className==='np-defer'));assert.ok(find(view,n=>n.props?.className==='np-defer-hint'));});
function drawHarness(){
 const exports={};const source=ts.transpileModule(fs.readFileSync(path.join(root,'src/components/newspaper/drawNewspapers.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{exports,require:()=>({R:10})});const calls=[];
 const scene={images:new Map(),g:{fillRect:()=>calls.push('fill'),strokeRect:()=>{},drawImage:()=>calls.push('image')},view:{minX:0,maxX:100,minY:0,maxY:100},voidCells:new Set(),revealAll:false,seen:{hasIndex:()=>true},fogZones:{active:new Set([0]),bright:new Set()}};
 const store={indexOfKey:()=>0,geom:{x:[50],y:[50]}};
 return {scene,store,calls,draw:()=>exports.drawNewspapers(scene,store,[{id:'copy',issueId:'issue',q:1,r:1,deferred:false}])};
}
test('newspaper map layer respects fog and void cells',()=>{const h=drawHarness();h.scene.fogZones.active.clear();h.draw();assert.equal(h.calls.length,0);h.scene.revealAll=true;h.scene.voidCells.add('1,1');h.draw();assert.equal(h.calls.length,0);});
test('newspaper map layer draws visible asset and skips outside viewport',()=>{const h=drawHarness();h.scene.images.set('newspaper',{complete:true,naturalWidth:128});h.draw();assert.deepEqual(h.calls,['image']);h.scene.view.maxX=20;h.draw();assert.deepEqual(h.calls,['image']);});

