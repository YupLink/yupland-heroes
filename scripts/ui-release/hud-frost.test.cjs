const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function setup(file,temperature='very-cold'){
 let reads=0,scans=0,writes=0,scheduled=0,cleanup,mutate,resize,visibility;const frames=new Map();let id=0;
 function style(){const data={position:'',setProperty(k,v){data[k]=v;writes++},getPropertyValue(k){return data[k]||''}};return new Proxy(data,{set(o,k,v){o[k]=v;writes++;return true}})}
 class El{
  constructor(name='',surface=false){this.className=name;this.surface=surface;this.children=[];this.parent=null;this.style=style();this.dataset={};this.classList={contains:c=>this.className===c};this.rect={top:10,left:10,width:100,height:40};}
  append(n){n.parent=this;this.children.push(n)}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null}
  contains(n){return this===n||this.children.some(c=>c.contains(n))}
  querySelectorAll(selector){if(this===host)scans++;let result=[];for(const c of this.children){if(c.matches(selector))result.push(c);result.push(...c.querySelectorAll(selector))}return result}
  querySelector(selector){if(selector==='svg'||selector==='.raid-weather__glass')return null;return this.querySelectorAll(selector)[0]||null}
  matches(selector){if(selector==='.raid-energy__buy')return false;return this.surface&&selector.includes('.'+this.className)}
  closest(){return null}getAttribute(){return null}setAttribute(){}
  getBoundingClientRect(){reads++;return this.className==='hud-frost-coating'&&this.parent?this.parent.rect:this.rect}
 }
 const host=new El(),root=new El();root.parentElement=host;
 const a=new El('raid-live-balances',true),b=new El('raid-map-nav__button',true),nested=new El('raid-live-portrait',true);host.append(a);host.append(b);a.append(nested);
 const document={hidden:false,createElement:()=>new El(),addEventListener:(n,fn)=>visibility=fn,removeEventListener(){}};
 const globals={Element:El,document,getComputedStyle:()=>({position:'relative',borderTopWidth:'2px',borderLeftWidth:'2px',borderTopLeftRadius:'12px',clipPath:'none'}),requestAnimationFrame:fn=>{scheduled++;frames.set(++id,fn);return id},cancelAnimationFrame:n=>frames.delete(n),MutationObserver:class{constructor(fn){mutate=fn}observe(){}disconnect(){}},ResizeObserver:class{constructor(fn){resize=fn}observe(){}unobserve(){}disconnect(){}}};
 const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 const req=n=>n==='react'?{useEffect:fn=>cleanup=fn(),useRef:()=>({current:root})}:n==='react/jsx-runtime'?{jsx:()=>null}:{};
 vm.runInNewContext('(function(require,module,exports){'+code+'})',globals)(req,mod,mod.exports);mod.exports.FrostHud({temperature});
 const flush=()=>{for(const [id,fn]of [...frames]){frames.delete(id);fn()}};
 if(resize){resize([{target:a},{target:b},{target:nested}]);flush()}
 return {host,a,b,nested,El,document,flush,get counters(){return {reads,scans,writes,scheduled}},get pending(){return frames.size},mutate:records=>mutate?.(records),resize:entries=>resize?.(entries),cleanup:()=>cleanup?.(),resume:()=>visibility?.(),textTicks(n){for(let i=0;i<n;i++){mutate?.([{type:'childList',target:a,addedNodes:[{}],removedNodes:[{}]}]);flush()}}};
}
const current='src/components/beta-raid/weather/visuals/FrostHud.tsx';
test('1000 text-only HUD ticks do no frost scans, measurements or scheduled work',()=>{const s=setup(current),before=s.counters;s.textTicks(1000);assert.deepEqual(s.counters,before);s.cleanup()});
test('only resized surface is measured; unchanged dimensions produce no style writes',()=>{const s=setup(current),before=s.counters;s.resize([{target:s.b}]);s.flush();assert.equal(s.counters.reads-before.reads,1);assert.equal(s.counters.scans,before.scans);assert.equal(s.counters.writes,before.writes);s.cleanup()});
test('new nested button attaches once, parent cut-out updates; own coatings do not loop',()=>{const s=setup(current),c=new s.El('raid-map-nav__button',true);s.a.append(c);s.mutate([{type:'childList',target:s.a,addedNodes:[c],removedNodes:[]}]);s.flush();assert.equal(c.children.length,1);const layer=c.children[0],before=s.counters;s.mutate([{type:'childList',target:c,addedNodes:[layer],removedNodes:[]}]);s.flush();assert.deepEqual(s.counters,before);assert.ok(s.a.children.find(x=>x.className==='hud-frost-coating').style.maskImage.includes('svg'));s.cleanup();assert.equal(c.children.length,0)});
test('hidden work waits for visibility and teardown cancels pending update; warm has none',()=>{const s=setup(current);s.document.hidden=true;s.resize([{target:s.b}]);assert.equal(s.pending,0);s.document.hidden=false;s.resume();assert.equal(s.pending,1);s.cleanup();assert.equal(s.pending,0);const warm=setup(current,'warm');assert.equal(warm.pending,0);assert.equal(warm.counters.reads,0);warm.cleanup()});

test('sound and effects mounted after load receive one coat; text ticks stay idle',()=>{const s=setup(current);for(const name of ['sound-drop__frost-surface','castle-main-hud__effects-pill','castle-main-hud__effects-toggle--icon']){const el=new s.El(name,true);s.host.append(el);s.mutate([{type:'childList',target:s.host,addedNodes:[el],removedNodes:[]}]);s.flush();assert.equal(el.children.filter(x=>x.className==='hud-frost-coating').length,1);}const before=s.counters;s.textTicks(1000);assert.deepEqual(s.counters,before);s.cleanup();assert.equal(s.pending,0)});

test('late hero action mounted at scale .48 keeps layout-sized frost without polling',()=>{const s=setup(current),el=new s.El('raid-main-hand',true);el.offsetWidth=44;el.offsetHeight=44;el.rect={top:10,left:10,width:21.12,height:21.12};el.closest=selector=>selector.includes('raid-lower-actions__item')?{}:null;s.host.append(el);s.mutate([{type:'childList',target:s.host,addedNodes:[el],removedNodes:[]}]);s.flush();const layer=el.children[0];assert.equal(layer.style['--frost-width'],'44px');assert.equal(layer.style['--frost-height'],'44px');assert.equal(layer.dataset.round,'true');el.rect.width=el.rect.height=44;const before=s.counters;s.textTicks(1000);assert.deepEqual(s.counters,before);assert.equal(s.pending,0);s.cleanup()});
