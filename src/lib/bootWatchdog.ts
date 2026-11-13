// Сторож запуска (05.11.2026, Safari владельца висел на заставке): игра стартует
// одной строкой страницы `import("/assets/index-….js")`. Оборвалась эта загрузка —
// код не пришёл, заставка висит вечно, а тихие перезагрузки (staleReload) живут
// в том же не пришедшем коде. Сторож — инлайн-скрипт до кода игры:
//  · импорт модуля упал (Safari «Importing a module script failed», Chrome
//    «Failed to fetch dynamically imported module», «Load failed») — через 1,5 с
//    тихая перезагрузка с новым `_v`;
//  · игра не поднялась за 90 с И 30 с не пришло ни одного файла (загрузка встала,
//    а не медленная) — тоже перезагрузка;
//  · не больше двух попыток за вкладку; поднялась игра — счёт сброшен (markBooted).
// ES5: старые вебвью не должны спотыкаться о сам сторож.

const KEY = "gd-boot-retry";

export const BOOT_WATCHDOG = `(function(w){try{
var K="${KEY}",ss=w.sessionStorage,pf=w.performance;
function booted(){return !!w.__gdBooted;}
function tries(){try{return +(ss.getItem(K)||0);}catch(e){return 9;}}
function retry(){
if(booted()||tries()>=2)return;
try{ss.setItem(K,String(tries()+1));}catch(e){return;}
var u=String(w.location.href).replace(/([?&])_v=\\d+&?/,"$1").replace(/[?&]$/,"");
w.location.replace(u+(u.indexOf("?")<0?"?":"&")+"_v="+Date.now());
}
w.addEventListener("unhandledrejection",function(e){
var r=e&&e.reason,m=String(r&&r.message||r||"").toLowerCase();
if(!booted()&&(m.indexOf("module")>=0||m.indexOf("failed to fetch")>=0||m.indexOf("load failed")>=0))w.setTimeout(retry,1500);
});
function stalled(){
if(!pf||!pf.getEntriesByType)return true;
var r=pf.getEntriesByType("resource"),last=0;
for(var i=0;i<r.length;i++)if(r[i].responseEnd>last)last=r[i].responseEnd;
return pf.now()-last>30000;
}
function tick(){if(booted())return;if(stalled())return retry();w.setTimeout(tick,10000);}
w.setTimeout(tick,90000);
}catch(e){}})(window);`;

/** Игра поднялась: сторож больше не нужен, попытки за вкладку — заново. */
export function markBooted(): void {
  (window as unknown as { __gdBooted?: boolean }).__gdBooted = true;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* приватный режим — счёта и не было */
  }
  // Метка обхода кэша (?_v=…, перезагрузка на новую версию) своё дело сделала — убираем из
  // адреса: владелец 08.11 «почему у меня такая ссылка, а не как ты давал?».
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("_v")) {
      url.searchParams.delete("_v");
      window.history.replaceState(window.history.state, "", url.toString());
    }
  } catch {
    /* адрес не трогаем */
  }
}
