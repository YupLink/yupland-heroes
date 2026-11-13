import test from 'node:test';
import assert from 'node:assert/strict';
import {gravity,seededRandom,STONE,EMPTY,CROWN,makeMask,createGame,playSwap,canSwap,ROWS,COLS} from './engine.mjs';
const solid=()=>Array.from({length:ROWS},()=>Array(COLS).fill(4));

test('a crown rolls diagonally around a fixed stone into a blocked cavity',()=>{
  const board=solid(),paths=[];
  board[2][1]=CROWN;board[3][1]=STONE;board[2][2]=STONE;board[2][3]=STONE;board[3][2]=EMPTY;
  gravity(board,seededRandom(1),null,paths);
  assert.equal(board[3][2],CROWN);assert.equal(board[3][1],STONE);
  const route=paths.find(p=>p.value===CROWN);
  assert.deepEqual(route.from,{row:2,col:1});assert.deepEqual(route.path,[{row:2,col:1},{row:3,col:2}]);
});

test('a crown takes the gap left by a falling neighbour before that column refills',()=>{
  const board=solid(),paths=[];
  board[2][1]=CROWN;board[3][1]=STONE;board[4][1]=STONE;
  board[2][0]=3;board[3][0]=2;board[4][0]=EMPTY;
  gravity(board,seededRandom(1),null,paths);
  assert.equal(board[3][0],CROWN);
  assert.deepEqual(paths.find(p=>p.value===CROWN).path,[{row:2,col:1},{row:3,col:0}]);
});

for(const [col,side] of [[1,2],[6,5]])test(`crown above obstacle ${col} takes an adjacent cleared cell before its neighbour refills it`,()=>{
  const board=solid(),paths=[];
  board[4][col]=CROWN;board[5][col]=STONE;board[6][col]=STONE;board[5][side]=EMPTY;
  gravity(board,seededRandom(4),null,paths);
  assert.equal(board[5][side],CROWN);
  assert.deepEqual(paths.find(p=>p.value===CROWN).path,[{row:4,col},{row:5,col:side}]);
});

test('a supported ordinary piece can also roll into a neighbouring open column',()=>{
  const board=solid(),paths=[];
  board[2][1]=0;board[3][1]=STONE;board[3][2]=EMPTY;
  gravity(board,seededRandom(4),null,paths);
  assert.equal(board[3][2],0);
});

test('straight falling has priority over a diagonal slide',()=>{
  const board=solid(),paths=[];
  board[2][1]=CROWN;board[3][1]=EMPTY;board[3][2]=EMPTY;
  gravity(board,seededRandom(2),null,paths);
  assert.equal(board[3][1],CROWN);
  assert.ok(!paths.find(p=>p.value===CROWN).path.some(p=>p.col!==1));
});

test('a crown falls straight into its exit before a supported neighbour can take that vacancy',()=>{
  const board=solid(),paths=[];
  board[8][1]=CROWN;board[9][1]=EMPTY;board[9][0]=STONE;
  gravity(board,seededRandom(7),null,paths);
  assert.equal(board[9][1],CROWN);
});

test('a vacancy below stone receives a neighbouring piece, not a new piece through stone',()=>{
  const board=solid(),paths=[];
  board[3][1]=STONE;board[4][1]=EMPTY;
  gravity(board,seededRandom(3),null,paths);
  assert.equal(board[4][1],4);
  const route=paths.find(p=>p.path.at(-1).row===4&&p.path.at(-1).col===1);
  assert.ok(route.from);assert.equal(route.from.row,3);assert.equal(Math.abs(route.from.col-1),1);
  for(const p of paths.filter(p=>!p.from))assert.equal(p.path[0].row,-1);
});

test('gravity routes reconstruct every cascade without missing or duplicating a piece',()=>{
  for(let seed=1;seed<=30;seed++){
    const game=createGame(seed);
    for(let turn=0;turn<25&&!game.finished;turn++){
      let pair;
      outer:for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)for(const b of [{row:r+1,col:c},{row:r,col:c+1}])if(canSwap(game.board,{row:r,col:c},b)){pair=[{row:r,col:c},b];break outer;}
      const before=game.board.map(r=>[...r]);[before[pair[0].row][pair[0].col],before[pair[1].row][pair[1].col]]=[before[pair[1].row][pair[1].col],before[pair[0].row][pair[0].col]];
      playSwap(game,...pair);
      let visual=before;
      const apply=paths=>{
        const moves=paths.map(p=>{if(p.from)assert.equal(visual[p.from.row][p.from.col],p.value);return p;});
        for(const p of moves)if(p.from)visual[p.from.row][p.from.col]=EMPTY;
        for(const p of moves){for(let i=1;i<p.path.length;i++){assert.equal(p.path[i].row,p.path[i-1].row+1);assert.ok(Math.abs(p.path[i].col-p.path[i-1].col)<=1);assert.ok(makeMask()[p.path[i].row][p.path[i].col]===null);}const end=p.path.at(-1);assert.equal(visual[end.row][end.col],EMPTY);visual[end.row][end.col]=p.value;}
      };
      for(const step of game.lastAnimation.steps){
        for(const p of step.transformed)visual[p.row][p.col]=p.value;
        for(const p of step.created)visual[p.row][p.col]=p.value;
        for(const [r,c] of step.cleared)visual[r][c]=EMPTY;
        apply(step.gravityPaths);assert.deepEqual(visual,step.afterGravity);
        if(step.delivered){visual[step.deliveredAt.row][step.deliveredAt.col]=EMPTY;apply(step.deliveryPaths);}
        assert.deepEqual(visual,step.afterDelivery);assert.ok(visual.flat().every(v=>v!==EMPTY));
      }
    }
  }
});
