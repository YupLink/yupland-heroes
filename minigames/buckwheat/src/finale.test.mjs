import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CROWN, GEM_COUNT, SPECIAL, createGame, finishBonuses, specialType, payout} from './engine.mjs';

test('early win converts each unused move into a bonus on a distinct ordinary gem',()=>{
  const game=createGame(42);
  game.finished=true;
  game.crowns=3;
  game.moves=8;
  game.board[0][2]=15;
  const initialBoard=structuredClone(game.board);

  const finale=finishBonuses(game);
  const placements=finale.transformed;
  assert.equal(placements.length,8);
  assert.equal(new Set(placements.map(({row,col})=>`${row},${col}`)).size,8);
  assert.ok(placements.every(({row,col,value})=>
    initialBoard[row][col]>=0&&initialBoard[row][col]<GEM_COUNT&&specialType(value)));
  assert.ok(finale.steps[0].cleared.some(([row,col])=>row===0&&col===2));
  assert.ok(game.grecha>=9);
  assert.equal(game.moves,0);
  assert.equal(payout(game).net,50);

  const score=game.grecha;
  assert.equal(finishBonuses(game),null);
  assert.equal(game.grecha,score);
});

test('at zero moves existing bonuses score grecha without moving or awarding crowns',()=>{
  const game=createGame();
  game.board[8][6]=CROWN;
  game.board[9][6]=15;
  game.board[0][2]=10+SPECIAL.RAINBOW*GEM_COUNT;
  game.grecha=20;
  game.moves=0;
  game.finished=true;

  const finale=finishBonuses(game);
  assert.equal(finale.transformed.length,0);
  assert.ok(finale.steps[0].cleared.some(([row,col])=>row===0&&col===2));
  assert.ok(game.grecha>20);
  assert.equal(game.board[8][6],CROWN);
  assert.equal(game.crowns,0);
  assert.ok(!game.board.flat().some(specialType));
});

test('a finished board without bonuses keeps its score and an active board cannot be finalized',()=>{
  const game=createGame();
  assert.equal(finishBonuses(game),null);
  game.finished=true;
  game.moves=0;
  assert.equal(finishBonuses(game).steps.length,0);
  assert.equal(game.grecha,0);
});
