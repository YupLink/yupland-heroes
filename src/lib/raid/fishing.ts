// Рыбалка (владелец, 04.10.2026; ПРАВИЛА §8.35): герой с удочкой в руках стоит
// на берегу — своя клетка суша, хотя бы одна соседняя вода — и жмёт
// «Забросить». Заброс — одна попытка (владелец, 05.10.2026: «забросил — прождал
// минуту — шанс сработал или не сработал — минус прочность; сообщение — словил
// или не словил; чтобы ловить — забрасывать снова»): через N минут с шансом P %
// приходит улов (оба числа — настройка админа, по умолчанию 1 минута и 10 %),
// и каждый заброс — одно использование удочки (§8.19), с рыбой и без. Улов —
// свой товар из списка админа, с меткой «собрано» (§8.18). Энергию рыбалка не
// тратит.
//
// Кончается рыбалка, когда герой сошёл с клетки, сделал другое действие (любая
// трата энергии, кроме покупок за энергию и стейкинга фишек), убрал удочку из
// рук или взял другой инструмент, сменился выбранный герой, удочка кончилась
// или нажали «Хватит». Правило одно на сервер (server/api/beta-raid/fishing) и
// кнопку (components/beta-raid/fishing).

import { normalizeFish, pickFish, type FishItem } from "@/lib/raid/fishChances";

export type { FishItem } from "@/lib/raid/fishChances";

/** Интервал между попытками по умолчанию, минут (владелец, 05.10.2026: «1 минута»). */
export const FISH_INTERVAL_DEFAULT = 1;
/** Шанс рыбы на попытку по умолчанию, % (владелец, 05.10.2026: «шанс 10 %»). */
export const FISH_CHANCE_DEFAULT = 10;
/** Границы поля «Шанс, %» в админке. */
export const FISH_CHANCE_MIN = 1;
export const FISH_CHANCE_MAX = 100;
/** Границы поля «Интервал, мин» в админке: от минуты до недели. */
export const FISH_INTERVAL_MIN = 1;
export const FISH_INTERVAL_MAX = 7 * 24 * 60;
/** Сколько видов улова можно выбрать. */
export const FISH_ITEMS_MAX = 20;

/** Потолок одного заброса, минут (владелец, 06.10.2026: «максимальный лимит 60»). */
export const FISH_MINUTES_MAX = 60;

/**
 * Настройка «Рыбалка»: интервал между попытками, шанс рыбы на попытку и улов —
 * виды рыбы со СВОИМИ долями внутри улова (сумма ровно 100 %, см. fishChances).
 */
export type FishingConfig = { intervalMin: number; chancePct: number; items: FishItem[] };

/** Интервал из чего угодно: целые минуты в границах; мусор — по умолчанию. */
export function intervalOf(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < FISH_INTERVAL_MIN) return FISH_INTERVAL_DEFAULT;
  return Math.min(FISH_INTERVAL_MAX, n);
}

/** Шанс из чего угодно: целые проценты в границах; мусор — по умолчанию. */
export function chanceOf(v: unknown): number {
  const n = Math.round(Number(v));
  if (v == null || !Number.isFinite(n) || n < FISH_CHANCE_MIN) return FISH_CHANCE_DEFAULT;
  return Math.min(FISH_CHANCE_MAX, n);
}

/** Настройка из строки settings (JSON) или объекта; битое — по умолчанию, без улова. */
export function parseFishingConfig(raw: unknown): FishingConfig {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      v = null;
    }
  }
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    intervalMin: intervalOf(o.intervalMin),
    chancePct: chanceOf(o.chancePct),
    items: parseFishItems(o.items),
  };
}

/**
 * Виды улова с долями. Понимает и старый формат — просто список id: такие
 * получают равные доли, ровно как и работали до появления шансов.
 */
export function parseFishItems(raw: unknown): FishItem[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: FishItem[] = [];
  for (const x of list) {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
    const id = String((o ? o.id : x) ?? "").trim();
    if (!/^cst_[A-Za-z0-9_-]{1,40}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, pct: o ? Number(o.pct) || 0 : 0 });
    if (out.length >= FISH_ITEMS_MAX) break;
  }
  return normalizeFish(out);
}

/**
 * Сколько попыток созрело к моменту horizon: первая — в nextAt, следующие через
 * interval. cap — сколько взять за раз (остальные дозреют следующим заходом).
 */
export function dueCount(nextAt: number, horizon: number, intervalMs: number, cap: number): number {
  if (!Number.isFinite(nextAt) || !Number.isFinite(horizon) || !(intervalMs > 0)) return 0;
  if (horizon < nextAt) return 0;
  return Math.max(0, Math.min(cap, Math.floor((horizon - nextAt) / intervalMs) + 1));
}

/** FNV-1a: ровный и одинаковый на сервере и в тесте. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Попытка номер n рыбалки sid принесла рыбу? Решает шанс, но бросок не случайный,
 * а от номера: повтор запроса и вторая вкладка видят тот же исход. sid — зерно
 * заброса с сервера (fishing-seed), не ключ нажатия из браузера.
 *
 * Шанс бывает дробным (бонус к рыбалке: 10 × 1,15 = 11,5 %). Целая часть
 * решается прежним броском «hash % 100», дробная — вторым броском только на
 * той самой «пограничной» сотой. Поэтому при целом шансе исход ровно тот же,
 * что был до бонусов: забросы, начатые до выката, не переигрываются.
 */
export function fishHit(sid: string, n: number, chancePct: number): boolean {
  const c = Math.max(0, Math.min(100, Number(chancePct) || 0));
  const whole = Math.floor(c);
  const roll = hash(`${sid}:try:${n}`) % 100;
  if (roll !== whole) return roll < whole;
  const frac = c - whole;
  return frac > 0 && (hash(`${sid}:frac:${n}`) % 10000) / 10000 < frac;
}

/** Попытки from…from+k-1 с рыбой — их номера внутри захвата, с 1 (по возрастанию). */
export function hitOffsets(sid: string, from: number, k: number, chancePct: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= k; i++) if (fishHit(sid, from + i - 1, chancePct)) out.push(i);
  return out;
}

/**
 * Что принесла поимка номер n рыбалки sid: вид решает его доля в улове (90 %
 * щуки и 0,5 % золотой рыбки — в тысяче поимок примерно так и выйдет). Один и
 * тот же номер — один и тот же вид: повтор запроса улов не переигрывает.
 */
export function catchItemOf(items: readonly FishItem[], sid: string, n: number): string | null {
  return pickFish(items, hash(`${sid}:${n}`) % 1000);
}

/** Улов поимок from…from+hits-1: товар → штук (по одной за поимку). */
export function catchesOf(
  items: readonly FishItem[],
  sid: string,
  from: number,
  hits: number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (let n = from; n < from + hits; n++) {
    const id = catchItemOf(items, sid, n);
    if (id) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/** Шесть соседей гекса (аксиальные координаты) — те же, что у шага. */
const NEIGHBORS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

export function neighborsOf(q: number, r: number): Array<{ q: number; r: number }> {
  return NEIGHBORS.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));
}

/** Обратный отсчёт до попытки: «м:сс», от часа — «ч:мм:сс». */
export function leftClock(ms: number): string {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Почему рыбалка кончилась; done — заброс отыгран (с рыбой или без). */
export type FishStop = "stop" | "moved" | "action" | "hero" | "rod" | "tool" | "done";

/** Попыток в одном забросе по умолчанию: одна (старые строки без плана). */
export const CAST_TRIES = 1;

/**
 * Сколько попыток в забросе на `minutes` минут: заброс идёт выбранное время, а
 * попытка созревает раз в интервал. Минута при интервале в минуту — одна
 * попытка, шестьдесят — шестьдесят.
 */
export function triesForMinutes(minutes: number, intervalMin: number): number {
  const m = Math.floor(Number(minutes) || 0);
  const step = Math.max(1, Math.floor(Number(intervalMin) || 1));
  return Math.max(1, Math.floor(Math.min(FISH_MINUTES_MAX, Math.max(1, m)) / step));
}

/** Обратно: сколько минут занимают k попыток при этом интервале. */
export const minutesForTries = (tries: number, intervalMin: number): number =>
  Math.max(1, Math.floor(Number(tries) || 0)) * Math.max(1, Math.floor(Number(intervalMin) || 1));

/** Траты энергии, которые рыбалку НЕ прерывают: покупка за энергию и стейкинг фишек. */
const KEEPS_FISHING = new Set(["market", "stake"]);

/** Трата энергии по этой причине — «другое действие» героя: рыбалка кончается. */
export const fishStopsOn = (reason: string): boolean => !KEEPS_FISHING.has(reason);

/** Поймано: товар, имя, картинка, штук. */
export type FishCatch = { itemId: string; name: string; image: string | null; n: number };

/** Рыбалка глазами кнопки. */
export type FishView = {
  /** Идёт ли рыбалка. */
  fishing: boolean;
  /** Клетка, где рыбачит (null — не рыбачит). */
  q: number | null;
  r: number | null;
  /** Сколько поймано за эту рыбалку. */
  caught: number;
  /** Сколько попыток уже отыграно и сколько заказано этим забросом. */
  tries: number;
  plan: number;
  /** Сколько до следующей попытки, мс (null — не рыбачит). */
  nextInMs: number | null;
  /** Поймано этим запросом. */
  got: FishCatch[];
  /** Созрело больше, чем выдаётся за раз, — перечитать сразу. */
  more: boolean;
  /** Рыбалка кончилась этим запросом — почему. */
  ended: FishStop | null;
};

/** «Не рыбачит». */
export const IDLE_FISH: FishView = {
  fishing: false,
  q: null,
  r: null,
  caught: 0,
  tries: 0,
  plan: 0,
  nextInMs: null,
  got: [],
  more: false,
  ended: null,
};
