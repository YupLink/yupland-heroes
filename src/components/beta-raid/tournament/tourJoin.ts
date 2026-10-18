// Запись на турнир глазами окна: на какой полке плашка («Идут / Скоро /
// Прошлые»), какую кнопку под ней показать, время старта по UTC. Без React —
// проверяется tourJoin.test.ts.
//
// Слово владельца (04.10.2026): участвует только записавшийся, каждый турнир —
// своя запись, цену ставит админ (по умолчанию 5 золота, пусто — бесплатно);
// записаться можно на идущий и на запланированный.
import {
  TOUR_DEFAULT_ENTRY_PRICE,
  type TourEntryPrice,
  type TourPlate,
} from "@/lib/tournament/types";

/**
 * Ответ плашек (TourPlates). «Скоро» необязательна: снимок из persist-кэша,
 * сохранённый до записи, её не знает.
 */
export type PlatesData = { active: TourPlate[]; past: TourPlate[]; soon?: TourPlate[] };

export type TourShelves = { active: TourPlate[]; soon: TourPlate[]; past: TourPlate[] };

const ms = (v: string | null | undefined): number => {
  const n = v ? Date.parse(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

/**
 * Полки окна. Идут — идущие и досчитываемые, ближайший конец первым; скоро —
 * запланированные (черновик с временем начала), ближайший старт первым;
 * прошлые — свежие первыми. Плашка с одним id попадает на полку один раз.
 */
export function shelvePlates(data: PlatesData | undefined): TourShelves {
  const out: TourShelves = { active: [], soon: [], past: [] };
  if (!data) return out;
  const seen = new Set<string>();
  for (const p of [...data.active, ...(data.soon ?? []), ...data.past]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    if (p.status === "done") out.past.push(p);
    else if (p.status === "draft") {
      if (p.startAt) out.soon.push(p);
    } else out.active.push(p);
  }
  out.active.sort((a, b) => ms(a.endsAt) - ms(b.endsAt));
  out.soon.sort((a, b) => ms(a.startAt) - ms(b.startAt));
  out.past.sort((a, b) => ms(b.finishedAt) - ms(a.finishedAt));
  return out;
}

export type JoinView = { kind: "join"; price: TourEntryPrice[] } | { kind: "joined" } | null;

/**
 * Цена с плашки. Снимок persist-кэша, сохранённый до цены у турнира, её не
 * знает — тогда прежние 5 золота: списывает всё равно сервер по цене из базы.
 */
export const plateEntryPrice = (plate: TourPlate): TourEntryPrice[] =>
  Array.isArray(plate.entryPrice) ? plate.entryPrice : TOUR_DEFAULT_ENTRY_PRICE;

/**
 * Что под плашкой. Записан — «Вы участвуете» (у прошлого — ничего: место видно
 * в уголке). Не записан — «Записаться» у идущего, пока не вышло время, и у
 * запланированного. Черновик без времени, выплата, прошлый — без кнопки.
 */
export function joinView(plate: TourPlate, now: number): JoinView {
  if (plate.status === "done") return null;
  if (plate.joined) return { kind: "joined" };
  const price = plateEntryPrice(plate);
  if (plate.status === "draft") return plate.startAt ? { kind: "join", price } : null;
  if (plate.status !== "running") return null;
  const end = ms(plate.endsAt);
  if (end > 0 && end <= now) return null;
  return { kind: "join", price };
}

/** Записался — плашка сразу «Вы участвуете», не дожидаясь перезапроса. */
export function markJoined(data: PlatesData | undefined, id: string): PlatesData | undefined {
  if (!data) return data;
  const mark = (list: TourPlate[]) => list.map((p) => (p.id === id ? { ...p, joined: true } : p));
  return {
    ...data,
    active: mark(data.active),
    past: mark(data.past),
    ...(data.soon ? { soon: mark(data.soon) } : {}),
  };
}

const MONTHS_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * Дата и время по UTC «без плюсов-минусов» (владелец): «05.10 00:00» или
 * «Oct 5, 00:00». Подпись «UTC» ставит словарь. Нет даты или мусор — null.
 */
export function utcStamp(iso: string | null | undefined, lang: string): string | null {
  const t = ms(iso);
  if (!t) return null;
  const d = new Date(t);
  const time = `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  return lang === "ru"
    ? `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)} ${time}`
    : `${MONTHS_EN[d.getUTCMonth()]} ${d.getUTCDate()}, ${time}`;
}
