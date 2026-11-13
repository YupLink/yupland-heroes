const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function load(file,imports,globals={}){const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext('(function(require,module,exports){'+code+'})',globals)(name=>imports[name]||{},mod,mod.exports);return mod.exports;}
function environment(){const canvases=[],tasks=[];let clock=0;function canvas(){const c={width:146,height:316};const g={canvas:c,clears:0,fills:0,draws:[],translations:[],clearRect(){this.clears++},drawImage(...args){this.draws.push(args)},translate(x,y){this.translations.push([x,y])},createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},save(){},restore(){},setTransform(){},scale(){},rotate(){},fillRect(){},fill(){this.fills++},createPattern:()=>({})};c.getContext=()=>g;canvases.push(c);return c;}return {canvas,canvases,setTimeout:fn=>tasks.push(fn),performance:{now:()=>clock++},flush(){let n=0;while(tasks.length){assert.ok(n++<10000);tasks.shift()();}},document:{createElement:canvas},Image:class{complete=true;naturalWidth=512;src='';}};}
const root='src/components/beta-raid/weather/visuals/';
test('cloud patch reused for wind/pan, rebuilt on zoom or exhausted border, pixel budget bounded',()=>{
 const env=environment(),ctx=env.canvas().getContext('2d');
 const {createCloudShadows}=load(root+'cloudShadows.ts',{},env),render=createCloudShadows(ctx,{});
 render(390,844,{x:0,y:0},1,1000);
 const field=env.canvases[2],g=field.getContext('2d'),initial=g.draws.length;
 assert.ok(initial>0);assert.ok(field.width*field.height<=196608);
 for(let i=1;i<=12;i++)render(390,844,{x:0,y:0},1,1000+i*80);
 assert.equal(g.draws.length,initial);assert.equal(ctx.draws.length,26);
 const last=ctx.draws.at(-2);assert.ok(Math.abs(last[1]-(-128+13.44))<.0001);
 render(390,844,{x:20,y:0},1,2000);assert.equal(g.draws.length,initial);assert.equal(env.canvases[1].getContext('2d').fills,1);
 render(390,844,{x:20,y:0},2,2000);assert.ok(g.draws.length>initial);
 const count=g.clears;render(390,844,{x:200,y:0},2,2000);assert.equal(g.clears,count+1);
});
test('fog dissolves between fixed cell centres, bounded transitions and cached idle masks',()=>{
 const env=environment(),geometry=load('src/components/beta-raid/hexGeometry.ts',{}),api=load(root+'heroFog.ts',{'../../hexGeometry':geometry},env);
 const reveal=api.createFogReveal(),a=reveal({x:0,y:0},1000),cell=geometry.axialToPixel(1,0,0,0);
 assert.equal(a.length,1);assert.equal(a[0].alpha,1);
 assert.equal(reveal({x:5,y:0},1020)[0].x,0);
 reveal(cell,1100);const halfway=reveal(cell,1220);
 assert.equal(halfway.length,2);assert.equal(halfway[0].x,0);assert.equal(halfway[1].x,cell.x);
 assert.ok(Math.abs(halfway.reduce((s,p)=>s+p.alpha,0)-1)<1e-9);
 assert.equal(reveal(cell,1340).length,1);
 for(let i=2;i<30;i++){const state=reveal(geometry.axialToPixel(i,0,0,0),1340+i*20);assert.ok(state.length<=4);assert.ok(Math.abs(state.reduce((s,p)=>s+p.alpha,0)-1)<.001);}
 const ctx=env.canvas().getContext('2d'),render=api.createHeroFog(ctx);
 render(390,844,{x:0,y:0},{x:0,y:0},1,1900);assert.equal(ctx.draws.length,0);env.flush();
 render(390,844,{x:0,y:0},{x:0,y:0},1,2000);
 const buffers=env.canvases.slice(-2),counts=buffers.map(c=>c.getContext('2d').clears);
 render(390,844,{x:0,y:0},{x:0,y:0},1,2100);assert.deepEqual(buffers.map(c=>c.getContext('2d').clears),counts);
 ctx.translations=[];render(390,844,cell,{x:0,y:0},1,2200);const first=ctx.translations.slice();ctx.translations=[];
 render(390,844,geometry.axialToPixel(2,0,0,0),{x:0,y:0},1,2200);assert.deepEqual(ctx.translations,first);
});
