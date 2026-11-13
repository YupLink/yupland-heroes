import './style.css';
import './kingdom.css';
import './screen.css';
import './start.css';
import './evening.css';
import './sound.css';
import {titles,crownLabel,translate,localize} from './i18n.mjs';
import {COLS,ROWS,MOVES,TARGET_CROWNS,CROWN,STONE,HOLE,ENTRY_COLS,EXITS,SPECIAL,colorOf,specialType,createGame,canSwap,playSwap,finishBonuses,payout} from './engine.mjs';
import {createInventory} from './inventory.mjs';
import {bridge,inventory as serverInventory,serverGame,applyMove,takeFinale,errorText,warmImages} from './bridge.mjs';
import {createSoundPreview} from './sound-preview.mjs';

// Keyed pieces and the remove/fall/refill sequence adapt PlayBoard.tsx from
// the developer-supplied YupMatch archive (02 Nov 2026).
const names=['гречневое зерно','колос','лист','ягоды','цветок','корона'];
const siteDemo=import.meta.env.MODE==='site-demo';
function hasGameHost(){
  if(siteDemo||window.parent===window)return false;
  try{return window.parent.location.origin===location.origin;}catch{return false;}
}
const embedded=hasGameHost();
if(embedded)warmImages();
const demoSession=siteDemo?new URLSearchParams(location.search).get('session'):null;
function notifyDemoHost(type){
  if(demoSession&&window.parent!==window){
    window.parent.postMessage({type,session:demoSession},location.origin);
  }
}
const app=document.querySelector('#app');
const soundPreview=createSoundPreview(embedded);
const previewBoard=createGame().board;
let nextId=1,game=null,selected=null,pointerStart=null,ignoreClick=false,busy=false;
let finale=null;
let pieces=makePieces(previewBoard),exitOpen=false,soundOpen=false;
const qaMode=import.meta.env.DEV&&[...new URLSearchParams(location.search).keys()].some(k=>k.startsWith('qa'));
const inventory=embedded?serverInventory:siteDemo?null:createInventory(localStorage,qaMode?'buckwheat-match3:qa-crowns':'buckwheat-match3:crowns');
const language=new URLSearchParams(location.search).get('lang')==='en'?'en':'ru';
const tr=value=>translate(value,language);
const crownWord=n=>crownLabel(n,language);
const walletPreview = import.meta.env.DEV && new URLSearchParams(location.search).has('qaWallet');
let walletConnected = walletPreview && new URLSearchParams(location.search).get('qaWallet') === 'connected';
let currency = 'gold';
let walletNotice = false;
let rating = !embedded && import.meta.env.DEV && new URLSearchParams(location.search).has('qaRating') ? 'grecha' : null;
const paymentMethods = {
  gold: { name: 'Золото', price: '100', initialBalance: 1250, multiplier: 1, action: 'Играть за 100 золота' },
  crypto: { name: 'Darai', price: '100 000', initialBalance: 350000, multiplier: 1000, action: 'Играть за 100 000 Darai' },
};

const grechaRecordKey=qaMode?'buckwheat-match3:qa-grecha-record':'buckwheat-match3:grecha-record';
let grechaRecord=null;

function readGrechaRecord() {
  try {
    const stored=localStorage.getItem(grechaRecordKey);
    const score=Number(stored);
    return stored!==null&&Number.isSafeInteger(score)&&score>=0?score:null;
  }catch{return null;}
}

function recordGrecha(round) {
  if(!round.finished)return;
  const previous=readGrechaRecord();
  grechaRecord=Math.max(round.grecha,grechaRecord??0,previous??0);
  if(previous===grechaRecord)return;
  try{localStorage.setItem(grechaRecordKey,String(grechaRecord));}catch{}
}

const balanceKey=qaMode?'buckwheat-match3:qa-balances':'buckwheat-match3:balances';
const balances=Object.fromEntries(Object.entries(paymentMethods).map(([key,method])=>[key,method.initialBalance]));
try {
  const saved=siteDemo||embedded?null:JSON.parse(localStorage.getItem(balanceKey));
  for(const key of Object.keys(balances)){
    if(Number.isSafeInteger(saved?.[key])&&saved[key]>=0)balances[key]=saved[key];
  }
}catch{}
let balanceNotice=false;
let serverNotice='',ratingRows=null,starting=false,exiting=false,serverLoading=embedded;

function updateBalance(key, amount) {
  balances[key]+=amount;
  try { localStorage.setItem(balanceKey,JSON.stringify(balances)); }catch{}
}

function settleRound(round) {
  if(siteDemo||!round||round.settlement)return;
  if(embedded){
    round.settlement=round.serverSettlement ? {amount:round.serverSettlement.returned} : null;
    takeServerBalances();
    return;
  }
  const {returned}=payout(round);
  const {multiplier}=paymentMethods[round.entryCurrency];
  const amount=returned*multiplier;
  round.settlement={amount};
  updateBalance(round.entryCurrency,amount);
  recordGrecha(round);
}

function takeServerBalances(){balances.gold=bridge.gold;balances.crypto=bridge.darai;}

// Yupland Heroes: слова партии на фантики (08.11) — сразу на языке игрока.
const DEMO_WORDS = {
  name: ['Фантики', 'Play coins'], demo: ['Демо', 'Demo'],
  play: ['Играть за 100 фантиков', 'Play for 100 play coins'], unit: ['фантиков', 'play coins'],
};
const demoWord = key => DEMO_WORDS[key][language === 'en' ? 1 : 0];

function startWindow() {
  if(embedded){
    walletConnected=bridge.daraiOpen&&!bridge.demo;
    if(!walletConnected)currency='gold';
  }
  const methods = walletConnected ? ['gold', 'crypto'] : ['gold'];
  return `<div class="overlay start-overlay">
    <section class="green-start${siteDemo ? ' site-demo-start' : ''}" role="dialog" aria-modal="true" aria-labelledby="start-title">
      <div class="start-content">
        <h2 id="start-title">Верни короны</h2>
        <img class="start-divider" src="${import.meta.env.BASE_URL}art/start-divider.webp" alt="">
        <p class="start-goal">Опусти 3 короны за ${MOVES} ходов</p>
        ${siteDemo ? '<p class="start-goal site-demo-note">Результат демопартии не сохраняется</p><button class="primary start-play" data-action="start">Играть</button>' : `
        ${embedded ? '' : walletConnected
          ? '<p class="wallet-status">Кошелёк подключён</p>'
          : '<button class="start-secondary wallet-status" data-action="wallet">Подключить кошелёк</button>'}
        ${serverNotice ? `<p class="wallet-notice" role="status">${serverNotice}</p>` : ''}
        ${!embedded && walletNotice ? '<p class="wallet-notice" role="status">Подключение кошелька сейчас недоступно</p>' : ''}
        ${balanceNotice ? `<p class="wallet-notice balance-notice" role="status">${language==='en'?'Insufficient balance':'Недостаточно средств для входа'}</p>` : ''}
        <fieldset class="payment-methods" aria-label="Валюта входа">
          ${methods.map(key => {
            const method = paymentMethods[key];
            const coins=embedded&&bridge.demo&&bridge.pass;
            const balance=coins?demoWord('demo'):`Баланс ${formatRating(balances[key])}`;
            return `<label class="payment-row">
              <input type="radio" name="entry-currency" value="${key}" ${currency === key ? 'checked' : ''}>
              <strong>${coins?demoWord('name'):method.name}</strong>
              <span><b>Вход ${method.price}</b><small>${balance}</small></span>
            </label>`;
          }).join('')}
        </fieldset>
        <button class="primary start-play" data-action="start" ${serverLoading?'disabled':''}>${embedded&&bridge.demo&&bridge.pass?demoWord('play'):paymentMethods[currency].action}</button>
        <div class="start-links">
          <button class="start-secondary" data-action="rating"><span class="start-action-icon start-action-rating" aria-hidden="true"></span>Рейтинг</button>
          ${embedded&&bridge.admin?`<button class="start-secondary" data-action="stats">${tr('Статистика')}</button>`: ''}
        </div>
        `}
      </div>
    </section>
  </div>`;
}

function exitWindow() {
  return `<div class="overlay start-overlay exit-overlay">
    <section class="green-start green-exit" role="alertdialog" aria-modal="true" aria-labelledby="exit-title" aria-describedby="exit-message">
      <div class="start-content exit-content">
        <h2 id="exit-title">Выйти из игры?</h2>
        <img class="start-divider" src="${import.meta.env.BASE_URL}art/start-divider.webp" alt="">
        ${embedded&&serverNotice?`<p class="wallet-notice" role="status">${serverNotice}</p>`: ''}
        <p id="exit-message">Прогресс текущей партии будет потерян. Продолжить её позже не получится.</p>${siteDemo ? '' : `
        <p class="exit-kept">${language==='en'?'Collected crowns will be paid out in your entry currency.':'За полученные короны начислится выплата в валюте входа.'}</p>`}
        <button class="primary start-play" data-action="cancel-exit">Продолжить игру</button>
        <button class="start-secondary exit-confirm" data-action="confirm-exit">Выйти</button>
      </div>
    </section>
  </div>`;
}

function soundWindow() {
  const settings=soundPreview.getSettings();
  const effectsReady=soundPreview.hasEffects();
  return `<div class="overlay sound-overlay">
    <section class="sound-dialog" role="dialog" aria-modal="true" aria-labelledby="sound-title" tabindex="-1">
      <button class="sound-close" data-action="close-sound" aria-label="Закрыть настройки звука">×</button>
      <h2 id="sound-title">Звук</h2>
      <div class="sound-channel">
        <label class="sound-toggle"><span>Музыка</span><input type="checkbox" data-sound-toggle="musicEnabled" ${settings.musicEnabled?'checked':''}></label>
        <div class="sound-slider-row"><input id="music-volume" class="sound-range" type="range" min="0" max="100" step="1" value="${settings.musicLevel}" style="--level:${settings.musicLevel}%" aria-label="Громкость музыки" data-sound-level="musicLevel"><output data-sound-output="musicLevel" for="music-volume">${settings.musicLevel}%</output></div>
      </div>
      <div class="sound-channel ${effectsReady?'':'sound-unavailable'}">
        <label class="sound-toggle"><span>Эффекты${effectsReady?'':' <small class="sound-pending">скоро</small>'}</span><input type="checkbox" data-sound-toggle="effectsEnabled" ${effectsReady&&settings.effectsEnabled?'checked':''} ${effectsReady?'':'disabled'}></label>
        <div class="sound-slider-row"><input id="effects-volume" class="sound-range" type="range" min="0" max="100" step="1" value="${effectsReady?settings.effectsLevel:0}" style="--level:${effectsReady?settings.effectsLevel:0}%" aria-label="Громкость эффектов" data-sound-level="effectsLevel" ${effectsReady?'':'disabled'}><output data-sound-output="effectsLevel" for="effects-volume">${effectsReady?`${settings.effectsLevel}%`:'—'}</output></div>
      </div>
    </section>
  </div>`;
}

const emptyCrown = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 53 8 34a5 5 0 1 1 5-7l8 8 7-15-4-4 8-10 8 10-4 4 7 15 8-8a5 5 0 1 1 5 7l-4 19q-20 5-40 0Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function resultWindow() {
  const earned = game.crowns;
  const won = earned === TARGET_CROWNS;
  const payoutAmount = game.settlement?.amount;
  const unit = embedded&&bridge.demo ? demoWord('unit') : game.entryCurrency === 'crypto' ? 'Darai' : language === 'en' ? 'gold' : 'золота';
  const label = 'Ваш выигрыш';
  const amount = Number.isFinite(payoutAmount)
    ? `${payoutAmount > 0 ? '+' : ''}${formatRating(payoutAmount)} ${unit}`
    : '—';
  const slots = earned === 1 ? [false,true,false] : Array.from({length:TARGET_CROWNS},(_,i)=>i<earned);
  return `<div class="overlay start-overlay result-overlay">
    <section class="green-start green-result ${won ? 'result-won' : ''}" role="dialog" aria-modal="true" aria-labelledby="result-title" tabindex="-1">
      <div class="start-content result-content">
        <div class="result-summary">
          <h2 id="result-title">${won ? 'Поздравляем!' : siteDemo ? 'Партия завершена' : label}</h2>${won && !siteDemo ? `
          <p class="result-caption">${label}</p>` : ''}${siteDemo ? '' : `
          <p class="round-result">${amount}</p>`}
          <div class="result-crowns" role="img" aria-label="Доставлено корон: ${earned} из ${TARGET_CROWNS}">${slots.map(filled => `<div class="result-crown ${filled ? 'crown-earned' : 'crown-missing'}">${filled ? icon(CROWN) : emptyCrown}</div>`).join('')}</div>
        </div>
        <div class="result-details">
          ${siteDemo ? `<p class="result-earned"><span>Опущено корон</span> <b>${earned} / ${TARGET_CROWNS}</b></p>` : `<p class="result-earned"><span>Всего опущено корон</span> <b>${formatRating(inventory.count())}</b></p>`}
          <p class="result-grecha">${icon(0)}<span>Греча за партию <b>${formatRating(game.grecha)}</b></span></p>
          <button class="primary start-play" data-action="restart">Играть ещё</button>${siteDemo ? '' : `
          <button class="result-rating" data-action="rating"><span class="start-action-icon start-action-rating" aria-hidden="true"></span>Рейтинг</button>`}
        </div>
      </div>
    </section>
  </div>`;
}

// Preview rows are restricted to explicitly enabled local QA mode.
const ratingPreview = [
  {name:'Лесная фея',bestGrecha:690,crowns:96},
  {name:'Гречневый рыцарь',bestGrecha:765,crowns:88},
  {name:'Лис',bestGrecha:708,crowns:81},
  {name:'Мира',bestGrecha:588,crowns:73},
  {name:'Сокол',bestGrecha:540,crowns:65},
];
const formatRating = value => new Intl.NumberFormat(language==='en'?'en-US':'ru-RU').format(value);
function ratingRow(player, place, own = false) {
  return `<tr class="${own ? 'rating-own' : ''}">
    <td class="rating-place"><span class="${place <= 3 ? `rank-medal rank-${place}` : ''}">${place}</span></td>
    <th scope="row">${player.name}</th>
    <td class="rating-score">${icon(rating === 'grecha' ? 0 : CROWN)}<span>${formatRating(rating === 'grecha' ? (embedded?player.grecha:player.bestGrecha) : player.crowns)}</span></td>
  </tr>`;
}
function ratingWindow() {
  const byGrecha=rating==='grecha';
  const savedRecord=byGrecha&&!embedded?readGrechaRecord():null;
  const record=grechaRecord===null?savedRecord:Math.max(grechaRecord,savedRecord??0);
  const players=[...ratingPreview];
  if(byGrecha&&record!==null)players.push({name:'Ты',bestGrecha:record,own:true});
  players.sort(byGrecha?(a,b)=>b.bestGrecha-a.bestGrecha:(a,b)=>b.crowns-a.crowns);
  const serverRows=ratingRows?.[rating]??[];
  const showTable=embedded?serverRows.length>0:qaMode;
  const topRows=embedded?serverRows.filter(row=>row.place<=10):players;
  const ownRows=embedded?serverRows.filter(row=>row.place>10&&row.own):byGrecha?[]:[{name:'Ты',crowns:24,place:18}];
  return `<div class="overlay start-overlay rating-overlay">
    <section class="green-start green-rating" role="dialog" aria-modal="true" aria-labelledby="rating-title">
      <div class="start-content rating-content">
        <h2 id="rating-title">Рейтинг</h2>
        <img class="start-divider" src="${import.meta.env.BASE_URL}art/start-divider.webp" alt="">
        <div class="rating-metrics" role="group" aria-label="Показатель рейтинга">
          <button data-action="rating-grecha" aria-pressed="${rating === 'grecha'}">${icon(0)}Греча</button>
          <button data-action="rating-crowns" aria-pressed="${rating === 'crowns'}">${icon(CROWN)}Короны</button>
        </div>
        <p class="rating-subtitle">${byGrecha ? (embedded?'По всей собранной грече':'Лучшая партия по грече') : 'По доставленным коронам'}</p>
        <div class="rating-results" aria-live="polite">
          ${showTable ? `<table class="rating-table" aria-label="${rating === 'grecha' ? 'Рейтинг по грече' : 'Рейтинг по коронам'}">
            <colgroup><col class="rating-place-column"><col><col class="rating-score-column"></colgroup><thead class="visually-hidden"><tr><th>Место</th><th>Игрок</th><th>${byGrecha&&!embedded ? 'Рекорд за партию' : 'Результат'}</th></tr></thead>
            <tbody>${topRows.map((player,i)=>ratingRow(player,embedded?player.place:i+1,player.own)).join('')}</tbody>
            ${ownRows.map(player=>`<tbody><tr class="rating-gap" aria-hidden="true"><td colspan="3">···</td></tr>
            ${ratingRow(player,player.place,true)}</tbody>`).join('')}
          </table>` : `<div class="rating-empty"><span class="start-action-icon start-action-rating" aria-hidden="true"></span><p>Рейтинг сейчас недоступен</p>${byGrecha&&record!==null?`<p><span>Твой рекорд за партию</span> <b>${formatRating(record)}</b></p>`:''}</div>`}
        </div>
        <button class="primary start-play" data-action="close-rating">Вернуться</button>
      </div>
    </section>
  </div>`;
}

function newGame(){
  const next=createGame();
  if(import.meta.env.DEV){
    const pair={ 'bomb-bomb':[25,28], 'ray-ray':[15,21], 'ray-bomb':[15,26], 'rainbow-ray':[30,15], 'rainbow-bomb':[30,25] }[new URLSearchParams(location.search).get('qaCombo')];
    if(pair){next.board[4][3]=pair[0];next.board[4][4]=pair[1];}
    if(new URLSearchParams(location.search).get('qaCombo')==='created-arrow'){
      next.board[2][1]=2;next.board[2][2]=25;next.board[2][3]=1;
      next.board[2][4]=0;next.board[2][5]=0;next.board[2][6]=2;next.board[3][3]=0;
    }
    if(new URLSearchParams(location.search).get('qaCrown')==='swap-exit'){
      next.board[8][6]=CROWN;
      next.board[8][4]=1;next.board[8][5]=1;next.board[9][6]=1;
    }
    const finaleFixture=new URLSearchParams(location.search).get('qaFinale');
    if(finaleFixture==='win'){
      next.crowns=2;next.moves=5;
      next.board[8][6]=CROWN;
      next.board[8][4]=1;next.board[8][5]=1;next.board[9][6]=1;
    }else if(finaleFixture==='out-of-moves'){
      next.moves=1;
      next.board[4][3]=25;next.board[4][4]=28;
      next.board[0][2]=15;
    }
    if(new URLSearchParams(location.search).get('qaCrown')==='blocked'){
      next.board[4][6]=CROWN;
      next.board[5][3]=0;next.board[5][4]=0;next.board[5][5]=1;next.board[4][5]=0;
    }
  }
  if (import.meta.env.DEV) {
    const result = new URLSearchParams(location.search).get('qaResult');
    const crowns = {win:3, one:1, two:2, zero:0}[result];
    if (crowns !== undefined) {
      next.crowns=crowns;next.moves=0;next.grecha=crowns===3?631:240;next.finished=true;
    }
  }
  return next;
}
function makePieces(board){return board.flatMap((line,row)=>line.flatMap((value,col)=>value>=0?[{id:nextId++,row,col,value}]:[]));}
const wait=(ms,signal)=>new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(signal.reason);return;}
  const abort=()=>{clearTimeout(timer);reject(signal.reason);};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
  signal?.addEventListener('abort',abort,{once:true});
});
const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const icon=kind=>`<span class="icon icon-${kind}" aria-hidden="true"></span>`;
const specialGlyph={1:'↔',2:'↕',3:'✸',4:'★'};
const pieceInner=p=>{const type=specialType(p.value),kind=type?colorOf(p.value):p.value;return `${type===SPECIAL.RAINBOW?'<span class="rainbow-art" aria-hidden="true">✦</span>':icon(kind)}${type?`<b class="power-mark">${specialGlyph[type]}</b>`:''}`;};
const pieceMarkup=p=>`<span class="piece ${p.value===CROWN?'royal':''} ${specialType(p.value)?'powered':''}" data-id="${p.id}" style="transform:translate(${p.col*100}%,${p.row*100}%)">${pieceInner(p)}</span>`;
const routeArrow='<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M14 3h12v16h10L20 37 4 19h10z"/></svg>';
const routeMarkers=()=>`${ENTRY_COLS.map(col=>`<span class="route-marker entry-route" style="--col:${col}">${routeArrow}</span>`).join('')}${EXITS.map(({col})=>`<span class="route-marker exit-route" style="--col:${col}">${routeArrow}</span>`).join('')}`;
function cellMarkup(value,row,col){
  if(value===HOLE)return '<span class="cell hole edge-chest" aria-label="Деревянный сундук"><span class="chest" aria-hidden="true"></span></span>';
  if(value===STONE)return '<span class="cell stone" aria-label="Неподвижный камень"><span class="rock"></span></span>';
  const chosen=selected?.row===row&&selected?.col===col;
  const type=specialType(value),label=type===SPECIAL.RAINBOW?'Радуга':type?`${names[colorOf(value)]}, ${type===SPECIAL.BURST?'Вспышка':'Луч'}`:names[value];
  const entry=row===0&&ENTRY_COLS.includes(col),exit=EXITS.some(cell=>cell.row===row&&cell.col===col);
  return `<button class="cell gem ${chosen?'selected':''} ${entry?'entry':''} ${exit?'exit':''}" data-row="${row}" data-col="${col}" aria-label="${label||'пусто'}, ряд ${row+1}, столбец ${col+1}${entry?', вход короны':''}${exit?', выход короны':''}" aria-pressed="${chosen}"></button>`;
}
// Yupland Heroes (08.11, «картинки моргают, верхняя строка дёргается при каждом ходе»):
// render() собирал весь экран заново (app.innerHTML) — Safari на кадр показывал рамку и
// заголовок пустыми, строка «Опусти 3 короны / Ходы» перерисовывалась целиком. Теперь новая
// разметка сверяется с той, что на экране (morph): меняется только то, что изменилось,
// узлы, картинки и фокус остаются на месте.
function morph(from,to){
  if(from.nodeType===1&&to.nodeType===1){
    for(const {name} of [...from.attributes])if(!to.hasAttribute(name))from.removeAttribute(name);
    for(const {name,value} of [...to.attributes])if(from.getAttribute(name)!==value)from.setAttribute(name,value);
    if(from.tagName==='INPUT'){if(from.checked!==to.checked)from.checked=to.checked;if(from.value!==to.value)from.value=to.value;}
  }
  const a=[...from.childNodes],b=[...to.childNodes];
  b.forEach((y,i)=>{
    const x=a[i];
    if(!x){from.appendChild(y);return;}
    if(x.nodeType!==y.nodeType||x.nodeName!==y.nodeName||(x.nodeType===1&&x.getAttribute('data-id')!==y.getAttribute('data-id'))){from.replaceChild(y,x);return;}
    if(x.nodeType!==1){if(x.nodeValue!==y.nodeValue)x.nodeValue=y.nodeValue;return;}
    morph(x,y);
  });
  for(let i=a.length-1;i>=b.length;i--)from.removeChild(a[i]);
}
function render(){
  const started=!!game,finished=game?.finished,board=game?.board??previewBoard;
  const crowns=game?.crowns??0;
  const next=document.createElement('template');
  next.innerHTML=`<main class="shell">
    <nav class="game-topbar" aria-label="Выход из игры и звук">
      <button class="exit-game" data-action="exit-game"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M13 4 1 16l12 12v-7h17V11H13V4Z"/></svg><span>Выйти</span></button>
      <button class="sound-open" data-action="sound" aria-label="Настройки звука" aria-haspopup="dialog" aria-expanded="${soundOpen}"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M3 12h5l8-7v22l-8-7H3z"/><path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M21 11c3 3 3 7 0 10m4-14c5 5 5 13 0 18"/></svg></button>
    </nav>
    <header class="masthead">
      <h1 aria-label="${titles[language].join(' ')}">
        <svg class="curved-title" viewBox="0 0 500 112" aria-hidden="true">
          <defs><path id="title-top" d="M 5 51 Q 250 43 495 51"/><path id="title-bottom" d="M 5 96 Q 250 88 495 96"/></defs>
          <text class="title-line-one"><textPath href="#title-top" startOffset="50%" text-anchor="middle">${titles[language][0]}</textPath></text>
          <text class="title-line-two"><textPath href="#title-bottom" startOffset="50%" text-anchor="middle">${titles[language][1]}</textPath></text>
        </svg>
      </h1>
      <img class="title-flower" src="${import.meta.env.BASE_URL}art/start-divider.webp" alt="">
    </header>
    <section class="game-panel" aria-label="Игровая партия" ${!started || finished || rating ? 'inert' : ''}>
      <div class="mission-row">
        <div class="mission-plaque"><p aria-label="${language === 'en' ? 'Bring 3 crowns to the exits' : 'Опусти 3 короны к выходу'}">Опусти <b>3</b> ${icon(CROWN)} к выходу</p></div>
        <div class="stat moves-stat"><span class="stat-label">Ходы</span><strong class="moves-count">${started?game.moves:MOVES}</strong></div>
      </div>
      <div class="journey-strip"><div class="crown-tally" aria-label="Доставлено корон: ${crowns} из 3">${icon(CROWN)}<b>${crowns}<span> / ${TARGET_CROWNS}</span></b></div>${started && !finished && !siteDemo ? '<button class="journey-rating" data-action="rating" aria-label="Открыть рейтинг" title="Рейтинг"><span class="start-action-icon start-action-rating" aria-hidden="true"></span></button>' : '<span class="status-divider" aria-hidden="true"></span>'}<div class="grecha-tally">${icon(0)}<span>Греча <b>${game?.grecha??0}</b></span></div></div>
      <div class="board-area"><div class="board-frame">
        <img class="board-art" src="${import.meta.env.BASE_URL}art/kingdom-frame.webp?v=compact-20261104" alt="" draggable="false">
        <div class="board" role="group" aria-label="Поле: меняй соседние фишки местами">${board.map((line,row)=>line.map((value,col)=>cellMarkup(value,row,col)).join('')).join('')}<div class="piece-layer" aria-hidden="true">${pieces.map(pieceMarkup).join('')}</div><div class="effect-layer" aria-hidden="true"></div></div><div class="route-layer" aria-hidden="true">${routeMarkers()}</div>
      </div></div>
    </section>
    ${!started && !rating ? startWindow() : ''}
    ${finished && !rating ? resultWindow() : ''}
    ${rating ? ratingWindow() : ''}
    ${exitOpen ? exitWindow() : ''}
    ${soundOpen ? soundWindow() : ''}
  </main>`;
  document.documentElement.lang=language;
  document.title=`${titles[language].join(' ')} — Yupland Heroes`;
  localize(next.content,language);
  morph(app,next.content);
  if(exitOpen)for(const child of app.querySelector('.shell').children)if(!child.classList.contains('exit-overlay'))child.inert=true;
  if(soundOpen)for(const child of app.querySelector('.shell').children)if(!child.classList.contains('sound-overlay'))child.inert=true;
}
const layer=()=>app.querySelector('.piece-layer');
const effectLayer=()=>app.querySelector('.effect-layer');
const nodeFor=p=>p?layer()?.querySelector(`[data-id="${p.id}"]`):null;
function updatePositions(){for(const p of pieces){const el=nodeFor(p);if(el)el.style.transform=`translate(${p.col*100}%,${p.row*100}%)`;}}
function addPiece(p){layer()?.insertAdjacentHTML('beforeend',pieceMarkup(p));}
function removePiece(p){nodeFor(p)?.remove();pieces=pieces.filter(q=>q.id!==p.id);}
const pieceAt=(row,col)=>pieces.find(p=>p.row===row&&p.col===col);
function flash(cells,wave,runs,effects=[],consumed=[]){
  soundPreview.cue(wave>1 || effects.length || runs.some(run=>run.length>=4) ? 'combo' : 'match',wave);
  const fx=effectLayer();if(!fx)return;
  fx.innerHTML=cells.map(([row,col])=>`<i class="impact" style="--x:${col};--y:${row}"></i>`).join('');
  for(const [row,col] of cells){if(consumed.includes(`${row},${col}`))continue;const type=specialType(pieceAt(row,col)?.value);if(type===SPECIAL.RAY_H||type===SPECIAL.RAY_V)fx.insertAdjacentHTML('beforeend',`<i class="match-beam ${type===SPECIAL.RAY_H?'horizontal':'vertical'}" style="--x:${type===SPECIAL.RAY_H?0:col};--y:${type===SPECIAL.RAY_H?row:0};--span:${type===SPECIAL.RAY_H?COLS:ROWS}"></i>`);if(type===SPECIAL.BURST||type===SPECIAL.RAINBOW)fx.insertAdjacentHTML('beforeend',`<i class="power-burst" style="--x:${col};--y:${row}"></i>`);}
  for(const effect of effects){
    if(effect.type==='burst')fx.insertAdjacentHTML('beforeend',`<i class="power-burst super-burst" style="--x:${effect.col-2};--y:${effect.row-2}"></i>`);
    else fx.insertAdjacentHTML('beforeend',`<i class="match-beam ${effect.type==='h'?'horizontal':'vertical'}" style="--x:${effect.col};--y:${effect.row};--span:${effect.type==='h'?COLS:ROWS}"></i>`);
  }
  for(const run of runs)if(run.length>=4){const first=run.cells[0],last=run.cells.at(-1);fx.insertAdjacentHTML('beforeend',`<i class="match-beam ${first.row===last.row?'horizontal':'vertical'}" style="--x:${first.col};--y:${first.row};--span:${run.length}"></i>`);}
  if(wave>1)fx.insertAdjacentHTML('beforeend',`<span class="combo-pop">${tr(`Каскад ×${wave}`)}</span>`);
  const particles=[...fx.children];
  setTimeout(()=>particles.forEach(particle=>particle.remove()),600);
}
async function collapseTo(paths,signal){
  const moving=paths.map(route=>{
    let p=route.from?pieceAt(route.from.row,route.from.col):null;
    if(!p){p={id:nextId++,...route.path[0],value:route.value};pieces.push(p);addPiece(p);}
    // Keep each bend around a block, merge uninterrupted vertical travel.
    const waypoints=[route.path[0]];
    for(let i=1;i<route.path.length;i++){
      const prev=route.path[i-1],here=route.path[i],next=route.path[i+1];
      if(!next||prev.col!==here.col||here.col!==next.col)waypoints.push(here);
    }
    return {p,waypoints};
  });
  await frame();
  signal?.throwIfAborted();
  const stages=Math.max(0,...moving.map(m=>m.waypoints.length-1));
  for(let i=1;i<=stages;i++){
    let duration=160;
    for(const {p,waypoints} of moving)if(waypoints[i]){
      const next=waypoints[i];
      duration=Math.max(duration,Math.min(390,140+Math.abs(p.row-next.row)*35));
    }
    for(const {p,waypoints} of moving)if(waypoints[i]){
      const el=nodeFor(p);if(el)el.style.transitionDuration=`${duration}ms`;
      p.row=waypoints[i].row;p.col=waypoints[i].col;
    }
    updatePositions();await wait(duration,signal);
  }
  for(const {p} of moving){const el=nodeFor(p);if(el)el.style.removeProperty('transition-duration');}
  if(moving.length)soundPreview.cue('land');
}

async function animateSwap(a,b){
  const p=pieceAt(a.row,a.col),q=pieceAt(b.row,b.col);if(!p||!q)return;
  [p.row,q.row]=[q.row,p.row];[p.col,q.col]=[q.col,p.col];updatePositions();await wait(190);
}
function transformPiece({row,col,value}) {
  const piece=pieceAt(row,col);
  if(!piece)return;
  piece.value=value;
  const node=nodeFor(piece);
  if(!node)return;
  node.classList.add('powered','transforming');
  node.innerHTML=pieceInner(piece);
  return node;
}

async function launchFinaleBonuses(placements,overlay,signal) {
  const counter=app.querySelector('.moves-count');
  const movesLeft=Number(counter.textContent);
  const spacing=Math.max(220,Math.min(660,6500/placements.length));
  const duration=950;

  await Promise.all(placements.map(async (placement,index)=>{
    if(index)await wait(index*spacing,signal);
    const source=counter.getBoundingClientRect();
    const target=nodeFor(pieceAt(placement.row,placement.col)).getBoundingClientRect();
    const size=Math.min(target.width,target.height);
    const x=source.left+source.width/2;
    const y=source.top+source.height/2;
    const dx=target.left+target.width/2-x;
    const dy=target.top+target.height/2-y;
    // Swing toward the board center before dropping onto the chosen cell.
    const board=layer().getBoundingClientRect();
    const inward=board.left+board.width/2-x;
    const controlX=dx*.56+Math.sign(inward)*Math.min(85,board.width*.24);
    const controlY=Math.min(0,dy*.2)-Math.min(64,Math.max(20,y-12));
    const frames=Array.from({length:17},(_,step)=>{
      const t=step/16;
      const bend=2*t*(1-t);
      const tx=bend*controlX+t*t*dx;
      const ty=bend*controlY+t*t*dy;
      const scale=.62+.38*t+.6*Math.sin(Math.PI*t);
      const tilt=Math.sign(inward)*18*Math.sin(Math.PI*t);
      return {transform:`translate(${tx}px,${ty}px) rotate(${tilt}deg) scale(${scale})`};
    });

    const flight=document.createElement('span');
    flight.className='piece powered finale-bonus-flight';
    flight.setAttribute('aria-hidden','true');
    Object.assign(flight.style,{left:`${x-size/2}px`,top:`${y-size/2}px`,width:`${size}px`,height:`${size}px`});
    flight.innerHTML=pieceInner(placement);
    overlay.append(flight);
    counter.textContent=movesLeft-index-1;
    counter.animate([{scale:1},{scale:1.22},{scale:1}],{duration:230,easing:'ease-out'});

    const motion=flight.animate(frames,{duration,easing:'cubic-bezier(.2,.55,.53,1)',fill:'forwards'});
    const abort=()=>motion.cancel();
    signal.addEventListener('abort',abort,{once:true});
    try{
      await motion.finished;
      signal.throwIfAborted();
      transformPiece(placement)?.classList.add('finale-bonus-landed');
    }catch(error){
      signal.throwIfAborted();
      throw error;
    }finally{
      signal.removeEventListener('abort',abort);
      flight.remove();
    }
  }));

  await wait(1000,signal);
  for(const node of layer().querySelectorAll('.finale-bonus-landed'))node.classList.remove('transforming','finale-bonus-landed');
}

async function animateSteps(animation,signal){
  for(const step of animation.steps){
    if(!signal&&step.transformed?.length){
      const transformed=step.transformed.map(transformPiece);
      await wait(320);
      for(const node of transformed)node?.classList.remove('transforming');
    }
    for(const created of step.created){const p=pieceAt(created.row,created.col);if(p){p.value=created.value;const el=nodeFor(p);if(el){el.classList.add('powered');el.innerHTML=pieceInner(p);}}}
    if(step.created.some(p=>step.cleared.some(([r,c])=>r===p.row&&c===p.col)))await wait(170,signal);
    flash(step.cleared,step.wave,step.runs,step.effects,step.consumed);
    for(const [row,col] of step.cleared)nodeFor(pieceAt(row,col))?.classList.add('dying');
    await wait(230,signal);
    for(const [row,col] of step.cleared){const p=pieceAt(row,col);if(p)removePiece(p);}
    await collapseTo(step.gravityPaths,signal);
    if(step.delivered){
      const crown=pieceAt(step.deliveredAt.row,step.deliveredAt.col);
      if(crown){nodeFor(crown)?.classList.add('delivered');effectLayer()?.insertAdjacentHTML('beforeend',`<span class="crown-pop">+1 ${crownWord(1)}</span>`);await wait(400);removePiece(crown);}
      await collapseTo(step.deliveryPaths);
    }
  }
}

function updateRoundCounters() {
  app.querySelector('.moves-count').textContent=game.moves;
  app.querySelector('.grecha-tally b').textContent=game.grecha;
  app.querySelector('.crown-tally b').firstChild.textContent=game.crowns;
  app.querySelector('.crown-tally').setAttribute('aria-label',
    language==='en'?`Crowns rescued: ${game.crowns} of ${TARGET_CROWNS}`:`Доставлено корон: ${game.crowns} из ${TARGET_CROWNS}`);
}

async function playFinale() {
  const outOfMoves=game.moves===0 && game.crowns<TARGET_CROWNS;
  const controller=new AbortController();
  finale=controller;
  const shell=app.querySelector('.shell');
  for(const child of shell.children)child.inert=true;
  const overlay=document.createElement('div');
  overlay.className='round-finale';
  overlay.tabIndex=-1;
  overlay.setAttribute('role','group');
  overlay.setAttribute('aria-label',tr('Финал партии. Нажми Enter, чтобы перейти к результату'));
  shell.append(overlay);
  overlay.focus({preventScroll:true});
  updateRoundCounters();
  const animation=embedded?takeFinale(game):finishBonuses(game);
  try{
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(animation.steps.length && !reduced){
      await wait(350,controller.signal);
      if(animation.transformed.length)await launchFinaleBonuses(animation.transformed,overlay,controller.signal);
      await animateSteps(animation,controller.signal);
      await wait(400,controller.signal);
    } else if(animation.steps.length){
      pieces=makePieces(game.board);
      layer().innerHTML=pieces.map(pieceMarkup).join('');
    }
    updateRoundCounters();
    if(outOfMoves){
      overlay.classList.add('round-finale-notice');
      overlay.innerHTML=`<div role="status"><span>${tr('Ходы закончились')}</span><strong>0</strong></div>`;
      await wait(1050,controller.signal);
    }
  }catch(error){
    if(error!==controller.signal.reason)throw error;
  }finally{
    finale=null;
    pieces=makePieces(game.board);
    settleRound(game);
  }
}

function resumeRound(open){
  if(!open)return;
  game=serverGame(open.state,open.currency);
  currency=game.entryCurrency;
  inventory.collect(game);
  pieces=makePieces(game.board);selected=null;pointerStart=null;rating=null;render();
}

async function loadServerRound(){
  const init=await bridge.load();
  takeServerBalances();
  serverNotice='';
  if(!game&&init.game)resumeRound(init.game);
}

async function startRound(){
  if(starting||serverLoading)return;
  starting=true;
  soundPreview.start();
  try{
    const init=await bridge.start(currency==='crypto'?'darai':'gold');
    serverNotice='';
    takeServerBalances();
    resumeRound(init.game);
  }catch(error){serverNotice=errorText(error,language==='en');takeServerBalances();render();}
  finally{starting=false;}
}

async function exitRound(){
  if(exiting)return;
  exiting=true;
  try{
    if(game&&!game.finished)await bridge.exit(game);
    takeServerBalances();
    game=null;pieces=makePieces(previewBoard);selected=null;pointerStart=null;
    rating=null;exitOpen=false;serverNotice='';
  }catch(error){serverNotice=errorText(error,language==='en');}
  finally{exiting=false;}
  render();
  app.querySelector(exitOpen?'[data-action="cancel-exit"]':'[data-action="start"]')?.focus();
}

function loadRating(){
  bridge.rating().then(rows=>{
    ratingRows=rows;
    if(rating)render();
  }).catch(()=>{});
}

async function performSwap(a,b){
  if(!game||game.finished||busy)return;
  busy=true;selected=null;
  const request=embedded&&canSwap(game.board,a,b)?bridge.move(a,b).catch(()=>null):null;
  const localValid=!embedded&&playSwap(game,a,b);
  await animateSwap(a,b);
  const valid=embedded?applyMove(game,await request):localValid;
  if(!valid){await animateSwap(a,b);busy=false;render();return;}
  inventory?.collect(game);
  const selectedCell=app.querySelector('.cell.selected');
  selectedCell?.classList.remove('selected');
  selectedCell?.setAttribute('aria-pressed','false');
  await animateSteps(game.lastAnimation);
  if(game.lastAnimation.shuffled){layer()?.classList.add('shuffling');await wait(230);pieces=makePieces(game.board);layer().innerHTML=pieces.map(pieceMarkup).join('');layer()?.classList.remove('shuffling');await wait(230);}
  if(game.finished)await playFinale();
  busy=false;render();
  if(game.finished)app.querySelector('.green-result')?.focus();
}
// Yupland Heroes (08.11, «подлагивает»): выбор клетки только помечает клетки, весь экран
// не пересобирается (раньше — полная перерисовка на каждое касание).
function markSelected(){
  for(const cell of app.querySelectorAll('.cell.gem')){
    const on=!!selected&&Number(cell.dataset.row)===selected.row&&Number(cell.dataset.col)===selected.col;
    cell.classList.toggle('selected',on);cell.setAttribute('aria-pressed',String(on));
  }
}
function choose(row,col){
  if(!game||game.finished||busy)return;
  const target={row,col};
  if(!selected){selected=target;markSelected();return;}
  if(selected.row===row&&selected.col===col){selected=null;markSelected();return;}
  const a=selected;
  if(Math.abs(a.row-row)+Math.abs(a.col-col)!==1){selected=target;markSelected();return;}
  void performSwap(a,target);
}
app.addEventListener('change', event => {
  const toggle=event.target.dataset.soundToggle;
  if(toggle){soundPreview.setSettings({[toggle]:event.target.checked});return;}
  if (event.target.name !== 'entry-currency') return;
  currency = event.target.value;
  balanceNotice=false;
  app.querySelector('.balance-notice')?.remove();
  app.querySelector('.start-play').textContent = embedded&&bridge.demo&&bridge.pass ? demoWord('play') : tr(paymentMethods[currency].action);
});

app.addEventListener('input',event=>{
  const level=event.target.dataset.soundLevel;
  if(!level)return;
  const value=Number(event.target.value);
  soundPreview.setSettings({[level]:value});
  event.target.style.setProperty('--level',`${value}%`);
  app.querySelector(`[data-sound-output="${level}"]`).textContent=`${value}%`;
});

app.addEventListener('click',event=>{
  if(finale){finale.abort();return;}
  const action=event.target.closest('[data-action]')?.dataset.action;
  if (busy||starting||exiting) return;
  if(action==='sound'){soundOpen=true;render();app.querySelector('.sound-dialog').focus();return;}
  if(action==='close-sound'||event.target.classList.contains('sound-overlay')){soundOpen=false;render();app.querySelector('[data-action="sound"]').focus();return;}
  if(soundOpen)return;
  if(action==='exit-game'){
    if(embedded&&(!game||game.finished)){bridge.close();return;}
    serverNotice='';
    exitOpen=true;pointerStart=null;render();app.querySelector('[data-action="cancel-exit"]').focus();return;
  }
  if(action==='cancel-exit'){
    exitOpen=false;render();app.querySelector('[data-action="exit-game"]').focus();return;
  }
  if(action==='confirm-exit'){
    if(embedded){void exitRound();return;}
    if(demoSession&&window.parent!==window){notifyDemoHost('yupland:demo-close');return;}
    settleRound(game);
    soundPreview.stop();
    game=null;pieces=makePieces(previewBoard);selected=null;pointerStart=null;
    rating=null;exitOpen=false;render();app.querySelector('[data-action="start"]').focus();return;
  }
  if (action === 'wallet') {
    if (walletPreview) walletConnected = true;
    else walletNotice = true;
    render();
    return;
  }
  if (action === 'rating' || action === 'rating-grecha' || action === 'rating-crowns') {
    rating = action === 'rating-crowns' ? 'crowns' : 'grecha';
    if(embedded&&action==='rating')loadRating();
    render();
    app.querySelector(`.rating-metrics [data-action="rating-${rating}"]`).focus();
    return;
  }
  if (action === 'close-rating') { rating = null; render(); app.querySelector('[data-action="rating"]')?.focus(); return; }
  if(action==='stats'&&embedded){bridge.stats();return;}
  if(action==='restart'){if(!embedded)soundPreview.stop();game=null;pieces=makePieces(previewBoard);selected=null;render();return;}
  if(action==='start'){
    if(embedded){void startRound();return;}
    const key=currency==='crypto'&&walletConnected?'crypto':'gold';
    const next=newGame();
    if(!siteDemo){
      const entry=payout(next).entry*paymentMethods[key].multiplier;
      if(balances[key]<entry){balanceNotice=true;render();return;}
      balanceNotice=false;
      next.entryCurrency=key;
      updateBalance(key,-entry);
    }
    game=next;
    if(game.finished){inventory?.collect(game);settleRound(game);}
    soundPreview.start();
    pieces=makePieces(game.board);selected=null;busy=false;render();return;
  }
  if(ignoreClick){ignoreClick=false;return;}
  const cell=event.target.closest('.gem');if(cell)choose(Number(cell.dataset.row),Number(cell.dataset.col));
});
app.addEventListener('pointerdown',event=>{const cell=event.target.closest('.gem');pointerStart=cell?{row:Number(cell.dataset.row),col:Number(cell.dataset.col),x:event.clientX,y:event.clientY}:null;});
app.addEventListener('pointerup',event=>{
  if(!pointerStart||!game||game.finished||busy||rating)return;
  const origin=pointerStart;pointerStart=null;const dx=event.clientX-origin.x,dy=event.clientY-origin.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))<18)return;
  const to=Math.abs(dx)>Math.abs(dy)?{row:origin.row,col:origin.col+Math.sign(dx)}:{row:origin.row+Math.sign(dy),col:origin.col};
  ignoreClick=true;setTimeout(()=>{ignoreClick=false;},0);void performSwap(origin,to);
});
render();
notifyDemoHost('yupland:demo-ready');

app.addEventListener('keydown', event => {
  if(finale){
    event.preventDefault();
    if(['Enter',' ','Escape'].includes(event.key))finale.abort();
    return;
  }
  if(soundOpen){
    if(event.key==='Escape'){soundOpen=false;render();app.querySelector('[data-action="sound"]').focus();}
    else if(event.key==='Tab'){
      const controls=[...app.querySelectorAll('.sound-dialog input,.sound-dialog button')];
      const i=controls.indexOf(document.activeElement);
      if(event.shiftKey&&i<=0){event.preventDefault();controls.at(-1).focus();}
      else if(!event.shiftKey&&(i===controls.length-1||i===-1)){event.preventDefault();controls[0].focus();}
    }
    return;
  }
  if(exitOpen){
    if(event.key==='Escape'){exitOpen=false;render();app.querySelector('[data-action="exit-game"]').focus();}
    else if(event.key==='Tab'){
      const buttons=[...app.querySelectorAll('.green-exit button')];
      const i=buttons.indexOf(document.activeElement);
      if(event.shiftKey&&i<=0){event.preventDefault();buttons.at(-1).focus();}
      else if(!event.shiftKey&&(i===buttons.length-1||i===-1)){event.preventDefault();buttons[0].focus();}
    }
    return;
  }
  if(demoSession&&!rating&&event.key==='Escape'){
    event.preventDefault();notifyDemoHost('yupland:demo-close');return;
  }
  if (!rating && game?.finished && event.key === 'Tab') {
    const controls = [...app.querySelectorAll('.green-result button')];
    const index = controls.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1)?.focus(); }
    else if (!event.shiftKey && (index === controls.length - 1 || index === -1)) { event.preventDefault(); controls[0]?.focus(); }
    return;
  }
  if (!rating) return;
  if (event.key === 'Escape') {
    rating = null; render(); app.querySelector('[data-action="rating"]')?.focus(); return;
  }
  if (event.key === 'Tab') {
    const controls = [...app.querySelectorAll('.green-rating button')];
    const index = controls.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1).focus(); }
    else if (!event.shiftKey && (index === controls.length - 1 || index === -1)) { event.preventDefault(); controls[0].focus(); }
  }
});


if(embedded){
  loadServerRound().catch(error=>{serverNotice=errorText(error,language==='en');})
    .finally(()=>{serverLoading=false;render();});
  soundPreview.start();
  for(const kind of ['pointerdown','keydown'])addEventListener(kind,()=>soundPreview.start(),{once:true,capture:true});
  bridge.onRefresh=()=>{
    if(starting||exiting||serverLoading||(game&&!game.finished))return;
    loadServerRound().then(()=>{if(!game)render();}).catch(()=>{});
  };
}
