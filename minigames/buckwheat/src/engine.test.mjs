import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, makeBoard, makeMask, findRuns, findHint, gravity, playSwap, payout, CROWN, CROWN_START, STONE, HOLE, EMPTY, ROWS, COLS, EXIT, SPECIAL, specialType, seededRandom } from './engine.mjs';

test('fixed map starts with pending crown supply, no accidental matches, and a move',()=>{
  for (let seed=1;seed<=100;seed++) {
    const game=createGame(seed);
    assert.deepEqual(game.board.map(row=>row.map(value=>value===STONE||value===HOLE?value:null)),makeMask());
    assert.equal(game.board.flat().filter(value=>value===CROWN).length,0);
    assert.equal(findRuns(game.board).length,0);
    assert.ok(findHint(game.board));
  }
});

test('stone splits gravity while crown descends in its own column',()=>{
  const board=makeBoard(seededRandom(4));
  board[6][3]=CROWN;
  board[3][1]=STONE; board[4][1]=STONE;
  board[7][3]=EMPTY; board[8][3]=EMPTY;
  gravity(board,seededRandom(5));
  assert.equal(board[3][1],STONE);
  assert.equal(board[4][1],STONE);
  assert.equal(board[8][3],CROWN);
  assert.equal(board.length,ROWS);
  assert.ok(board.every(row=>row.length===COLS));
});

test('only valid swaps spend moves; results use three crown payouts',()=>{
  const game=createGame(3);
  game.board[CROWN_START.row][CROWN_START.col]=CROWN;
  const before=game.moves;
  assert.equal(playSwap(game,CROWN_START,{row:CROWN_START.row,col:CROWN_START.col+1}),false);
  assert.equal(game.moves,before);
  const hint=findHint(game.board);
  assert.equal(playSwap(game,...hint),true);
  assert.equal(game.moves,before-1);
  assert.ok(game.grecha>0);
  for (let crowns=0;crowns<=3;crowns++) {
    game.crowns=crowns;
    assert.equal(payout(game).net,crowns*50-100);
  }
});

test('a full random party never moves stones and ends within 30 swaps',()=>{
  for (let seed=1;seed<=50;seed++) {
    const game=createGame(seed);
    const mask=makeMask();
    while (!game.finished) {
      const hint=findHint(game.board);
      assert.ok(hint,`no move at seed ${seed}`);
      assert.ok(playSwap(game,...hint));
      for (let row=0;row<ROWS;row++) for (let col=0;col<COLS;col++) {
        if (mask[row][col]===STONE || mask[row][col]===HOLE) assert.equal(game.board[row][col],mask[row][col]);
      }
      assert.ok(game.crowns<=3);
    }
    assert.ok(game.moves>=0);
  }
});

test('the fixed opening has a proven path to all three crowns within 25 moves',()=>{
  const game=createGame();
  const path=[[5,1,6,1],[8,4,9,4],[6,5,7,5],[5,5,6,5],[0,4,1,4],[5,4,5,5],[7,4,8,4],[8,4,8,5],[7,5,7,6]];
  for (const [r1,c1,r2,c2] of path) assert.ok(playSwap(game,{row:r1,col:c1},{row:r2,col:c2}));
  assert.equal(game.crowns,3);
  assert.equal(game.finished,true);
  assert.equal(game.moves,21);
  assert.equal(payout(game).net,50);
});

test('four, five and crossing matches create the source game specials',()=>{
  const scenarios=[
    {positions:[[2,1,0],[2,2,0],[2,3,1],[2,4,0],[3,3,0]],type:SPECIAL.RAY_V},
    {positions:[[2,1,0],[2,2,0],[2,3,1],[2,4,0],[2,5,0],[3,3,0]],type:SPECIAL.RAINBOW},
    {positions:[[0,3,0],[1,3,0],[2,2,0],[2,3,1],[2,4,0],[3,3,0]],type:SPECIAL.BURST},
  ];
  for(const {positions,type} of scenarios){
    const game=createGame(11);
    for(const [row,col,value] of positions)game.board[row][col]=value;
    assert.ok(playSwap(game,{row:2,col:3},{row:3,col:3}));
    assert.ok(game.lastAnimation.steps[0].created.some(c=>specialType(c.value)===type),`missing special ${type}`);
  }
});

test('a ray and a rainbow clear gems without clearing crown or fixed stones',()=>{
  const ray=createGame(15);
  ray.board[CROWN_START.row][CROWN_START.col]=CROWN;
  ray.board[2][3]=15;ray.board[2][4]=0;ray.board[2][5]=1;ray.board[3][5]=0;
  assert.ok(playSwap(ray,{row:2,col:5},{row:3,col:5}));
  assert.ok(ray.lastAnimation.steps[0].cleared.some(([row,col])=>row===2&&col===7));
  assert.ok(!ray.lastAnimation.steps[0].cleared.some(([row,col])=>row===CROWN_START.row&&col===CROWN_START.col));
  const rainbow=createGame(16);
  rainbow.board[CROWN_START.row][CROWN_START.col]=CROWN;
  rainbow.board[2][3]=30;rainbow.board[2][4]=2;
  assert.ok(playSwap(rainbow,{row:2,col:3},{row:2,col:4}));
  assert.ok(rainbow.lastAnimation.steps[0].cleared.length>3);
  assert.equal(rainbow.board[3][1],STONE);
  assert.ok(!rainbow.lastAnimation.steps[0].cleared.some(([row,col])=>row===CROWN_START.row&&col===CROWN_START.col));
  const double=createGame(17);
  double.board[2][3]=30;double.board[2][4]=30;
  assert.ok(playSwap(double,{row:2,col:3},{row:2,col:4}));
  assert.ok(double.lastAnimation.steps[0].cleared.some(([row,col])=>row===2&&col===3));
  assert.ok(double.lastAnimation.steps[0].cleared.some(([row,col])=>row===2&&col===4));
});
