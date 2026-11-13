// Купленная постройка без сохранённого места ждёт ручной расстановки; данное
// админу казино встаёт на своё место сразу; сохранённое место — главнее.
import {describe,expect,it} from 'vitest';
import {withOwnedLayout} from './modularOwnedLayout';
import {casinoBuilding,CASINO_X,CASINO_Y} from './modularCasino';
import type {SceneBuilding} from './modularCastleLayout';

const casinoOf=(list:SceneBuilding[])=>list.find(b=>b.id==='casino');

describe('казино на площади замка',()=>{
 it('куплено, места нет — ждёт расстановки (на сцене нет)',()=>{
  expect(casinoOf(withOwnedLayout([],'casino',casinoBuilding(true)))?.placed).toBe(false);
 });
 it('дано админу, места нет — стоит на своём месте',()=>{
  const c=casinoOf(withOwnedLayout([],'casino',casinoBuilding(true),true))!;
  expect(c.placed).toBe(true);
  expect([c.x,c.y]).toEqual([CASINO_X,CASINO_Y]);
 });
 it('сохранённое место главнее: убрал в редакторе — не возвращаем, передвинул — там и стоит',()=>{
  const saved={...casinoBuilding(true)!,placed:false};
  expect(casinoOf(withOwnedLayout([saved],'casino',casinoBuilding(true),true))?.placed).toBe(false);
  const moved={...casinoBuilding(true)!,placed:true,x:500,y:900};
  const c=casinoOf(withOwnedLayout([moved],'casino',casinoBuilding(true),true))!;
  expect([c.placed,c.x,c.y]).toEqual([true,500,900]);
 });
 it('не построено — нет и на сцене',()=>{
  expect(casinoOf(withOwnedLayout([],'casino',casinoBuilding(false),true))).toBeUndefined();
 });
});
