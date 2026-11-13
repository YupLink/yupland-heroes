import test from 'node:test';
import assert from 'node:assert/strict';
import {createInventory} from './inventory.mjs';
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};
test('earned crowns accumulate across rounds and survive reopening the backpack',()=>{
  const storage=memory(),bag=createInventory(storage),first={crowns:1};
  assert.equal(bag.collect(first),1);first.crowns=2;assert.equal(bag.collect(first),1);
  assert.equal(bag.collect(first),0);assert.equal(bag.count(),2);
  bag.collect({crowns:3});assert.equal(createInventory(storage).count(),5);
});
test('QA rewards remain separate from the player backpack',()=>{
  const storage=memory();createInventory(storage,'qa').collect({crowns:2});
  assert.equal(createInventory(storage).count(),0);
});
test('invalid stored data and unavailable storage do not break the reward screen',()=>{
  for(const value of ['NaN','-4','2.5'])assert.equal(createInventory({getItem:()=>value}).count(),0);
  const bag=createInventory({getItem(){throw Error();},setItem(){throw Error();}});
  assert.equal(bag.collect({crowns:2}),2);assert.equal(bag.count(),2);
});
