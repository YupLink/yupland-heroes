import test from 'node:test';
import assert from 'node:assert/strict';
import {translate,crownLabel,titles} from './i18n.mjs';

test('full bilingual title remains intact across its two curved lines',()=>{
  assert.equal(titles.ru.join(' '),'Корона гречневого королевства');
  assert.equal(titles.en.join(' '),'Crown of the Buckwheat Kingdom');
});
test('both result paths and crown plurals are natural English',()=>{
  assert.equal(translate('Получена 1 корона','en'),'1 crown collected');
  assert.equal(translate('Получено 2 crowns','en'),'2 crowns collected');
  assert.equal(translate('Получено 3 короны','en'),'3 crowns collected');
  assert.equal(translate('Короны не получены','en'),'No crowns collected');
  assert.equal(crownLabel(1,'en'),'crown');assert.equal(crownLabel(0,'en'),'crowns');
  assert.equal(crownLabel(21),'корона');assert.equal(crownLabel(12),'корон');
});
test('entry prices, balances and move limit translate without altering their values',()=>{
  assert.equal(translate('Играть за 100 000 Darai','en'),'Play for 100,000 Darai');
  assert.equal(translate('Баланс 1 250','en'),'Balance 1,250');
  assert.equal(translate('Опусти 3 короны за 30 ходов','en'),'Bring 3 crowns down in 30 moves');
  assert.equal(translate('Играть за 100 золота','en'),'Play for 100 gold');
});
test('accessible board descriptions translate coordinates, specials and exits',()=>{
  assert.equal(translate('гречневое зерно, Луч, ряд 10, столбец 7, выход короны','en'),'buckwheat grain, Arrow, row 10, column 7, crown exit');
  assert.equal(translate('Доставлено корон: 2 из 3','en'),'Crowns rescued: 2 of 3');
});
test('Russian and unknown player names are preserved',()=>{
  assert.equal(translate('Рюкзак','ru'),'Рюкзак');
  assert.equal(translate('Лесная фея','en'),'Лесная фея');
});
