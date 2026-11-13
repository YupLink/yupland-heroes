// Страница газеты для людей (владелец, 08.11.2026: «не JSON — адекватная
// страничка, где всё по газете собирается»): /api/news?format=html&key=….
// Газета дня (и прошлые дни), сводка недели, промокод дня, клад, итоги,
// турниры, лидеры, что нового, готовый текст поста с кнопкой «Скопировать».
// Картинки — те же ручки /api/news?image=…, по тому же ключу.
import type { NewsDigest, NewsLang } from "@/lib/news/types";
import { NEWS_DAY_OPTIONS } from "@/lib/news/types";
import { periodLabel } from "@/lib/news/newsText";
import { VESTNIK_EPOCH } from "@/lib/news/vestnikWindow";
import { esc, leadersHtml, totalsHtml, toursHtml, updatesHtml } from "./news-page-sections";

export type NewsPageInput = {
  digest: NewsDigest;
  text: string;
  promo: { date: string; code: string } | null;
  treasure: { image: string } | null;
  key: string;
  lang: NewsLang;
  /** Выбранный день газеты (YYYY-MM-DD); null — сегодня. */
  paper: string | null;
  /** Метка ответа для защитного заголовка (lib/csp/cspPolicy.ts). */
  nonce?: string;
};

const tr = (lang: NewsLang, ru: string, en: string) => (lang === "en" ? en : ru);

// Без on…-атрибутов: их защитный заголовок не пускает. Вторая страница сводки
// бывает не всегда — битую картинку убираем; кнопка копирует текст поста.
const PAGE_JS = `document.querySelectorAll("img[data-optional]").forEach(function(i){
if(i.complete&&!i.naturalWidth)i.remove();else i.addEventListener("error",function(){i.remove()})});
var b=document.getElementById("copy-post");b.addEventListener("click",function(){
navigator.clipboard.writeText(document.getElementById("post").innerText).then(function(){b.textContent=b.dataset.done})});`;

/** Последние дни газеты: от сегодня назад, не раньше первого выпуска. */
function paperDays(now = Date.now(), n = 7): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    if (d < VESTNIK_EPOCH) break;
    out.push(d);
  }
  return out;
}

const CSS = `
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;background:#0b0d12;color:#ece6d6;font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:980px;margin:0 auto;padding:16px}
header{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:12px}
h1{font-size:22px;margin:0;color:#f6c527}h2{font-size:18px;margin:24px 0 10px;color:#f6c527}
h3{font-size:15px;margin:0 0 6px}h3 small{color:#9a937f;font-weight:400}.sub{margin:14px 0 8px;color:#bfb8a3}
nav{display:flex;flex-wrap:wrap;gap:6px}
nav a,.chips a{padding:6px 12px;border-radius:999px;border:1px solid #3a3528;color:#ece6d6;text-decoration:none;font-size:13px}
nav a.on,.chips a.on{background:#f6c52722;border-color:#f6c527;color:#f6c527}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.papers{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
.papers img{width:100%;height:auto;border-radius:10px;border:1px solid #2a2f3a;background:#151821}
.card{background:#141821;border:1px solid #232836;border-radius:12px;padding:12px;margin:0 0 10px}
.mut{color:#9a937f}.promo{font:700 26px/1 ui-monospace,Menlo,monospace;letter-spacing:2px;color:#f6c527}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.tile{background:#141821;border:1px solid #232836;border-radius:10px;padding:10px}
.tile b{display:block;font-size:18px}.tile span{color:#9a937f;font-size:12px}
.boards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.board{background:#141821;border:1px solid #232836;border-radius:12px;padding:10px}
ol{list-style:none;margin:0;padding:0}ol li{display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #1e2330}
.n{width:22px;color:#9a937f}.who{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.v{font-variant-numeric:tabular-nums}
ul{margin:0;padding-left:18px}pre{white-space:pre-wrap;background:#141821;border:1px solid #232836;border-radius:12px;padding:12px;margin:0}
button{padding:8px 14px;border-radius:10px;border:0;background:linear-gradient(120deg,#ffda26,#ec9d00);color:#1b160d;font-weight:700}
`;

export function newsPageHtml(o: NewsPageInput): string {
  const { digest: d, lang, key } = o;
  const q = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams({
      key,
      lang,
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])),
    });
    return `/api/news?${p.toString()}`;
  };
  const page = (extra: Record<string, string | number>) =>
    q({ format: "html", days: d.days, ...extra });
  const tabs = NEWS_DAY_OPTIONS.map(
    (n) =>
      `<a class="${n === d.days ? "on" : ""}" href="${esc(page({ days: n }))}">${
        n === 1 ? tr(lang, "Сегодня", "Today") : tr(lang, `${n} дней`, `${n} days`)
      }</a>`,
  ).join("");
  const langs = `<a href="${esc(q({ format: "html", days: d.days, lang: lang === "en" ? "ru" : "en" }))}">${lang === "en" ? "RU" : "EN"}</a>`;
  const days = paperDays();
  const paper = o.paper && days.includes(o.paper) ? o.paper : days[0];
  const chips = days
    .map(
      (x) =>
        `<a class="${x === paper ? "on" : ""}" href="${esc(page({ paper: x }))}">${esc(x.slice(5))}</a>`,
    )
    .join("");
  const treasure = o.treasure
    ? `<section><h2>${tr(lang, "Клад дня", "Treasure of the day")}</h2><div class="papers"><img loading="lazy" alt="" src="${esc(`${o.treasure.image}&key=${encodeURIComponent(key)}`)}"></div></section>`
    : "";
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${tr(lang, "Газета YupLand", "YupLand news")}</title>
<style>${CSS}</style></head><body><main>
<header><h1>${tr(lang, "Газета YupLand", "YupLand news")} · ${esc(periodLabel(d.from, d.to, lang))}</h1>
<nav>${tabs}${langs}<a href="${esc(q({ format: "json", days: d.days }))}">JSON</a></nav></header>
<section><h2>${tr(lang, "«Вестник героев»", "Heroes' Herald")}</h2><div class="chips">${chips}</div>
<div class="papers"><img alt="" src="${esc(q({ image: "day", date: paper }))}"></div></section>
<section><h2>${tr(lang, "Сводка недели", "Weekly summary")}</h2><div class="papers">
<img loading="lazy" alt="" src="${esc(q({ image: "week" }))}"><img loading="lazy" alt="" src="${esc(q({ image: "week", page: 2 }))}" data-optional></div></section>
${o.promo ? `<section><h2>${tr(lang, "Промокод дня", "Promo code of the day")}</h2><div class="card"><div class="promo">${esc(o.promo.code)}</div><p class="mut">${esc(o.promo.date)}</p></div></section>` : ""}
${treasure}${totalsHtml(d, lang)}${toursHtml(d, lang)}${leadersHtml(d, lang)}${updatesHtml(d, lang)}
<section><h2>${tr(lang, "Готовый текст поста", "Ready-made post")}</h2>
<p><button type="button" id="copy-post" data-done="${tr(lang, "Скопировано", "Copied")}">${tr(lang, "Скопировать", "Copy")}</button></p>
<pre id="post">${esc(o.text)}</pre></section>
</main><script nonce="${esc(o.nonce ?? "")}">${PAGE_JS}</script></body></html>`;
}
