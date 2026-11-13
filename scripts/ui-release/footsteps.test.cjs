const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const dir=mkdtempSync(join(tmpdir(),'footsteps-'));
buildSync({entryPoints:['src/lib/audio/raidMovementController.ts'],outfile:join(dir,'controller.cjs'),bundle:true,platform:'node',format:'cjs'});
const {movementSurface,RaidMovementController}=require(join(dir,'controller.cjs'));
process.on('exit',()=>rmSync(dir,{recursive:true,force:true}));
test('foot and mounted surfaces including embark/disembark',()=>{
 for(const road of [false,true]){
 assert.equal(movementSurface(false,false,road,true),road?'foot-stone':'foot-earth');
 assert.equal(movementSurface(false,false,road,false),road?'stone':'earth');
 for(const foot of [false,true]){
 assert.equal(movementSurface(true,false,road,foot),'water');
 assert.equal(movementSurface(false,true,road,foot),'water');
 }}
});
test('late decoded steps cannot restart after stop or disposal',async()=>{
 let resolve;let starts=0,disposed=0;
 const c=new RaidMovementController(()=>new Promise(r=>resolve=r));
 c.configure(true,false,.5);c.setMoving(true);c.setMoving(false);
 resolve({start(){starts++},stop(){},setVolume(){},setSceneActive(){},dispose(){disposed++}});
 await Promise.resolve();await Promise.resolve();
 assert.equal(starts,0);c.dispose();assert.equal(disposed,1);
});
test('mute and scene exit stop moving footsteps',async()=>{
 let active=false;
 const c=new RaidMovementController(async()=>({start(){active=true},stop(){active=false},setVolume(){},setSceneActive(){},dispose(){active=false}}));
 c.configure(true,false,.5);await Promise.resolve();await Promise.resolve();
 c.setMoving(true);assert.equal(active,true);
 c.configure(true,true,.5);assert.equal(active,false);
 c.configure(false,false,.5);assert.equal(active,false);c.dispose();
});
test('lost visual frame stops playback',async()=>{
 let active=false;
 const c=new RaidMovementController(async()=>({start(){active=true},stop(){active=false},setVolume(){},setSceneActive(){},dispose(){active=false}}));
 c.configure(true,false,.5);await Promise.resolve();await Promise.resolve();
 c.setMoving(true);await new Promise(r=>setTimeout(r,140));assert.equal(active,false);c.dispose();
});
