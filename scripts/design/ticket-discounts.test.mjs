import test from 'node:test';
import assert from 'node:assert/strict';
import { ticketDiscountPercent as discount } from '../../src/components/chips/trading-house/ticketDiscounts.ts';
const energy = price => ({ kind: 'energy', unit: 'энергии Yupland', price });
const token = (unit, price, extra = {}) => ({ kind: 'token', unit, price, ...extra });
const offers = [
  { tickets: 1, methods: [energy(5000)] },
  { tickets: 5, methods: [token('Darai',6000000,{usdToken:'Darai'}), token('USDT',4.25,{usdToken:'USDT'})] },
  { tickets: 2, methods: [token('GDarai',1)] },
];
test('approved Yupland percentages use price per ticket', () => {
  for (const [tickets, price, percent] of [[10,40000,20],[50,75000,70],[100,100000,80]]) assert.equal(discount(offers,tickets,energy(price)),percent);
});
test('Darai and new USDT route compare their own current base', () => {
  assert.equal(discount(offers,10,token('Darai',9000000,{usdToken:'Darai'})),25);
  assert.equal(discount(offers,50,token('Darai',30000000,{usdToken:'Darai'})),50);
  assert.equal(discount(offers,100,token('Darai',50000000,{usdToken:'Darai'})),58);
  assert.equal(discount(offers,10,token('USDT',6.38,{usdToken:'USDT'})),25);
  assert.equal(discount(offers,50,token('USDT',21.25,{usdToken:'USDT'})),50);
});
test('GDarai is distinct from Darai', () => {
  assert.equal(discount(offers,21,token('GDarai',10)),5);
  assert.equal(discount(offers,110,token('GDarai',50)),9);
});
test('missing base and different payment routes do not invent savings', () => {
  assert.equal(discount([],50,energy(75000)),null);
  assert.equal(discount(offers,50,token('Darai',30000000,{ftContract:'other-token'})),null);
});
test('no badge for base, unchanged or increased unit price, Stars or unknown currency', () => {
  assert.equal(discount(offers,1,energy(5000)),null);
  assert.equal(discount(offers,10,energy(50000)),null);
  assert.equal(discount(offers,10,energy(60000)),null);
  assert.equal(discount(offers,10,{kind:'stars',unit:'Stars',price:540}),null);
  assert.equal(discount(offers,10,token('GP',10)),null);
});
test('invalid input and duplicate expensive bases cannot inflate the discount', () => {
  for(const price of [0,-1,NaN,Infinity]) assert.equal(discount(offers,50,energy(price)),null);
  const duplicate=[...offers,{tickets:1,methods:[energy(10000)]}];
  assert.equal(discount(duplicate,50,energy(75000)),70);
  assert.equal(offers[0].methods[0].price,5000);
});

