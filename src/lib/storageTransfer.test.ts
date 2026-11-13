import test from 'node:test';
import assert from 'node:assert/strict';
import {storageRoom,fitStorageRequest,transferResult,createTransferGate} from './storageTransfer';
import {fitWarehousePlan} from '../components/castle-live/warehouse/warehouseCapacity';
import {executeTransfer} from '../components/castle-live/warehouse/warehouseTransfer';
const item={id:'wood',stackKey:'wood',name:'Wood',count:201};
const empty={items:[],capacity:0};
test('zero room, exact fill, excess by one, and existing stack tail',()=>{
 assert.equal(storageRoom([], 'wood',0,20),0);
 assert.equal(storageRoom([], 'wood',10,20),200);
 assert.equal(storageRoom([{stackKey:'wood',count:199}], 'wood',10,20),1);
 assert.equal(storageRoom([{stackKey:'stone',count:199}], 'wood',10,20),0);
 for(const [asked,expected] of [[200,200],[201,200],[1,1]]){
  const p=fitWarehousePlan([{item,qty:asked}],true,{items:[],capacity:10},empty,empty);
  assert.equal(p[0].qty,expected);
 }
 assert.deepEqual(fitWarehousePlan([{item,qty:201}],true,empty,empty,empty),[]);
});
test('multi selection uses stack tails after another stack fills free cells',()=>{
 const stone={...item,id:'stone',stackKey:'stone',count:20};
 const result=fitWarehousePlan([{item,qty:201},{item:stone,qty:20}],true,{items:[{...stone,count:19}],capacity:10},empty,empty);
 assert.deepEqual(result.map(p=>p.qty),[180,1]);
});
test('split display cells aggregate one stack without double counting room',()=>{
 const stored=[{...item,id:'1',count:20},{...item,id:'2',count:19}];
 assert.equal(storageRoom(stored,'wood',2,20),1);
 const result=fitWarehousePlan([{item,qty:5},{item,qty:5}],true,{items:stored,capacity:2},empty,empty);
 assert.deepEqual(result.map(p=>p.qty),[1]);
});
test('warehouse resources go to account; potion room never borrows backpack capacity',()=>{
 const resource={...item,kind:'resource'};
 assert.equal(fitWarehousePlan([{item:resource,qty:201}],false,empty,empty,empty)[0].qty,201);
 assert.deepEqual(fitWarehousePlan([{item:{...item,potion:true},qty:5}],false,empty,{items:[],capacity:10},empty),[]);
 assert.equal(storageRoom([{stackKey:'potion',count:21}],'potion',1,20,undefined,true),0);
});
test('fractional room retains nine decimal places',()=>{
 assert.equal(storageRoom([{stackKey:'wood',count:19.123456789}],'wood',1,20),0.876543211);
 assert.equal(fitStorageRequest(201,201,200,0.001),200);
 assert.equal(fitStorageRequest(20.0001,20.0001,20,0.001),19.9991);
 assert.equal(fitStorageRequest(0.0009,0.0009,0.0008,0.001),0);
});
test('remainder uses source inventory, not just selected amount, RU and EN',()=>{
 assert.equal(transferResult(201,200,201,'backpack','ru'),'Перенесено 200 из 201. Осталось в рюкзаке: 1.');
 assert.equal(transferResult(201,200,300,'backpack','en'),'Moved 200 of 201. Remaining in backpack: 100.');
});
test('rapid repeated click does not send twice, including while refresh is pending',async()=>{
 const gate=createTransferGate();let sends=0,release!:()=>void;
 const refresh=new Promise<void>(r=>release=r);
 const first=gate.run(async()=>{sends++},()=>refresh);
 assert.equal(await gate.run(async()=>{sends++},async()=>{}),false);
 await Promise.resolve();
 assert.equal(await gate.run(async()=>{sends++},async()=>{}),false);
 release();assert.equal(await first,true);assert.equal(sends,1);
});
test('failed refresh blocks mutation until explicit read-only recovery',async()=>{
 const gate=createTransferGate();let sends=0;
 await gate.run(async()=>{sends++},async()=>{throw Error('offline')});
 assert.equal(gate.blocked,true);
 assert.equal(await gate.run(async()=>{sends++},async()=>{}),false);
 await gate.recover(async()=>{});
 assert.equal(gate.blocked,false);assert.equal(sends,1);
});
test('invalid receipt cannot become a successful count',async()=>{
 const result=await executeTransfer([{item,qty:201}],'backpack',()=>({moved:NaN,requested:201}));
 assert.equal(result.unknown,true);assert.equal(result.moved,0);
});
