const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const code = buildSync({ stdin:{contents:`export * from './src/components/beta-raid/waterPattern'; export * from './src/components/beta-raid/waterRipples'; export {MapStore} from './src/components/beta-raid/mapStore'; export {buildMapIndex} from './src/components/beta-raid/mapIndex'; export {FogMask,fogView} from './src/components/beta-raid/fogMask'; export {chunkId,chunkX,chunkY} from './src/components/beta-raid/chunkIndex';`,resolveDir:root}, bundle:true,platform:'node',format:'cjs',write:false }).outputFiles[0].text;
const mod = new Module(__filename);mod.paths=module.paths;mod._compile(code,__filename);const api=mod.exports;
let canvases=[],reduced=false;
class Ctx {
 constructor(){this.draws=0;this.fills=[];this.globalCompositeOperation='source-over';}
 setTransform(){} save(){} restore(){} translate(){} clearRect(){} fillRect(){} beginPath(){} arc(){} closePath(){}
 fill(p){this.fills.push(p?.count||0)} drawImage(){this.draws++}
 createPattern(){return {setTransform(){}}}
}
class Canvas {constructor(){this.width=300;this.height=150;this.ctx=new Ctx();canvases.push(this)}getContext(){return this.ctx}}
function setup(){canvases=[];reduced=false;global.document={hidden:false,createElement:()=>new Canvas()};global.window={matchMedia:()=>({matches:reduced})};global.Path2D=class{constructor(){this.count=0}moveTo(){}lineTo(){}closePath(){}addPath(){this.count++}};global.DOMMatrix=class{constructor(){this.e=0;this.f=0}};}
function scene(seenAll=true){
 const n=100,q=Array.from({length:n},(_,i)=>i%10),r=q.map((_,i)=>Math.floor(i/10));
 const store=new api.MapStore({terrainIds:['water'],roadIds:[],decorationIds:[],objectIds:[],buildingIds:[],q,r,t:Array(n).fill(0),road:Array(n).fill(-1),dec:Array(n).fill(-1),obj:Array(n).fill(-1),bld:Array(n).fill(-1),defeated:[]},0,0,false);
 const fog=new api.FogMask(store);if(seenAll)for(let i=0;i<n;i++)fog.addIndex(i);
 const covered=new Set();for(let i=0;i<n;i++)covered.add(api.chunkId(api.chunkX(store.geom.x[i]),api.chunkY(store.geom.y[i])));
 return {index:api.buildMapIndex(store),fog,s:{g:new Ctx(),view:{minX:-100,minY:-100,maxX:700,maxY:700},scale:1,covered,seen:api.fogView(fog),visible:new Set(),revealAll:false,images:new Map(),ribbons:{get:()=>null}}};
}
test('phase uses shared 125 ms clock, including restart and full cycle',()=>{
 assert.equal(api.waterPhase(0),0);assert.equal(api.waterPhase(124),0);assert.equal(api.waterPhase(125),1);assert.equal(api.waterPhase(4000),0);
});
test('viewport budget is hard bounded and far zoom/invalid/huge views are rejected',()=>{
 for(const [w,h] of [[300,800],[2000,2000],[200,19000]]){const v=api.waterViewport(w,h,1);assert(v.width<=512&&v.height<=512)}
 for(const args of [[500,500,.54],[1e6,1e6,1],[0,1,1],[NaN,3,1]])assert.equal(api.waterViewport(...args),null);
});
test('unexplored and absent water never wake animation or allocate phases',()=>{
 setup();const {s,index}=scene(false),w=new api.WaterRipples();w.draw(s,index,new Set(['water']),0);assert.equal(w.delay(),null);assert(canvases.length<=2);assert.equal(s.g.draws,0);
 w.draw(s,index,new Set(),0);assert.equal(w.delay(),null);w.clear();
});
test('long pans reuse the same two surfaces and 32 phases; clear frees all backing pixels',()=>{
 setup();const {s,index}=scene(),w=new api.WaterRipples();const ids=new Set(['water']);
 for(let i=0;i<200;i++){s.view={minX:-100+i,minY:-100,maxX:700+i,maxY:700};w.draw(s,index,ids,i*125)}
 assert.equal(canvases.length,34);assert.equal(w.delay(),125);
 const bytes=canvases.reduce((sum,c)=>sum+c.width*c.height*4,0);assert(bytes<=2*512*512*4+32*128*80*4);
 w.clear();assert.equal(canvases.reduce((sum,c)=>sum+c.width*c.height,0),0);assert.equal(w.delay(),null);
});
test('hidden, reduced motion, no static coverage and far zoom all stop water wakeups',()=>{
 setup();const {s,index}=scene(),w=new api.WaterRipples(),ids=new Set(['water']);w.draw(s,index,ids,0);assert.equal(w.delay(),125);
 document.hidden=true;w.draw(s,index,ids,125);assert.equal(w.delay(),null);
 document.hidden=false;reduced=true;w.draw(s,index,ids,250);assert.equal(w.delay(),null);
 reduced=false;s.scale=.2;w.draw(s,index,ids,375);assert.equal(w.delay(),null);
 s.scale=1;s.covered.clear();w.draw(s,index,ids,500);assert.equal(w.delay(),null);w.clear();
});
test('new exploration updates viewport mask; world clear cannot retain old water',()=>{
 setup();const {s,index,fog}=scene(false),w=new api.WaterRipples(),ids=new Set(['water']);w.draw(s,index,ids,0);assert.equal(w.delay(),null);
 fog.addIndex(0);s.seen=api.fogView(fog);w.draw(s,index,ids,125);assert.equal(w.delay(),125);
 w.clear();const next=scene(false);w.draw(next.s,next.index,ids,250);assert.equal(w.delay(),null);
});
test('moving camera never rebuilds the mask; ripple resumes once the camera settles',()=>{
 setup();const {s,index}=scene(),w=new api.WaterRipples(),ids=new Set(['water']);
 for(let i=0;i<60;i++){s.view={minX:-100+i,minY:-100,maxX:700+i,maxY:700};w.beginFrame();w.draw(s,index,ids,i*16,true)}
 assert.equal(s.g.draws,0);assert.equal(canvases.length,0);assert.equal(w.delay(),300);
 w.beginFrame();w.draw(s,index,ids,1000);assert.equal(s.g.draws,0);assert.equal(w.delay(),300);
 w.beginFrame();w.draw(s,index,ids,1300);assert.equal(s.g.draws,1);assert.equal(w.delay(),125);w.clear();
});
test('own layers: phases repaint only the water canvas, map frames stay asleep; moving hides and frees the top canvas',async()=>{
 setup();const {s,index}=scene(),w=new api.WaterRipples(),ids=new Set(['water']);
 const dom=()=>{const c=new Canvas();c.style={};return c};const water=dom(),top=dom();canvases=[];
 Object.assign(s.g,{canvas:{width:600,height:300},getTransform:()=>({a:1,d:1,e:0,f:0})});s.W=600;
 water.ctx.getTransform=top.ctx.getTransform=()=>({});
 w.attach(water,top);w.beginFrame();
 const over=w.draw(s,index,ids,performance.now());
 assert.equal(over,top.ctx);assert.equal(s.g.draws,0);assert.equal(w.delay(),null);
 assert.equal(water.style.visibility,'visible');assert.equal(top.width,600);assert(water.width<=512&&water.ctx.draws===1);
 await new Promise(r=>setTimeout(r,300));
 assert(water.ctx.draws>=2,'phase repainted by its own timer');assert.equal(s.g.draws,0);
 w.beginFrame();assert.equal(w.draw(s,index,ids,performance.now(),true),null);
 assert.equal(water.style.visibility,'hidden');assert.equal(top.width,0);assert.equal(w.delay(),300);
 const n=water.ctx.draws;await new Promise(r=>setTimeout(r,300));assert.equal(water.ctx.draws,n,'no ticks while hidden');
 w.clear();
});
test('a modal window over the map pauses ripple phases; closing it resumes them within a second',async()=>{
 setup();const {s,index}=scene(),w=new api.WaterRipples(),ids=new Set(['water']);
 const dom=()=>{const c=new Canvas();c.style={};return c};const water=dom(),top=dom();
 Object.assign(s.g,{canvas:{width:600,height:300},getTransform:()=>({a:1,d:1,e:0,f:0})});s.W=600;top.ctx.getTransform=()=>({});
 let modal=false;document.querySelectorAll=()=>modal?[{getClientRects:()=>[1]}]:[];
 w.attach(water,top);w.beginFrame();w.draw(s,index,ids,performance.now());
 modal=true;await new Promise(r=>setTimeout(r,200));const n=water.ctx.draws;
 await new Promise(r=>setTimeout(r,500));assert.equal(water.ctx.draws,n,'paused under the window');
 modal=false;await new Promise(r=>setTimeout(r,1300));assert(water.ctx.draws>n,'resumed after close');
 w.clear();
});
