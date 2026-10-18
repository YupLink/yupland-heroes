import test from 'node:test';
import assert from 'node:assert/strict';
import {movePlan,executeTransfer,parseQtyInput,additionalCellsRequired} from './warehouseTransfer.ts';
const a={id:'a',stackKey:'wood',name:'Wood',count:600};
const b={id:'b',stackKey:'wood',name:'Wood',count:600};
const c={id:'c',stackKey:'stone',name:'Stone',count:5};
test('counts occupied cells in both directions and uses room in an existing stack',()=>{
 const apple={id:'apple',stackKey:'apple',name:'Apple',count:8};
 const bread={id:'bread',stackKey:'bread',name:'Bread',count:12};
 assert.equal(additionalCellsRequired([apple,bread],[]),2);
 assert.equal(additionalCellsRequired([apple],[{...apple,id:'stored',count:10}]),0);
 assert.equal(additionalCellsRequired([apple],[{...apple,id:'stored',count:20}]),1);
 assert.equal(additionalCellsRequired([{...apple,count:40}],[]),2);
});
test('accepts comma and nine fractional digits, rejects extra precision',()=>{
 assert.equal(parseQtyInput('0,123456789'),0.123456789);
 assert.equal(parseQtyInput('999'),999);
 for(const raw of ['0','0.0000000001','1,1234567891','1000','-1',''])assert.equal(parseQtyInput(raw),null);
});
test('groups fractional cells without skipping and caps each request at 999',()=>{
 const plan=movePlan([{...a,count:600.123456789},{...b,count:600.876543211},c],{});
 assert.deepEqual(plan.map(p=>[p.item.stackKey,p.qty]),[['wood',999],['wood',202],['stone',5]]);
});
test('stops after partial receipt and reports exact moved count',async()=>{
 const calls=[];const result=await executeTransfer(movePlan([a,b,c],{}),'backpack',async(item,place,qty)=>{calls.push([item.stackKey,qty]);return calls.length===2?{moved:70,requested:qty,error:'capacity'}:{moved:qty,requested:qty}});
 assert.deepEqual(calls,[['wood',999],['wood',201]]);assert.deepEqual(result,{moved:1069,total:1205,error:'capacity'});
});
test('exception is unknown, stops without retry or false zero receipt',async()=>{
 let calls=0;const result=await executeTransfer(movePlan([a,c],{}),'castle',()=>{calls++;throw new Error('network')});
 assert.equal(calls,1);assert.deepEqual(result,{moved:0,total:605,error:'network',unknown:true});
});
test('missing receipt is reported without exposing a runtime TypeError',async()=>{
 const result=await executeTransfer(movePlan([a],{}),'backpack',()=>undefined);
 assert.deepEqual(result,{moved:0,total:600,error:'No transfer receipt',unknown:true});
});
test('unknown reply stops even after earlier confirmed transfer',async()=>{
 let calls=0;const result=await executeTransfer(movePlan([a,c],{}),'castle',(_item,_place,qty)=>++calls===2?{unknown:true,error:'bad receipt'}:{moved:qty,requested:qty});
 assert.equal(calls,2);assert.deepEqual(result,{moved:600,total:605,error:'bad receipt',unknown:true});
});
test('stops after successful request when refresh reports stale data',async()=>{
 let calls=0;const result=await executeTransfer(movePlan([a,c],{}),'castle',(_item,_place,qty)=>{calls++;return {moved:qty,requested:qty,error:'refresh failed'}});
 assert.equal(calls,1);assert.deepEqual(result,{moved:600,total:605,error:'refresh failed'});
});
