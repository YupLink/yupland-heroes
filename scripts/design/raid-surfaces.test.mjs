import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../../src/'+p,import.meta.url),'utf8');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {RaidMovementController,movementSurface}=await import('data:text/javascript;base64,'+Buffer.from(compile(read('lib/audio/raidMovementController.ts'))).toString('base64'));
test('surface priority includes road, boarding and disembarking',()=>{
 assert.equal(movementSurface(false,false,false),'earth');
 assert.equal(movementSurface(false,false,true),'stone');
 assert.equal(movementSurface(true,false,true),'water');
 assert.equal(movementSurface(false,true,true),'water');
});
test('real hook switches voices exclusively and shares mute, stop, hide and cleanup',async()=>{
 const refs=[], effects=[], cleanups=[], voices={};let cursor=0, ec=0, notify;
 const deps=[], pending=[];
 const state={playing:true,muted:false,volume:.28};
 const listeners={};const doc={hidden:false,addEventListener:(n,f)=>listeners[n]=f,removeEventListener(){}};
 const win={addEventListener:(n,f)=>listeners[n]=f,removeEventListener(){}};
 const voice=k=>voices[k]={playing:false,disposed:false,start(){this.playing=true},stop(){this.playing=false},setVolume(v){this.volume=v},setSceneActive(){},dispose(){this.playing=false;this.disposed=true}};
 const mocks={useRef:v=>refs[cursor++]??=( {current:v}),useCallback:f=>f,
 useEffect:(f,d)=>{const i=ec++;if(!deps[i]||d.some((v,j)=>v!==deps[i][j])){deps[i]=d;effects.push(()=>{cleanups[i]?.();cleanups[i]=f()})}},
 RaidMovementController,movementSurface,createRaidMovementVoice:k=>new Promise(resolve=>pending.push(()=>resolve(voice(k)))),
 getRaidMusic:()=>({getSnapshot:()=>state,subscribe:f=>{notify=f;return ()=>{notify=null}}}),document:doc,window:win};
 const code=compile(read('hooks/useRaidMovementAudio.ts')).replace(/^import .*;\n/gm,'').replace('export function','function');
 const hook=new Function(...Object.keys(mocks),code+';return useRaidMovementAudio')(...Object.values(mocks));
 const render=(cell,ship,road)=>{cursor=ec=0;const motion=hook(true,cell,ship,road);effects.splice(0).forEach(f=>f());return motion};
 const flush=async()=>{pending.splice(0).forEach(f=>f());for(let i=0;i<8;i++)await Promise.resolve()};
 const active=()=>Object.keys(voices).filter(k=>voices[k].playing);
 let motion=render('0,0',false,false);await flush();
 assert.deepEqual(Object.keys(voices).sort(),['earth','stone','water']);
 motion(true);assert.deepEqual(active(),['earth']);
 motion=render('1,0',false,true);motion(true);
 assert.equal(pending.length,0,'surface switch must not wait for loading');
 assert.deepEqual(active(),['stone']);assert.equal(voices.stone.volume,.28);
 motion=render('2,0',true,false);motion(true);motion(false);await flush();assert.deepEqual(active(),[]);
 motion(true);assert.deepEqual(active(),['water']);
 motion=render('3,0',false,true);motion(true);assert.deepEqual(active(),['water']);
 motion=render('4,0',false,true);motion(true);assert.deepEqual(active(),['stone']);
 state.muted=true;notify();assert.deepEqual(active(),[]);
 state.muted=false;notify();motion(true);assert.deepEqual(active(),['stone']);
 doc.hidden=true;listeners.visibilitychange();assert.deepEqual(active(),[]);
 doc.hidden=false;listeners.visibilitychange();assert.deepEqual(active(),[]);
 motion(true);assert.deepEqual(active(),['stone']);
 state.playing=false;notify();assert.deepEqual(active(),[]);
 cleanups.forEach(f=>f?.());assert.ok(Object.values(voices).every(v=>v.disposed));
});
