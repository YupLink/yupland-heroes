import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {storeNewspaperPng} from '../src/server/newspaper-upload';
import {createNewspaperPublisher,uploadNewspaperOriginal} from '../src/lib/newspaper-publish';
import type {NewspaperIssueAdmin} from '../src/lib/newspaper';

const input={date:'2026-11-03',title:'Газета',file:new File(['test'],'paper.png',{type:'image/png'})};
function fixture(){
  let rows:NewspaperIssueAdmin[]=[];const calls:string[]=[];
  const ports={
    list:async()=>rows.map(i=>({...i})),upload:async()=>{calls.push('upload');return {url:'/uploads/paper.png'};},
    save:async(data:any)=>{calls.push('save');assert.equal(data.createOnly,true);rows=[{...data,status:'draft',copies:0,reads:0,createdAt:'',publishedAt:null}];return {id:data.id};},
    publish:async(id:string)=>{calls.push('publish');assert.equal(id,rows[0].id);rows[0].status='published';return {status:'published',maps:[{map:'Мир',copies:4}]};}
  };
  return {ports,calls,setRows:(r:NewspaperIssueAdmin[])=>{rows=r;},rows:()=>rows};
}
test('original PNG is immutable and byte-identical; concurrent retries reuse one URL',async()=>{
  const root=await mkdtemp(join(tmpdir(),'newspaper-'));
  try{
    const bytes=await sharp({create:{width:1536,height:1024,channels:3,background:'#efddac'}}).png().toBuffer();
    const file=new File([bytes],'paper.png',{type:'image/png'});
    const results=await Promise.all([storeNewspaperPng(file,root,'/uploads'),storeNewspaperPng(file,root,'/uploads')]);
    assert.deepEqual(results[0],results[1]);assert.equal(results[0].width,1536);
    assert.deepEqual(await readFile(join(root,results[0].url.replace('/uploads/',''))),bytes);
    assert.equal((await readdir(join(root,'tasks/newspapers'))).length,1);
    await assert.rejects(storeNewspaperPng(new File([bytes.subarray(0,40)],'bad.png',{type:'image/png'}),root,'/uploads'));
    await assert.rejects(storeNewspaperPng(new File(['<svg/>'],'fake.png',{type:'image/png'}),root,'/uploads'));
    await assert.rejects(storeNewspaperPng(new File([bytes],'fake.gif',{type:'image/gif'}),root,'/uploads'));
    await assert.rejects(storeNewspaperPng(new File([new Uint8Array(8*1024*1024+1)],'big.png',{type:'image/png'}),root,'/uploads'));
  }finally{await rm(root,{recursive:true,force:true});}
});
test('one action uploads, saves and publishes; published date never republishes',async()=>{
  const f=fixture(),run=createNewspaperPublisher(f.ports);const result=await run(input);
  assert.equal(result.id,'npi_daily_20261103');assert.deepEqual(f.calls,['upload','save','publish']);
  await assert.rejects(run(input),{code:'exists'});assert.equal(f.calls.length,3);
});
test('save response lost: retry finds the draft and never creates a second issue',async()=>{
  const f=fixture(),save=f.ports.save;let first=true;
  f.ports.save=async d=>{const r=await save(d);if(first){first=false;throw Error('offline');}return r;};
  const run=createNewspaperPublisher(f.ports);await assert.rejects(run(input));await run(input);
  assert.equal(f.calls.filter(c=>c==='save').length,1);assert.equal(f.rows().length,1);
});
test('publish response lost: retry observes published and does not publish again',async()=>{
  const f=fixture(),publish=f.ports.publish;
  f.ports.publish=async id=>{await publish(id);throw Error('offline');};
  const run=createNewspaperPublisher(f.ports);await assert.rejects(run(input));await assert.rejects(run(input),{code:'exists'});
  assert.equal(f.calls.filter(c=>c==='publish').length,1);
});
test('double click is blocked while first attempt is pending',async()=>{
  const f=fixture();let release!:()=>void;
  f.ports.upload=async()=>{await new Promise<void>(r=>release=r);return {url:'/uploads/paper.png'};};
  const run=createNewspaperPublisher(f.ports),first=run(input);
  await assert.rejects(run(input),{code:'busy'});await new Promise(r=>setImmediate(r));release();await first;
  assert.equal(f.calls.filter(c=>c==='publish').length,1);
});
test('different draft, withdrawn date, access error and empty circulation never report success',async()=>{
  for(const kind of ['conflict','withdrawn','access','empty']){
    const f=fixture();
    if(kind==='conflict'||kind==='withdrawn')f.setRows([{id:'npi_existing',date:input.date,title:'Другой выпуск',imageUrl:'/other.png',status:kind==='withdrawn'?'withdrawn':'draft'} as NewspaperIssueAdmin]);
    if(kind==='access')f.ports.list=async()=>{throw Error('forbidden');};
    if(kind==='empty')f.ports.publish=async()=>({status:'published',maps:[]});
    await assert.rejects(createNewspaperPublisher(f.ports)(input));assert.ok(!f.calls.includes('publish'));
  }
});
test('upload response and served file must both match original hash',async()=>{
  const originalFetch=globalThis.fetch;const file=new File(['original'],'paper.png',{type:'image/png'});
  const hash=Buffer.from(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())).toString('hex');
  try{
    for(const invalid of ['hash','download','url','forbidden']){
      globalThis.fetch=async(url)=>url==='/api/upload'?new Response(JSON.stringify({url:invalid==='url'?'https://other.example/a.png':'/uploads/a.png',sha256:invalid==='hash'?'bad':hash}),{status:invalid==='forbidden'?403:200}):new Response(invalid==='download'?'wrong':'original');
      await assert.rejects(uploadNewspaperOriginal(file));
    }
    globalThis.fetch=async(url)=>url==='/api/upload'?new Response(JSON.stringify({url:'/uploads/a.png',sha256:hash})):new Response('original');
    assert.equal((await uploadNewspaperOriginal(file)).url,'/uploads/a.png');
  }finally{globalThis.fetch=originalFetch;}
});
