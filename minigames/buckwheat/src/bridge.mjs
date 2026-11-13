// Yupland Heroes: игра встроена в окно (iframe), партию ведёт сервер игры.
// Вход, каждый ход, финал и выход — запросы родителю (BuckwheatOverlay →
// server/api/buckwheat); здесь только показ того, что вернул сервер. Раскладку
// задаёт зерно, которого браузер не знает, деньги и копилка — настоящие.
// Картинки игры — разжать заранее и держать (08.11, «долго грузятся и моргают»).
let warm;
export function warmImages() {
  warm ??= ['art/kingdom-frame.webp?v=compact-20261104', 'art/start-divider.webp', 'art/start-panel.webp',
  'art/evening-garden.webp', 'art/wooden-chest.webp', 'art/chained-stone-full.webp', 'art/locked-stone.webp',
  'art/start-actions.webp', 'icons.webp'].map(src => {
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}${src}`;
    img.decode?.().catch(() => {});
    return img;
  });
}

const pending = new Map();
let seq = 0;
// Номер вызова — с меткой этого окна: ответ прошлого окна игры сюда не попадёт.
const boot = Math.random().toString(36).slice(2, 10);

/** Ответ родителя — строкой JSON (так его не испортит ни одна передача). */
function settle(id, text) {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  clearTimeout(p.timer);
  let r;
  try { r = JSON.parse(text); } catch { r = { ok: false, error: 'bw.error' }; }
  if (r.ok) p.resolve(r.data);
  else p.reject(new Error(r.error || 'bw.error'));
}

addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent) return;
  const m = event.data;
  // Счёт изменился снаружи (пополнили или вывели DARAI в окне кошелька) — перечитать.
  if (m && m.bw === 'refresh') { bridge.onRefresh?.(); return; }
  if (!m || m.bw !== 'reply' || !pending.has(m.id)) return;
  settle(m.id, typeof m.text === 'string' ? m.text : JSON.stringify({ ok: m.ok, data: m.data, error: m.error }));
});

// Запасной путь (08.11, Safari владельца: сообщения-ответы не доходили): родитель
// кладёт ответ и в свой ящик, окно того же адреса забирает его само.
function pollBox(id) {
  const t = setInterval(() => {
    if (!pending.has(id)) { clearInterval(t); return; }
    let box;
    try { box = parent.__bwReplies; } catch { clearInterval(t); return; }
    const text = box && typeof box.get === 'function' ? box.get(id) : undefined;
    if (typeof text === 'string') { box.delete(id); clearInterval(t); settle(id, text); }
  }, 300);
}

function call(method, args, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const id = `${boot}-${++seq}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('bw.timeout'));
    }, timeout);
    pending.set(id, { resolve, reject, timer });
    parent.postMessage({ bw: 'call', id, method, args }, location.origin);
    pollBox(id);
  });
}

/** Журнал сбоев связи — родителю (он пишет его на сервер). */
function diag(text) {
  try { parent.postMessage({ bw: 'diag', text: String(text).slice(0, 200) }, location.origin); } catch {}
}

// Чтение счёта повторяем, пока родитель не ответит: страница могла ещё не слушать,
// когда игра спросила в первый раз (повтор безопасен — это только чтение).
async function callUntilAnswered(method) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call(method, undefined, 2000);
    } catch (error) {
      if (error.message !== 'bw.timeout' || attempt === 11) throw error;
      if (attempt === 3) diag(`${method}: нет ответа 3 раза`);
    }
  }
}

// Копилка аккаунта (греча, короны) — с сервера; корона текущей партии
// добавляется к ней сразу, как опущена, а в копилку попадает при расчёте.
const totals = { crowns: 0, grecha: 0, games: 0 };
let roundCrowns = 0;
export const inventory = {
  count: () => totals.crowns + roundCrowns,
  // Партия уже рассчитана — её короны лежат в копилке, второй раз не считаем.
  collect(game) { roundCrowns = game?.serverSettlement ? 0 : Math.max(0, Math.trunc(game?.crowns) || 0); return 0; },
};
function takeTotals(next) {
  if (!next) return;
  Object.assign(totals, next);
  roundCrowns = 0;
}

/** Партия с сервера в виде, который понимает main.js (генератора нет — он на сервере). */
export function serverGame(state, currency) {
  return { ...state, random: null, lastAnimation: null, entryCurrency: currency === 'darai' ? 'crypto' : 'gold' };
}

function takeBalances(res) {
  if (Number.isFinite(res?.gold)) bridge.gold = res.gold;
  if (Number.isFinite(res?.darai)) bridge.darai = res.darai;
}

export const bridge = {
  gold: 0,
  /** DARAI на счёте; daraiOpen — ставка DARAI доступна (вход 100 000, корона 50 000). */
  darai: 0,
  daraiOpen: false,
  /** Зовётся, когда родитель просит перечитать счёт. */
  onRefresh: null,
  admin: false,
  /** Партия на фантики (08.11, тест для всех): золото и копилка не в счёт. */
  demo: false,
  /** Пропуск к демке куплен (первый вход на фантики — за 100 золота, раз). */
  pass: false,
  async load() {
    const init = await callUntilAnswered('load');
    takeBalances(init);
    bridge.daraiOpen = init.daraiOpen === true;
    bridge.admin = init.admin === true;
    bridge.demo = init.demo === true;
    bridge.pass = init.pass === true;
    takeTotals(init.totals);
    return init;
  },
  async start(currency) {
    const init = await call('start', { currency: currency === 'darai' ? 'darai' : 'gold' });
    takeBalances(init);
    bridge.demo = init.demo === true;
    bridge.pass = init.pass === true;
    takeTotals(init.totals);
    return init;
  },
  /** Ход на сервере; применяет его applyMove — после анимации перестановки. */
  move: (a, b) => call('move', { a, b }),
  /** «Выйти» посреди партии: сервер платит за опущенные короны. */
  async exit(game) {
    const res = await call('exit');
    if (res) {
      game.serverSettlement = res.settlement;
      takeBalances(res);
      takeTotals(res.totals);
    }
  },
  async rating() {
    const r = await call('rating');
    const clean = rows => (rows || []).map(row => ({ ...row, name: escapeHtml(row.name) }));
    return { grecha: clean(r?.grecha), crowns: clean(r?.crowns) };
  },
  close() { parent.postMessage({ bw: 'close' }, location.origin); },
  /** Статистика ставок — окно рисует родитель (только админам). */
  stats() { parent.postMessage({ bw: 'stats' }, location.origin); },
};

/** Ответ сервера на ход → партия. Неверный ход или нет связи — false, ничего не менялось. */
export function applyMove(game, res) {
  if (!res?.valid) return false;
  Object.assign(game, res.state, { lastAnimation: res.animation });
  game.serverFinale = res.finale;
  if (res.settlement) {
    game.serverSettlement = res.settlement;
    takeBalances(res);
    takeTotals(res.totals);
  }
  return true;
}

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** Финал партии уже посчитан сервером вместе с последним ходом: бонусы и итог. */
export function takeFinale(game) {
  const finale = game.serverFinale;
  game.serverFinale = null;
  if (finale?.state) Object.assign(game, finale.state);
  return finale?.animation ?? { steps: [], transformed: [], effects: [], consumed: [] };
}

export function errorText(error, en) {
  const code = error?.message || '';
  if (code === 'bw.not_enough') return en ? 'Not enough gold' : 'Недостаточно золота для входа';
  if (code === 'bw.not_enough_darai') return en ? 'Not enough DARAI' : 'Недостаточно DARAI для входа';
  if (code === 'bw.closed') return en ? 'The game is not open to you yet' : 'Игра пока закрыта';
  return en ? 'No connection to the game, try again' : 'Нет связи с игрой, попробуй ещё раз';
}
