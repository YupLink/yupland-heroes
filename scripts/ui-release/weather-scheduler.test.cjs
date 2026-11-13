const {test}=require('node:test');const assert=require('node:assert/strict');const ts=require('typescript');const fs=require('node:fs');const vm=require('node:vm');
const source=fs.readFileSync('src/components/beta-raid/weather/visuals/WeatherLayer.tsx','utf8');
function setup(kind,reduced=false,rainPoint){
 let now=0,next=0,paints=0,strokes=0,gradients=0,draws=0;const drawPositions=[];const timers=new Map(),events=new Map();let cleanup,intersection;
 const element={style:{},querySelectorAll:()=>[],querySelector:()=>({setAttribute(){}})};
 const ctx=new Proxy({clearRect(){paints++},stroke(){strokes++},drawImage(...args){draws++;drawPositions.push(args.slice(1))},createLinearGradient(){gradients++;return {addColorStop(){}}},createRadialGradient(){gradients++;return {addColorStop(){}}}},{get:(t,k)=>k in t?t[k]:()=>({addColorStop(){}}),set:(t,k,v)=>(t[k]=v,true)});
 const canvas={width:0,height:0,getContext:()=>ctx};ctx.canvas=canvas;
 const scene={dataset:{},getBoundingClientRect:()=>({width:390,height:844}),querySelector:s=>s==='canvas'?canvas:element};
 const media={matches:reduced,addEventListener(){},removeEventListener(){}};
 const doc={createElement:()=>({width:0,height:0,getContext:()=>ctx}),hidden:false,addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)};
 const camera={rainPoint,offsetRef:{current:{x:0,y:0}},scaleRef:{current:1},heroRef:{current:{x:0,y:0}}};
 const globals={document:doc,location:{search:''},URLSearchParams,performance:{now:()=>now},matchMedia:()=>media,devicePixelRatio:3,console,
 setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:now+ms});return id},clearTimeout:id=>timers.delete(id),
 ResizeObserver:class{observe(){}disconnect(){}},IntersectionObserver:class{constructor(cb){intersection=cb}observe(){}disconnect(){}}};
 const req=id=>id==='react'?{useEffect:f=>cleanup=f(),useRef:()=>({current:scene}),useId:()=>''}:id==='react/jsx-runtime'?{jsx:(type,props)=>typeof type==='function'?type(props):null,jsxs:()=>null}:id==='./heroFog'?{createHeroFog:()=>()=>{}}:id==='./cloudShadows'?{createCloudShadows:()=>()=>{}}:{};
 const mod={exports:{}};vm.runInNewContext('(function(require,module,exports){'+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText+'})',globals)(req,mod,mod.exports);
 mod.exports.WeatherLayer({kind,camera});
 return {canvas,doc,camera,drawPositions,drawNow(){const first=[...timers.values()][0];timers.clear();first.fn()},get draws(){return draws},get strokes(){return strokes},get gradients(){return gradients},get paints(){return paints},get pending(){return timers.size},advance(ms){const end=now+ms;while(true){const first=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!first||first[1].at>end)break;now=first[1].at;timers.delete(first[0]);first[1].fn()}now=end},hide(){doc.hidden=true;events.get('visibilitychange')()},show(){doc.hidden=false;events.get('visibilitychange')()},offscreen(){intersection([{isIntersecting:false}])},cleanup:()=>cleanup()};
}
test('clear and overcast have no recurring timer and allocate only one pixel',()=>{for(const kind of ['clear','overcast']){const s=setup(kind);s.advance(10000);assert.equal(s.pending,0);assert.equal(s.paints,0);assert.equal(s.canvas.width*s.canvas.height,1);s.cleanup()}});
test('fog is not mounted: no canvas, timer or effects',()=>{const s=setup('fog');assert.equal(s.paints,0);assert.equal(s.pending,0);assert.equal(s.canvas.width,0)});
test('precipitation has at most 24 updates per second and no retina buffer',()=>{for(const kind of ['rain','storm','blizzard','thunderstorm']){const s=setup(kind);s.advance(1000);assert.ok(s.paints<=26);assert.ok(s.canvas.width*s.canvas.height<=350000);s.cleanup();assert.equal(s.pending,0)}});

test('rain reuses one small streak bitmap and storm gradients are built only once',()=>{
 const rain=setup('rain'),initialStrokes=rain.strokes;
 assert.equal(rain.gradients,1);
 rain.advance(1000);
 assert.equal(rain.strokes,initialStrokes);
 assert.equal(rain.gradients,1);
 assert.ok(rain.draws>=rain.paints*48 && rain.draws<=rain.paints*120);
 rain.hide();const paints=rain.paints;rain.advance(1000);assert.equal(rain.paints,paints);assert.equal(rain.pending,0);
 rain.show();assert.equal(rain.gradients,1);rain.cleanup();assert.equal(rain.pending,0);
 const still=setup('rain',true),first=still.paints;still.advance(1000);assert.equal(still.paints,first);assert.equal(still.pending,0);still.cleanup();
 const storm=setup('storm');const count=storm.gradients;storm.advance(3000);assert.equal(storm.gradients,count);assert.equal(count,1);storm.cleanup()
});

test('cloud rendering and full-map weather outline are disconnected',()=>{assert.doesNotMatch(source,/createCloudShadows|getSurface/);assert.doesNotMatch(fs.readFileSync('src/components/beta-raid/BetaRaidCanvas.tsx','utf8'),/getWeatherSurface/)});

test('cell rain has 36 world-anchored particles, bounded lookups and no hidden work',()=>{
 let lookups=0;const s=setup('rain',false,(x,y)=>{lookups++;return {x,y}});
 assert.equal(lookups,36);assert.ok(s.draws<=36);
 const positions=s.drawPositions.splice(0);
 s.camera.offsetRef.current={x:60,y:-35};s.drawNow();
 assert.equal(lookups,36);assert.equal(s.drawPositions.length,positions.length);
 s.drawPositions.forEach((p,i)=>{assert.ok(Math.abs(p[0]-positions[i][0]-60)<1e-8);assert.ok(Math.abs(p[1]-positions[i][1]+35)<1e-8)});
 for(let i=0;i<100;i++){const before=lookups;s.advance(42);assert.ok(lookups-before<=288)}
 s.hide();const before=lookups;s.advance(10000);assert.equal(lookups,before);assert.equal(s.pending,0);s.cleanup();
 let misses=0;const empty=setup('rain',false,()=>{misses++;return null});
 assert.equal(misses,144);assert.equal(empty.draws,0);empty.cleanup();
 const reduced=setup('rain',true,(x,y)=>({x,y}));const count=reduced.paints;
 reduced.advance(1000);assert.equal(reduced.paints,count);
 reduced.camera.offsetRef.current.x=30;reduced.advance(250);assert.equal(reduced.paints,count+1);reduced.cleanup();
});


test('snow uses 36 bounded landing particles and pauses in background',()=>{
 let lookups=0;const s=setup('blizzard',false,(x,y)=>{lookups++;return {x,y}});
 assert.equal(lookups,36);s.advance(1000);assert.ok(lookups<=360);
 s.hide();const n=lookups;s.advance(10000);assert.equal(lookups,n);assert.equal(s.pending,0);s.cleanup();
});
test('snow mask is fixed-size, has transparent ground gaps, and grows only in four stages',()=>{
 const src=fs.readFileSync('src/components/beta-raid/weather/visuals/snowTexture.ts','utf8');
 let pixels;
 const document={createElement:()=>({width:0,height:0,getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:p=>pixels=p.data})})};
 const mod={exports:{}};vm.runInNewContext('(function(exports){'+ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText+'})',{document})(mod.exports);
 let previous=0;
 for(let stage=1;stage<=4;stage++){
  const cv=mod.exports.makeSnowTexture(stage);assert.equal(cv.width*cv.height,16384);
  let opaque=0,clear=0;for(let i=3;i<pixels.length;i+=4){opaque+=pixels[i]>0;clear+=pixels[i]===0}
  assert.ok(opaque>previous);assert.ok(clear>16384*.3);previous=opaque;
 }
});


test('puddles reuse at most four terrain variants across 82000 cells, exclude water and restore dry terrain',()=>{
 let created=0,maskDraws=0,freed=0;
 const g=new Proxy({drawImage(img){if(img.mask)maskDraws++},createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>o[k]??(()=>{})});
 const document={createElement:()=>{created++;return {mask:true,getContext:()=>g}}};
 const load=(path,req)=>{const out={};vm.runInNewContext('(function(require,exports){'+ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText+'})',{document,Math})(req,out);return out};
 const masks=load('src/components/beta-raid/weather/visuals/puddleTexture.ts',()=>({}));
 const water=load('src/components/beta-raid/world-art/midgardWater.ts',()=>({}));
 const mod=load('src/components/beta-raid/hexTileCache.ts',id=>id.includes('midgardWater')?water:id.includes('puddleTexture')?masks:id.includes('snowTexture')?{makeSnowTexture:()=>({})}:id.includes('freeCanvas')?{freeCanvas:()=>freed++}:{R:28,SQRT3:Math.sqrt(3),hexPath2D:()=>({})});
 const cache=new mod.HexTileCache(),keys=new Set(['t:land']),img={complete:true,naturalWidth:128};
 cache.setPuddles(true,keys);
 const result=new Set();let dry=0;
 for(let q=0;q<410;q++)for(let r=0;r<200;r++){result.add(cache.get('t:land',img,q,r));dry+=masks.puddleVariant(q,r)===0;}
 assert.equal(result.size,4);assert.equal(maskDraws,3);assert.equal(created,7);assert.ok(dry>82000*.38&&dry<82000*.42);
 cache.get('t:water',img,4,7);assert.equal(maskDraws,3);
 assert.equal(cache.setPuddles(true,keys),false);
 assert.equal(cache.setPuddles(false,keys),true);cache.get('t:land',img,4,7);assert.equal(maskDraws,3);assert.ok(freed>=8);
});


test('blizzard uses a fixed raster budget without per-frame gradients',()=>{const s=setup('blizzard',false,(x,y)=>({x,y}));const g=s.gradients;s.advance(1000);assert.equal(s.gradients,g);assert.ok(s.draws<=s.paints*180);s.hide();const d=s.draws;s.advance(10000);assert.equal(s.draws,d);s.cleanup()});


test('thunder has 300 anchored drops, bounded work and no hidden rendering',()=>{
 let lookups=0;const s=setup('thunderstorm',false,(x,y)=>{lookups++;return {x,y}});
 assert.equal(lookups,300);const positions=s.drawPositions.splice(0);
 s.camera.offsetRef.current={x:60,y:-35};s.drawNow();assert.equal(lookups,300);
 s.drawPositions.forEach((p,i)=>{assert.ok(Math.abs(p[0]-positions[i][0]-60)<1e-8);assert.ok(Math.abs(p[1]-positions[i][1]+35)<1e-8)});
 const gradients=s.gradients;for(let i=0;i<100;i++){const n=lookups,d=s.draws;s.advance(42);assert.ok(lookups-n<=2400);assert.ok(s.draws-d<=602)}
 assert.equal(s.gradients,gradients);s.hide();const n=lookups,d=s.draws;s.advance(10000);assert.equal(lookups,n);assert.equal(s.draws,d);assert.equal(s.pending,0);s.cleanup();
});
