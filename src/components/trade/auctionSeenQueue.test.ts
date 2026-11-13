import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuctionSeenQueue } from './auctionSeenQueue.ts';

test('more than 200 visible IDs are sent sequentially, repeated views are ignored', async () => {
 const batches: string[][]=[];
 const queue=createAuctionSeenQueue({active:()=>true,send:async ids=>{batches.push(ids);}});
 const ids=Array.from({length:451},(_,i)=>String(i));
 await queue.add(ids); await queue.add(ids);
 assert.deepEqual(batches.map(b=>b.length),[200,200,51]);
 assert.equal(new Set(batches.flat()).size,451);
});
test('new lot arriving while a batch is in flight is still sent; duplicate is not',async()=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);const calls:string[][]=[];
 const queue=createAuctionSeenQueue({active:()=>true,send:async ids=>{calls.push(ids);if(calls.length===1)await gate;}});
 const first=queue.add(['a']);await queue.add(['a','new']);release();await first;
 assert.deepEqual(calls,[['a'],['new']]);
});
test('guest or changed account sends no additional batches',async()=>{
 let active=false;const calls:string[][]=[];
 const queue=createAuctionSeenQueue({active:()=>active,send:async ids=>{calls.push(ids);active=false;}});
 await queue.add(['guest']);assert.equal(calls.length,0);
 active=true;await queue.add(Array.from({length:250},(_,i)=>String(i)));
 assert.equal(calls.length,1);assert.equal(calls[0].length,200);
});
test('failed view remains retryable, stopping prevents further writes',async()=>{
 let fails=true;let calls=0;
 const queue=createAuctionSeenQueue({active:()=>true,send:async()=>{calls++;if(fails)throw Error('offline');}});
 await queue.add(['a']);fails=false;await queue.add(['a']);await queue.add(['a']);
 assert.equal(calls,2);queue.stop();await queue.add(['b']);assert.equal(calls,2);
});
test('empty visible set sends nothing',async()=>{
 const queue=createAuctionSeenQueue({active:()=>true,send:async()=>assert.fail('unexpected call')});await queue.add([]);
});
