// Match scanning, adjacent swapping, seed selection and column gravity adapted
// from neo423/gem-blocks (MIT), commit 04bce8327830244798acf93976be86b4b1dfb890.
// Crown, obstacles, irregular board, payout and move rules are new to this prototype.
export const ROWS = 10;
export const COLS = 8;
export const MOVES = 30;
export const ENTRY_GOLD = 100;
export const CROWN_GOLD = 50;
export const TARGET_CROWNS = 3;
export const EMPTY = -1;
export const STONE = -2;
export const HOLE = -3;
export const CROWN = 5;
export const GEM_COUNT = 5;
export const SPECIAL = { NONE:0, RAY_H:1, RAY_V:2, BURST:3, RAINBOW:4 };
export const specialType = value => value>=15 ? Math.floor((value-10)/GEM_COUNT) : 0;
export const colorOf = value => value>=15 && specialType(value)!==SPECIAL.RAINBOW ? (value-10)%GEM_COUNT : value>=0 && value<GEM_COUNT ? value : -1;
const specialValue = (type,color=0) => 10+type*GEM_COUNT+color;
export const ENTRY_COLS = [1,6];
export const EXIT_COLS = [1,2,5,6];
export const EXITS = EXIT_COLS.map(col=>({row:ROWS-1,col}));
export const EXIT = EXITS[0];
export const CROWN_START = { row: 0, col: ENTRY_COLS[0] };

const HOLES = [[0,0],[0,7],[1,0],[8,7],[9,0],[9,7]];
const STONES = [[3,1],[4,1],[5,6],[6,6]];

export function seededRandom(initialSeed) {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

export function makeMask() {
  const mask = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (const [r,c] of HOLES) mask[r][c] = HOLE;
  for (const [r,c] of STONES) mask[r][c] = STONE;
  return mask;
}

export function findRuns(board) {
  const runs = [];
  for (let row = 0; row < ROWS; row++) {
    let col = 0;
    while (col < COLS) {
      const value = colorOf(board[row][col]);
      if (value < 0) { col++; continue; }
      const start = col;
      while (col < COLS && colorOf(board[row][col]) === value) col++;
      if (col - start >= 3) runs.push({ value, direction:'h', length: col-start, cells: Array.from({length:col-start},(_,i)=>({row,col:start+i})) });
    }
  }
  for (let col = 0; col < COLS; col++) {
    let row = 0;
    while (row < ROWS) {
      const value = colorOf(board[row][col]);
      if (value < 0) { row++; continue; }
      const start = row;
      while (row < ROWS && colorOf(board[row][col]) === value) row++;
      if (row-start >= 3) runs.push({ value, direction:'v', length:row-start, cells:Array.from({length:row-start},(_,i)=>({row:start+i,col})) });
    }
  }
  return runs;
}

export function adjacent(a,b) { return Math.abs(a.row-b.row)+Math.abs(a.col-b.col) === 1; }
export function inside(a) { return a.row>=0 && a.row<ROWS && a.col>=0 && a.col<COLS; }
export function swap(board,a,b) { [board[a.row][a.col],board[b.row][b.col]]=[board[b.row][b.col],board[a.row][a.col]]; }
export function canSwap(board,a,b) {
  if (!inside(a) || !inside(b) || !adjacent(a,b)) return false;
  const va=board[a.row][a.col],vb=board[b.row][b.col];
  if(va<0||vb<0)return false;
  if(va!==CROWN&&vb!==CROWN&&(specialType(va)===SPECIAL.RAINBOW||specialType(vb)===SPECIAL.RAINBOW))return true;
  const ta=specialType(va),tb=specialType(vb),ray=t=>t===SPECIAL.RAY_H||t===SPECIAL.RAY_V;
  if((ta===SPECIAL.BURST&&tb===SPECIAL.BURST)||(ray(ta)&&ray(tb))||(ray(ta)&&tb===SPECIAL.BURST)||(ray(tb)&&ta===SPECIAL.BURST))return true;
  swap(board,a,b);
  const valid = findRuns(board).some(run => run.cells.some(cell =>
    (cell.row===a.row && cell.col===a.col) || (cell.row===b.row && cell.col===b.col)));
  swap(board,a,b);
  return valid;
}
export function findHint(board) {
  for (let row=0;row<ROWS;row++) for (let col=0;col<COLS;col++) {
    const a={row,col};
    for (const b of [{row,col:col+1},{row:row+1,col}]) if (canSwap(board,a,b)) return [a,b];
  }
  return null;
}

function fillWithoutMatches(board,random) {
  for (let row=0;row<ROWS;row++) for (let col=0;col<COLS;col++) {
    if (board[row][col] === HOLE || board[row][col] === STONE || board[row][col] === CROWN) continue;
    const candidates=[0,1,2,3,4];
    for (let i=candidates.length-1;i>0;i--) {
      const j=Math.floor(random()*(i+1));
      [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
    }
    board[row][col]=candidates.find(value =>
      !(col>=2 && board[row][col-1]===value && board[row][col-2]===value) &&
      !(row>=2 && board[row-1][col]===value && board[row-2][col]===value)) ?? candidates[0];
  }
}

export function makeBoard(random=seededRandom(20261103),crown=false) {
  for (let attempt=0;attempt<1000;attempt++) {
    const board=makeMask().map(row=>row.map(value=>value ?? EMPTY));
    if (crown) board[CROWN_START.row][CROWN_START.col]=CROWN;
    fillWithoutMatches(board,random);
    if (!findRuns(board).length && findHint(board)) return board;
  }
  throw new Error('Не удалось создать поле с доступным ходом');
}

// Every token keeps its actual route so the renderer can animate diagonal slides
// around obstacles instead of reconstructing motion from final column values.
export function gravity(board,random,crownColumn=null,paths=[],freezeCrown=false) {
  const tokens=board.map((line,row)=>line.map((value,col)=>value>=0&&!(freezeCrown&&value===CROWN)?{value,from:{row,col},path:[{row,col}]}:null));
  const all=tokens.flat().filter(Boolean);
  let crown=null;
  const move=(row,col,toRow,toCol)=>{
    const token=tokens[row][col];
    tokens[toRow][toCol]=token;tokens[row][col]=null;
    board[toRow][toCol]=board[row][col];board[row][col]=EMPTY;
    token.path.push({row:toRow,col:toCol});
    // When a neighbouring piece falls away, give the crown the newly opened
    // diagonal gap before the next piece in that column immediately fills it.
    if(token.value!==CROWN&&row>0){
      for(const sourceCol of [col-1,col+1]){
        if(sourceCol<0||sourceCol>=COLS||tokens[row-1][sourceCol]?.value!==CROWN)continue;
        if(board[row][sourceCol]!==STONE&&board[row][sourceCol]!==HOLE)continue;
        move(row-1,sourceCol,row,col);
        break;
      }
    }
  };
  for(let round=0;round<ROWS*COLS*ROWS;round++){
    let moved=false;
    // Never let a neighbouring piece take an open cell directly below a crown.
    for(let row=ROWS-2;row>=0;row--)for(let col=0;col<COLS;col++){
      if(tokens[row][col]?.value===CROWN&&board[row+1][col]===EMPTY){move(row,col,row+1,col);moved=true;}
    }
    // A piece resting on a fixed block claims an adjacent cleared cell before
    // the neighbouring column refills it. Crowns get first choice of that gap.
    for(const crownFirst of [true,false])for(let row=ROWS-2;row>=0;row--)for(let col=0;col<COLS;col++){
      if(!tokens[row][col]||(board[row][col]===CROWN)!==crownFirst)continue;
      if(board[row+1][col]!==STONE&&board[row+1][col]!==HOLE&&!(freezeCrown&&board[row+1][col]===CROWN))continue;
      const sides=col<COLS/2?[col+1,col-1]:[col-1,col+1];
      const side=sides.find(c=>c>=0&&c<COLS&&board[row+1][c]===EMPTY);
      if(side!==undefined){move(row,col,row+1,side);moved=true;}
    }
    // Unobstructed pieces still fall straight before ordinary cavity filling.
    for(let row=ROWS-2;row>=0;row--)for(let col=0;col<COLS;col++){
      if(tokens[row][col]&&board[row+1][col]===EMPTY){move(row,col,row+1,col);moved=true;}
    }
    if(moved)continue;
    // Only feed diagonal cavities whose vertical supply is cut off by a block.
    // A vacancy connected to the sky is filled from above instead.
    for(let row=ROWS-1;row>0;row--)for(let col=0;col<COLS;col++){
      if(board[row][col]!==EMPTY)continue;
      let above=row-1;while(above>=0&&board[above][col]===EMPTY)above--;
      if(above<0||(board[above][col]>=0&&!(freezeCrown&&board[above][col]===CROWN)))continue;
      const candidates=col<COLS/2?[col+1,col-1]:[col-1,col+1];
      const source=candidates.find(c=>c>=0&&c<COLS&&tokens[row-1][c]&&board[row][c]!==EMPTY);
      if(source!==undefined){move(row-1,source,row,col);moved=true;}
    }
    if(moved)continue;
    // New pieces enter only at the real top of the board, never below a stone.
    for(let col=0;col<COLS;col++)if(board[0][col]===EMPTY){
      const value=!crown&&col===crownColumn?CROWN:Math.floor(random()*GEM_COUNT);
      const token={value,from:null,path:[{row:-1,col},{row:0,col}]};
      if(value===CROWN)crown=token;
      all.push(token);tokens[0][col]=token;board[0][col]=value;moved=true;
    }
    if(!moved)break;
  }
  for(const token of all)if(token.path.length>1)paths.push(token);
  return crown?{...crown.path.at(-1),entryCol:crownColumn}:null;
}

export function createGame(seed=2) {
  const random=seededRandom(seed);
  return {board:makeBoard(random),random,moves:MOVES,crowns:0,grecha:0,chain:0,finished:false,lastGain:0,lastAnimation:null,lastEntryCol:ENTRY_COLS[1]};
}

const snapshot = board => board.map(row=>[...row]);

const cellId = cell => `${cell.row},${cell.col}`;
const fromId = id => { const [row,col]=id.split(',').map(Number); return {row,col}; };

// Rays, Rainbow and L/T Bursts follow the developer's planSpecials/expand rules.
function planSpecials(runs,preferred){
  const created=new Map();
  const put=(cell,type,color)=>{
    const id=cellId(cell),old=created.get(id);
    if(!old || type>old.type)created.set(id,{cell,type,color});
  };
  const pick=run=>run.cells.find(cell=>preferred.some(p=>cellId(p)===cellId(cell)))??run.cells[Math.floor(run.length/2)];
  for(const run of runs){
    if(run.length>=5)put(pick(run),SPECIAL.RAINBOW,run.value);
    else if(run.length===4)put(pick(run),run.direction==='h'?SPECIAL.RAY_V:SPECIAL.RAY_H,run.value);
  }
  for(const h of runs.filter(r=>r.direction==='h'))for(const v of runs.filter(r=>r.direction==='v')){
    const intersection=h.cells.find(cell=>v.cells.some(other=>cellId(other)===cellId(cell)));
    if(intersection)put(intersection,SPECIAL.BURST,h.value);
  }
  return created;
}

function expandRemoval(board,initial,created,consumed=new Set(),effects=[]) {
  // Matches reserve new bonuses. Only an explosion can clear that reservation.
  // Queue the original bonus separately so replacing a bomb cannot silence it.
  const cleared=new Set([...initial].filter(id=>!created.has(id)));
  const queue=[...initial].map(id=>({id,value:board[fromId(id).row][fromId(id).col],original:true}));
  while(queue.length){
    const {id:source,value,original}=queue.pop(),cell=fromId(source),type=specialType(value);
    if(original&&consumed.has(source))continue;
    if(!type||type===SPECIAL.RAINBOW)continue;
    const affected=[];
    if(type===SPECIAL.RAY_H){
      effects.push({type:'h',row:cell.row,col:0});
      for(let col=0;col<COLS;col++)affected.push({row:cell.row,col});
    }
    if(type===SPECIAL.RAY_V){
      effects.push({type:'v',row:0,col:cell.col});
      for(let row=0;row<ROWS;row++)affected.push({row,col:cell.col});
    }
    if(type===SPECIAL.BURST)for(let row=cell.row-1;row<=cell.row+1;row++)for(let col=cell.col-1;col<=cell.col+1;col++)affected.push({row,col});
    for(const other of affected){
      if(!inside(other))continue;
      const id=cellId(other),target=board[other.row][other.col];
      if(target<0||target===CROWN||cleared.has(id))continue;
      cleared.add(id);
      const bonus=created.get(id);
      queue.push({id,value:bonus?specialValue(bonus.type,bonus.color):target,original:!bonus});
    }
  }
  return cleared;
}

function resolve(game, animation, preferred, firstClear, finale=false) {
  let chain=0, gain=0;
  let forced=firstClear;
  while (chain<40) {
    const runs=forced?[]:findRuns(game.board);
    if (!runs.length&&!forced) break;
    chain++;
    const created=forced||finale?new Map():planSpecials(runs,chain===1?preferred:[]);
    const initial=forced??new Set(runs.flatMap(run=>run.cells.map(cellId)));
    const effects=chain===1?[...animation.effects]:[];
    const cells=expandRemoval(game.board,initial,created,chain===1?new Set(animation.consumed):new Set(),effects);
    forced=null;
    const waveGain=cells.size + runs.reduce((n,run)=>n+(run.length>=5?5:run.length===4?2:0),0) + (chain>1?chain*2:0);
    gain += waveGain;
    for (const key of cells) {
      const [row,col]=key.split(',').map(Number);
      game.board[row][col]=EMPTY;
    }
    for(const [id,{cell,type,color}] of created)if(!cells.has(id))game.board[cell.row][cell.col]=specialValue(type,color);
    // Crown supply uses a real refill vacancy connected to a marked top entry.
    // A delivery never spawns its successor by itself: a later clear is required.
    let crownColumn=null;
    if(!finale&&game.crowns<TARGET_CROWNS&&!game.board.some(row=>row.includes(CROWN))){
      const eligible=ENTRY_COLS.filter(col=>{
        for(let row=0;row<ROWS;row++){
          if(game.board[row][col]===STONE||game.board[row][col]===HOLE)return false;
          if(game.board[row][col]===EMPTY)return true;
        }
        return false;
      });
      crownColumn=eligible.find(col=>col!==game.lastEntryCol)??eligible[0]??null;
    }
    const gravityPaths=[];
    const spawned=gravity(game.board,game.random,crownColumn,gravityPaths,finale);
    if(spawned)game.lastEntryCol=spawned.entryCol;
    const afterGravity=snapshot(game.board);
    let delivered=false;
    const deliveryPaths=[];
    const deliveredAt=finale?null:EXITS.find(cell=>game.board[cell.row][cell.col]===CROWN)??null;
    if (deliveredAt) {
      delivered=true;
      game.crowns++;
      game.board[deliveredAt.row][deliveredAt.col]=EMPTY;
      gravity(game.board,game.random,null,deliveryPaths);
    }
    animation.steps.push({transformed:chain===1?animation.transformed:[],effects,consumed:chain===1?animation.consumed:[],cleared:[...cells].map(key=>key.split(',').map(Number)),created:[...created.values()].map(({cell,type,color})=>({row:cell.row,col:cell.col,value:specialValue(type,color)})),spawned,gravityPaths,deliveryPaths,afterGravity,afterDelivery:snapshot(game.board),delivered,deliveredAt,wave:chain,gained:waveGain,runs:runs.map(run=>({length:run.length,cells:run.cells}))});
  }
  game.grecha+=gain;
  game.lastGain=gain;
  game.chain=chain;
  if (game.crowns===TARGET_CROWNS || game.moves===0) game.finished=true;
  if (!game.finished && !findHint(game.board)) {
    const crown=game.board.flatMap((row,r)=>row.map((value,c)=>value===CROWN?{row:r,col:c}:null)).find(Boolean);
    const fresh=makeBoard(game.random,false);
    if (crown) fresh[crown.row][crown.col]=CROWN;
    game.board=fresh;
    animation.shuffled=true;
  }
  animation.final=snapshot(game.board);
}

export function playSwap(game,a,b) {
  if (game.finished || !canSwap(game.board,a,b)) return false;
  const animation={a:{...a},b:{...b},steps:[],spawned:false,shuffled:false,final:null,transformed:[],effects:[],consumed:[]};
  swap(game.board,a,b);
  const va=game.board[a.row][a.col],vb=game.board[b.row][b.col];
  let firstClear=null;
  const ta=specialType(va),tb=specialType(vb),ray=t=>t===SPECIAL.RAY_H||t===SPECIAL.RAY_V;
  const add=(set,row,col)=>{const cell={row,col};if(inside(cell)&&game.board[row][col]>=0&&game.board[row][col]!==CROWN)set.add(cellId(cell));};
  if(specialType(va)===SPECIAL.RAINBOW||specialType(vb)===SPECIAL.RAINBOW){
    const color=specialType(va)===SPECIAL.RAINBOW?colorOf(vb):colorOf(va);
    firstClear=new Set([cellId(specialType(va)===SPECIAL.RAINBOW?a:b)]);
    if(color<0){for(let row=0;row<ROWS;row++)for(let col=0;col<COLS;col++)if(game.board[row][col]>=0&&game.board[row][col]!==CROWN)firstClear.add(`${row},${col}`);}
    else {
      const partnerType=ta===SPECIAL.RAINBOW?tb:ta;
      for(let row=0;row<ROWS;row++)for(let col=0;col<COLS;col++)if(colorOf(game.board[row][col])===color){
        if(ray(partnerType)||partnerType===SPECIAL.BURST){
          const value=specialValue(partnerType,color);game.board[row][col]=value;
          animation.transformed.push({row,col,value});
        }
        firstClear.add(`${row},${col}`);
      }
    }
  } else if(ta===SPECIAL.BURST&&tb===SPECIAL.BURST){
    firstClear=new Set([cellId(a),cellId(b)]);
    animation.consumed=[cellId(a),cellId(b)];
    for(let row=b.row-2;row<=b.row+2;row++)for(let col=b.col-2;col<=b.col+2;col++)add(firstClear,row,col);
    animation.effects.push({type:'burst',row:b.row,col:b.col,radius:2});
  } else if((ray(ta)&&ray(tb))||(ray(ta)&&tb===SPECIAL.BURST)||(ray(tb)&&ta===SPECIAL.BURST)){
    firstClear=new Set([cellId(a),cellId(b)]);
    animation.consumed=[cellId(a),cellId(b)];
    const radius=ray(ta)&&ray(tb)?0:1;
    for(let offset=-radius;offset<=radius;offset++){
      const row=b.row+offset,col=b.col+offset;
      if(row>=0&&row<ROWS){for(let x=0;x<COLS;x++)add(firstClear,row,x);animation.effects.push({type:'h',row,col:0});}
      if(col>=0&&col<COLS){for(let y=0;y<ROWS;y++)add(firstClear,y,col);animation.effects.push({type:'v',row:0,col});}
    }
  }
  game.moves--;
  resolve(game,animation,[a,b],firstClear);
  game.lastAnimation=animation;
  return true;
}

export function finishBonuses(game) {
  if (!game.finished || game.finalePlayed) return null;
  game.finalePlayed=true;
  const animation={steps:[],transformed:[],effects:[],consumed:[]};
  const gems=[];
  const bonuses=new Set();
  const colorClears=new Set();
  game.board.forEach((line,row)=>line.forEach((value,col)=>{
    if(specialType(value)){
      bonuses.add(cellId({row,col}));
      if(specialType(value)===SPECIAL.RAINBOW)colorClears.add(Math.floor(game.random()*GEM_COUNT));
    }else if(value>=0&&value<GEM_COUNT){
      gems.push({row,col,value});
    }
  }));
  // Each unused move becomes one bonus, on a different ordinary gem.
  for(let left=game.moves;left>0&&gems.length;left--){
    const [gem]=gems.splice(Math.floor(game.random()*gems.length),1);
    const {row,col}=gem;
    const value=specialValue(1+Math.floor(game.random()*3),gem.value);
    game.board[row][col]=value;
    animation.transformed.push({row,col,value});
    bonuses.add(cellId(gem));
  }
  for(const gem of gems)if(colorClears.has(gem.value))bonuses.add(cellId(gem));
  game.moves=0;
  if(bonuses.size)resolve(game,animation,[],bonuses,true);
  return animation;
}

export function payout(game) {
  const returned=game.crowns*CROWN_GOLD;
  return { entry:ENTRY_GOLD, returned, net:returned-ENTRY_GOLD, grecha:game.grecha };
}
