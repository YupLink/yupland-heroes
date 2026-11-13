// Small standalone UI catalog. Player names are deliberately not translated.
const en = {
  'Выйти':'Exit', 'Выйти из игры':'Exit game', 'Выход из игры':'Exit game',
  'Выход из игры и звук':'Exit game and sound', 'Звук':'Sound', 'Настройки звука':'Sound settings',
  'Закрыть настройки звука':'Close sound settings', 'Музыка':'Music',
  'Эффекты':'Effects', 'Громкость музыки':'Music volume', 'Громкость эффектов':'Effects volume',
  'Верни короны':'Rescue the crowns', 'Золото':'Gold',
  'Кошелёк подключён':'Wallet connected', 'Подключить кошелёк':'Connect wallet',
  'Подключение кошелька сейчас недоступно':'Wallet connection is currently unavailable',
  'Валюта входа':'Entry currency', 'Рюкзак':'Backpack', 'Рейтинг':'Leaderboard',
  'Выйти из игры?':'Leave this game?',
  'Прогресс текущей партии будет потерян. Продолжить её позже не получится.':'Your current game progress will be lost. You won’t be able to resume it.',
  'Полученные короны останутся в рюкзаке.':'Collected crowns will stay in your backpack.',
  'Продолжить игру':'Keep playing', 'Все короны':'All crowns', 'спасены!':'rescued!',
  'Ходы закончились':'Out of moves',
  'Результат демопартии не сохраняется':'Demo results are not saved',
  'Играть':'Play', 'Партия завершена':'Round complete', 'Опущено корон':'Crowns rescued',
  'Поздравляем!':'Congratulations!', 'Ваш выигрыш':'Your winnings',
  'Потрачено за игру':'Spent this round', 'Всего опущено корон':'Total crowns rescued',
  'Греча за партию':'Buckwheat this round',
  'Финал партии. Нажми Enter, чтобы перейти к результату':'Round finale. Press Enter to see the result.',
  'Ходы':'Moves', 'закончились':'used up', 'Короны не получены':'No crowns collected',
  'Корона сохранена в рюкзаке':'Your crown is in your backpack',
  'Короны сохранены в рюкзаке':'Your crowns are in your backpack',
  'Греча':'Buckwheat', 'Играть ещё':'Play again', 'Попробовать ещё':'Try again',
  'Вернуться':'Back', 'Показатель рейтинга':'Leaderboard category', 'Короны':'Crowns',
  'По всей собранной грече':'Total buckwheat collected',
  'По собранной грече':'By total buckwheat collected', 'Статистика':'Stats',
  'Лучшая партия по грече':'Best single-round buckwheat score',
  'Рекорд за партию':'Best round score', 'Твой рекорд за партию':'Your best round score', 'По доставленным коронам':'By crowns rescued',
  'Рейтинг по грече':'Buckwheat leaderboard', 'Рейтинг по коронам':'Crown leaderboard',
  'Место':'Rank', 'Игрок':'Player', 'Результат':'Score', 'Ты':'You',
  'Рейтинг сейчас недоступен':'Leaderboard is currently unavailable',
  'Деревянный сундук':'Wooden crate', 'Неподвижный камень':'Fixed stone',
  'Игровая партия':'Current game', 'Открыть рейтинг':'Open leaderboard',
  'Поле: меняй соседние фишки местами':'Board: swap adjacent pieces',
  'Опусти':'Bring', '3 короны':'3 crowns', 'к выходу':'to the exits',
};
export const titles = {
  ru: ['Корона гречневого', 'королевства'],
  en: ['Crown of the', 'Buckwheat Kingdom'],
};
export function crownLabel(n,lang='ru') {
  if(lang==='en')return n===1?'crown':'crowns';
  return n%10===1&&n%100!==11?'корона':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'короны':'корон';
}
export function translate(value,lang='ru') {
  if(lang!=='en')return value;
  const text=value.trim();let result=en[text];
  if(result===undefined){
    result=text.replace(/^Опусти 3 короны за (\d+) ходов$/, 'Bring 3 crowns down in $1 moves')
      .replace(/^Вход (.+)$/, 'Entry $1').replace(/^Баланс (.+)$/, 'Balance $1')
      .replace(/^Играть за (.+) золота$/, 'Play for $1 gold').replace(/^Играть за (.+)$/, 'Play for $1')
      .replace(/^Получен[ао] (\d+) (корона|короны|корон|crown|crowns)$/, (_,n)=>`${n} ${crownLabel(Number(n),'en')} collected`)
      .replace(/^(\d+) (корона|короны|корон)$/, (_,n)=>`${n} ${crownLabel(Number(n),'en')}`)
      .replace(/^Доставлено корон: (\d+) из 3$/, 'Crowns rescued: $1 of 3')
      .replace(/^Каскад ×(\d+)$/, 'Cascade ×$1');
    if(text.includes(', ряд ')){
      const words={'гречневое зерно':'buckwheat grain','колос':'wheat','лист':'leaf','ягоды':'berries','цветок':'flower','корона':'crown','Радуга':'Rainbow','Вспышка':'Bomb','Луч':'Arrow','пусто':'empty','ряд':'row','столбец':'column','вход короны':'crown entry','выход короны':'crown exit'};
      result=text.replace(/гречневое зерно|вход короны|выход короны|столбец|Вспышка|Радуга|ягоды|цветок|корона|пусто|колос|лист|ряд|Луч/g,w=>words[w]);
    }
  }
  result=result.replace(/\d{1,3}(?:[ \u00a0]\d{3})+/g,n=>Number(n.replace(/\s/g,'')).toLocaleString('en-US'));
  return value.replace(text,result);
}
export function localize(root,lang) {
  if(lang!=='en')return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
    const node=walker.currentNode;
    if(node.parentElement?.matches('th[scope="row"]')&&node.textContent.trim()!=='Ты')continue;
    node.textContent=translate(node.textContent,lang);
  }
  for(const el of root.querySelectorAll('[aria-label],[title]'))for(const attr of ['aria-label','title']){
    if(el.hasAttribute(attr))el.setAttribute(attr,translate(el.getAttribute(attr),lang));
  }
}
