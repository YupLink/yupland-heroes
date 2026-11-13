// Цена записи на турнир: какие ресурсы годятся, проверка цены админа, строка
// цены для игрока и письма (ru+en) и сравнение цен двух турниров.
//
// Слово владельца (04.10.2026): цену записи админ ставит любую, «текущие — 5
// золота, по умолчанию тоже 5 золота». Строки как у портала (PortalPrice) и
// берутся ВСЕ разом; пусто — запись бесплатная.
//
// Ресурсы — только те, что умеет списать resource-pay (spendOne): золото,
// камень, дерево, алмазы, лайки, билеты, энергия, токен и товар из рюкзака.
// Пак, герой, артефакт, босс и «свой товар» ценой там не списываются — цена
// из них упала бы на каждой записи, поэтому их нет и здесь.
import type { TourEntryPrice } from "@/lib/tournament/types";
import { starsForDarai } from "@/lib/starsForDarai";
import { ticketRowAsGold } from "@/lib/ticketPriceGold";

type Res = TourEntryPrice["resource"];

export const TOUR_ENTRY_RESOURCES: readonly Res[] = [
  "gold",
  "stone",
  "wood",
  "diamonds",
  "likes",
  "tickets",
  "energy",
  "token",
  "item",
];
export const TOUR_ENTRY_MAX_ROWS = 4;

/** Дробная сумма бывает только у токена и энергии; остальное — штуки. */
const FRACTIONAL: ReadonlySet<Res> = new Set<Res>(["token", "energy"]);

const isRes = (v: unknown): v is Res =>
  typeof v === "string" && (TOUR_ENTRY_RESOURCES as readonly string[]).includes(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Ошибка цены ключом перевода (tour.err.price_*) или null — цена годна. */
export function tourEntryPriceError(list: readonly TourEntryPrice[]): string | null {
  if (!Array.isArray(list) || list.length > TOUR_ENTRY_MAX_ROWS) return "tour.err.price_rows";
  for (const p of list) {
    if (!isRes(p?.resource)) return "tour.err.price_resource";
    const n = Number(p.amount);
    if (!Number.isFinite(n) || n <= 0) return "tour.err.price_amount";
    if (!FRACTIONAL.has(p.resource) && !Number.isInteger(n)) return "tour.err.price_amount";
    if (p.resource === "token" && !str(p.token)) return "tour.err.price_token";
    if (p.resource === "item" && (!str(p.itemKey) || !str(p.itemName))) {
      return "tour.err.price_item";
    }
  }
  return null;
}

/** Строка в каноническом виде: лишние поля чужих ресурсов отброшены. */
const clean = (p: TourEntryPrice): TourEntryPrice => ({
  resource: p.resource,
  amount: Number(p.amount),
  ...(p.resource === "token" ? { token: str(p.token) } : {}),
  ...(p.resource === "item" ? { itemKey: str(p.itemKey), itemName: str(p.itemName) } : {}),
});

/** Цена, которую сохраняем: строки без хвостов от смены ресурса в редакторе. */
export const cleanEntryPrice = (list: readonly TourEntryPrice[]): TourEntryPrice[] =>
  list.map(clean);

/**
 * Цена из базы (jsonb или его строка). Битую строку отбрасываем, а не роняем
 * окно: проверку цена прошла при сохранении.
 */
export function parseEntryPrice(raw: unknown): TourEntryPrice[] {
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((p): p is TourEntryPrice => {
      const o = (p ?? {}) as Partial<TourEntryPrice>;
      const n = Number(o.amount);
      return isRes(o.resource) && Number.isFinite(n) && n > 0;
    })
    .map(clean);
}

const keyOf = (p: TourEntryPrice): string => {
  const c = clean(p);
  return [c.resource, c.token ?? "", c.itemKey ?? "", c.amount].join("|");
};

/** Одна ли цена у двух турниров (порядок строк не важен) — письмо пишет её один раз. */
export function sameEntryPrice(a: readonly TourEntryPrice[], b: readonly TourEntryPrice[]) {
  if (a.length !== b.length) return false;
  const [x, y] = [a.map(keyOf).sort(), b.map(keyOf).sort()];
  return x.every((k, i) => k === y[i]);
}

// Формы слова: ru — 1 / 2–4 / 5+, en — одно / много. Подпись цены портала
// (portalPriceText) ставит именительный — «5 золото»; владелец пишет «5 золота».
const RU: Partial<Record<Res, [string, string, string]>> = {
  gold: ["золото", "золота", "золота"],
  stone: ["камень", "камня", "камней"],
  wood: ["дерево", "дерева", "дерева"],
  diamonds: ["алмаз", "алмаза", "алмазов"],
  likes: ["лайк", "лайка", "лайков"],
  tickets: ["билет", "билета", "билетов"],
  energy: ["энергия", "энергии", "энергии"],
};
const EN: Partial<Record<Res, [string, string]>> = {
  gold: ["gold", "gold"],
  stone: ["stone", "stone"],
  wood: ["wood", "wood"],
  diamonds: ["diamond", "diamonds"],
  likes: ["like", "likes"],
  tickets: ["ticket", "tickets"],
  energy: ["energy", "energy"],
};

function ruForm(n: number, f: [string, string, string]): string {
  if (!Number.isInteger(n)) return f[1];
  const [d, h] = [n % 10, n % 100];
  if (d === 1 && h !== 11) return f[0];
  return d >= 2 && d <= 4 && (h < 10 || h >= 20) ? f[1] : f[2];
}

/** Число по-русски «50 000», по-английски «50,000». */
export const fmtEntryAmount = (n: number, lang: string): string =>
  new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 4 }).format(n);

/** Одна строка цены: «5 золота», «1 000 Darai», «2 × Яблоко». Билеты — золотом ×500 (§8.61). */
export function entryPriceLine(row: TourEntryPrice, lang: string): string {
  const p = ticketRowAsGold(row);
  const n = Number(p.amount) || 0;
  const num = fmtEntryAmount(n, lang);
  if (p.resource === "item")
    return `${num} × ${str(p.itemName) || (lang === "ru" ? "товар" : "item")}`;
  if (p.resource === "token") {
    // Звездочнику без DARAI — в звёздах (lib/starsForDarai.ts).
    const stars = str(p.token) === "Darai" ? starsForDarai(n) : null;
    return stars != null ? `${fmtEntryAmount(stars, lang)} ★` : `${num} ${str(p.token)}`;
  }
  if (lang === "ru") {
    const f = RU[p.resource];
    return f ? `${num} ${ruForm(n, f)}` : `${num} ${p.resource}`;
  }
  const f = EN[p.resource];
  return f ? `${num} ${n === 1 ? f[0] : f[1]}` : `${num} ${p.resource}`;
}

/**
 * Цена записи словами для игрока и письма: «5 золота», «5 золота + 1 алмаз».
 * Строки берутся вместе — поэтому «+», а не запятая (та читалась бы как выбор).
 * Пусто — пустая строка: бесплатную запись окно и письмо называют своим текстом.
 */
export function tourEntryPriceLabel(list: readonly TourEntryPrice[], lang: string): string {
  return list.map((p) => entryPriceLine(p, lang)).join(" + ");
}
