import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,makeMask,playSwap,canSwap,findHint,gravity,seededRandom,CROWN,EMPTY,STONE,ENTRY_COLS,ROWS,COLS} from './engine.mjs';

function fixture(){
  const g=createGame(41);
  g.board=makeMask().map((row,r)=>row.map((v,c)=>v??(r*2+c)%5));
  return g;
}
function localMatch(g,row,col){
  g.board[row][col]=0;g.board[row][col+1]=0;g.board[row][col+2]=1;g.board[row+1][col+2]=0;
  assert.ok(playSwap(g,{row,col:col+2},{row:row+1,col:col+2}));
  return g.lastAnimation.steps[0];
}
const count=board=>board.flat().filter(v=>v===CROWN).length;

test('first crown waits for a clearing under one of the two entry columns',()=>{
  const g=fixture();assert.equal(count(g.board),0);
  const elsewhere=localMatch(g,0,2);assert.equal(elsewhere.spawned,null);
  const next=fixture();const underEntry=localMatch(next,1,1);
  assert.ok(underEntry.spawned);assert.ok(ENTRY_COLS.includes(underEntry.spawned.entryCol));
  assert.equal(count(underEntry.afterGravity),1);
  assert.ok(underEntry.cleared.some(([row,col])=>col===underEntry.spawned.entryCol));
});

test('crown enters the lowest refill vacancy rather than overwriting a piece',()=>{
  const g=fixture();g.board[4][3]=EMPTY;g.board[5][3]=EMPTY;
  const spawn=gravity(g.board,seededRandom(9),3);
  assert.deepEqual(spawn,{row:1,col:3,entryCol:3});assert.equal(g.board[1][3],CROWN);
  assert.equal(count(g.board),1);assert.equal(g.board.flat().filter(v=>v===EMPTY).length,0);
});

test('a full entry segment and a blocked lower segment do not create a crown',()=>{
  const g=fixture();assert.equal(gravity(g.board,seededRandom(3),3),null);
  g.board[3].fill(STONE);g.board[6][3]=EMPTY;
  assert.equal(gravity(g.board,seededRandom(4),3),null);assert.equal(count(g.board),0);
});

for(const col of ENTRY_COLS)test(`exit column ${col} delivers one crown, then waits for a later clear`,()=>{
  const g=fixture();g.board[8][col]=CROWN;
  const start=col===1?1:4,swapped=col===1?3:4;
  for(let c=start;c<start+3;c++)g.board[9][c]=0;
  g.board[9][swapped]=1;g.board[8][swapped]=0;
  assert.ok(playSwap(g,{row:8,col:swapped},{row:9,col:swapped}));
  const first=g.lastAnimation.steps[0];
  assert.equal(first.delivered,true);assert.deepEqual(first.deliveredAt,{row:9,col});
  assert.equal(first.spawned,null);assert.equal(count(first.afterDelivery),0);
  for(const step of g.lastAnimation.steps.slice(1))if(step.spawned)assert.ok(step.cleared.some(([r,c])=>c===step.spawned.entryCol));
});

test('an active crown prevents a second one at the other entry',()=>{
  const g=fixture();g.board[6][3]=CROWN;
  const step=localMatch(g,2,4);assert.equal(step.spawned,null);assert.equal(count(step.afterGravity),1);
});

for(const col of [2,5])test(`neighbouring exit cell ${col} also delivers the crown`,()=>{
  const g=fixture();g.board[8][col]=CROWN;
  const start=col===2?1:4,swapped=col===2?3:6;
  for(let c=start;c<start+3;c++)g.board[9][c]=0;
  g.board[9][swapped]=1;g.board[8][swapped]=0;
  assert.ok(playSwap(g,{row:8,col:swapped},{row:9,col:swapped}));
  const first=g.lastAnimation.steps[0];
  assert.equal(first.delivered,true);
  assert.deepEqual(first.deliveredAt,{row:9,col});
  assert.equal(g.crowns,1);
});

test('successor waits in an empty board until the next eligible match',()=>{
  const g=fixture();g.crowns=1;
  assert.equal(localMatch(g,0,2).spawned,null);
  const next=fixture();next.crowns=1;
  assert.ok(localMatch(next,1,1).spawned);
});

test('whole parties never have two active crowns or more than three supplied crowns',()=>{
  for(let seed=1;seed<=60;seed++){
    const g=createGame(seed);let supplied=0;
    while(!g.finished){
      const hint=findHint(g.board);assert.ok(hint);assert.ok(playSwap(g,...hint));
      for(const step of g.lastAnimation.steps){
        if(step.spawned){supplied++;assert.ok(ENTRY_COLS.includes(step.spawned.entryCol));assert.ok(step.cleared.some(([r,c])=>c===step.spawned.entryCol));}
        assert.ok(count(step.afterGravity)<=1);assert.ok(count(step.afterDelivery)<=1);
      }
      assert.ok(supplied<=3);assert.equal(supplied,g.crowns+count(g.board));
      assert.equal(g.board.length,ROWS);assert.ok(g.board.every(row=>row.length===COLS));
    }
  }
});

for(const col of ENTRY_COLS)test(`swapping crown into exit ${col} completes the neighboring match and delivers`,()=>{
  const g=fixture(), direction=col===1?1:-1;
  g.board[8][col]=CROWN;g.board[9][col]=1;
  g.board[8][col+direction]=1;g.board[8][col+direction*2]=1;
  const a={row:8,col},b={row:9,col};
  const before=structuredClone(g.board),moves=g.moves;
  assert.equal(canSwap(g.board,a,b),true);
  assert.deepEqual(g.board,before);
  assert.equal(playSwap(g,a,b),true);
  assert.equal(g.moves,moves-1);
  const first=g.lastAnimation.steps[0];
  assert.equal(first.delivered,true);
  assert.deepEqual(first.deliveredAt,b);
  assert.equal(first.spawned,null);
  assert.equal(g.crowns,1);
  assert.ok(!first.cleared.some(([row,c])=>row===9&&c===col));
});

test('crown swaps without a match, with obstacles or rainbow remain invalid and cost no moves',()=>{
  const g=fixture();g.board[8][6]=CROWN;
  const before=structuredClone(g.board),moves=g.moves;
  assert.equal(playSwap(g,{row:8,col:6},{row:9,col:6}),false);
  assert.deepEqual(g.board,before);assert.equal(g.moves,moves);
  assert.equal(canSwap(g.board,{row:8,col:6},{row:8,col:7}),false);
  g.board[9][6]=30;
  assert.equal(canSwap(g.board,{row:8,col:6},{row:9,col:6}),false);
});
