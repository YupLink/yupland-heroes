// Страница «Вестник героев» (владелец, 29.10.2026: «одна ссылка и одна страница,
// а там уже кнопки управления; разные ссылки запрещаю»).
//
// /vestnik?key=… — всё здесь: «Сегодня / Неделя», газета картинкой (скачать),
// «Сгенерировать заново» (свежие цифры и другой вариант картинки), текст поста
// (скопировать), «Данные API» (цифры на странице + «Скопировать данные» и
// «Скопировать ссылку API»). Кнопки «Опубликовать в канал» нет (Ангелина через владельца,
// 09.11.2026: «убери кнопку публикации — может, кто-то случайно нажал»): сводка уходит в
// канал только по расписанию. Всё берёт у /api/news тем же ключом.
// Без React: обычный HTML, открывается в любом браузере и в Telegram.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CSS = `
*{box-sizing:border-box;margin:0}
body{background:#efe9dc;color:#1c1b19;font:17px/1.4 Georgia,'PT Serif',serif;padding:16px;
  max-width:720px;margin:0 auto}
h1{font-size:34px;letter-spacing:-.5px;text-align:center}
.sub{text-align:center;color:#2c5e62;letter-spacing:4px;font:600 13px Arial,sans-serif;margin:4px 0 14px}
.seg{display:flex;border:1px solid #1c1b19;margin-bottom:12px}
.seg button{flex:1;padding:12px;font:600 16px Arial,sans-serif;background:none;border:0;color:#1c1b19}
.seg button.on{background:#2c5e62;color:#fff}
.row{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.btn{flex:1 1 140px;padding:12px;font:600 15px Arial,sans-serif;border:1px solid #1c1b19;
  background:#fff8;color:#1c1b19;text-align:center;text-decoration:none;cursor:pointer}
.btn.main{background:#2c5e62;color:#fff;border-color:#2c5e62}
.btn:disabled{opacity:.5}
img{width:100%;display:block;border:1px solid #1c1b19;margin-top:10px;background:#f1ece1;min-height:200px}
pre{white-space:pre-wrap;font:15px/1.45 Georgia,serif;background:#fff6;border:1px solid #1c1b19;
  padding:12px;margin-top:10px}
#data{display:none;font:12px/1.4 Menlo,monospace;max-height:420px;overflow:auto}
#msg{min-height:22px;font:600 14px Arial,sans-serif;color:#2c5e62;margin-top:6px}
`;

const JS = `
const KEY = new URLSearchParams(location.search).get("key") || "";
const api = (q) => "/api/news?key=" + encodeURIComponent(KEY) + "&" + q;
let mode = "day";
let v = 0;
const $ = (id) => document.getElementById(id);
const say = (t) => { $("msg").textContent = t; };
const days = () => (mode === "day" ? 1 : 7);
function show() {
  document.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.m === mode));
  const stamp = "&v=" + v + "&t=" + Date.now();
  const pages = mode === "day" ? [api("image=day")] : [api("image=week"), api("image=week&page=2")];
  const box = $("pages");
  box.replaceChildren();
  pages.forEach((src, i) => {
    const img = document.createElement("img");
    img.alt = "";
    img.src = src + stamp;
    const row = document.createElement("div");
    row.className = "row";
    const a = document.createElement("a");
    a.className = "btn";
    a.href = src + stamp;
    a.download = "vestnik-" + mode + "-" + (i + 1) + ".png";
    a.textContent = pages.length > 1 ? "Скачать страницу " + (i + 1) : "Скачать картинку";
    row.append(a);
    box.append(img, row);
  });
  $("data").style.display = "none";
  $("datarow").style.display = "none";
  $("text").textContent = "Загружаю…";
  fetch(api("days=" + days())).then((r) => r.text()).then((t) => { $("text").textContent = t; });
}
// Копирование: буфер обмена, а где он закрыт (Telegram) — через выделение.
function copyText(t, done) {
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = t;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    say(ok ? done : "Не удалось скопировать");
  };
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => say(done), fallback);
  else fallback();
}
function copy() { copyText($("text").textContent, "Текст скопирован"); }
const dataLink = () => location.origin + api("format=json&days=" + days());
async function data() {
  const box = $("data");
  $("datarow").style.display = "";
  box.style.display = "block";
  box.textContent = "Загружаю…";
  const json = await fetch(dataLink()).then((r) => r.json()).catch(() => null);
  box.textContent = json ? JSON.stringify(json, null, 2) : "Не удалось получить данные";
  say("Данные ниже");
  $("datarow").scrollIntoView({ behavior: "smooth" });
}
document.querySelectorAll(".seg button").forEach((b) => b.onclick = () => { mode = b.dataset.m; v = 0; say(""); show(); });
$("regen").onclick = () => { v += 1; say("Новый вариант: " + (v + 1)); show(); };
$("copy").onclick = copy;
$("api").onclick = data;
$("copydata").onclick = () => copyText($("data").textContent, "Данные скопированы");
$("copylink").onclick = () => copyText(dataLink(), "Ссылка API скопирована");
show();
`;

/** Страница целиком; ключ проверяет маршрут, страница берёт его из своего адреса.
 * nonce — метка ответа для защитного заголовка (lib/csp/cspPolicy.ts). */
export function vestnikPageHtml(nonce = "", title = "Вестник героев"): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>${esc(title)}</title><style>${CSS}</style></head><body>
<h1>ВЕСТНИК ГЕРОЕВ</h1><div class="sub">YUPLAND HEROES</div>
<div class="seg"><button data-m="day">Сегодня</button><button data-m="week">Неделя</button></div>
<div class="row"><button class="btn main" id="regen">Сгенерировать заново</button></div>
<div class="row"><button class="btn" id="copy">Скопировать текст</button>
<button class="btn" id="api">Данные API</button></div>
<div id="msg"></div>
<div id="pages"></div>
<pre id="text"></pre>
<div class="row" id="datarow" style="display:none"><button class="btn main" id="copydata">Скопировать данные</button>
<button class="btn" id="copylink">Скопировать ссылку API</button></div>
<pre id="data"></pre>
<script nonce="${esc(nonce)}">${JS}</script></body></html>`;
}
