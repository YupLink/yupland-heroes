// Клад дня (владелец, 07.11.2026; ПРАВИЛА §8.117). Сервер раз в день закапывает
// клад из фонда админа в случайной доступной клетке случайного мира; живёт сутки,
// достаётся первому, кто выкопает клетку лопатой; не нашли — исчезает и
// закапывается заново в другом месте (тот же приз: он уходит из фонда, только
// когда найден).
import { RESOURCE_LABELS_RU, type MarketPriceResource } from "@/lib/marketItem";

/** Слот дня — 09:00 по Москве (06:00 UTC; владелец 08.11.2026, было 12:00 МСК). */
export const TREASURE_SLOT_UTC_HOUR = 6;
/** Клад живёт сутки. */
export const TREASURE_LIFE_HOURS = 24;

/** Чем клад может быть: ресурсы и токены счёта, артефакт, пак, свой товар. */
export const TREASURE_RESOURCES: readonly MarketPriceResource[] = [
  "gold",
  "diamonds",
  "wood",
  "stone",
  "energy",
  "likes",
  "token",
  "art",
  "pack",
  "custom",
];

export type TreasurePrize = {
  resource: MarketPriceResource;
  token: string | null;
  amount: number;
  /** Имя шаблона предмета (артефакт, пак, товар) — снимок на момент записи в фонд. */
  name: string | null;
  image: string | null;
};

export type TreasureStatus = "live" | "found" | "expired";

/** Предметный приз (артефакт, пак, свой товар) требует выбранный шаблон. */
export const prizeNeedsRef = (res: MarketPriceResource): boolean =>
  res === "token" || res === "art" || res === "pack" || res === "custom";

/** Ошибка формы приза или null. «Любой артефакт редкости» кладом не бывает. */
export function prizeProblem(
  p: Pick<TreasurePrize, "resource" | "token" | "amount">,
): string | null {
  if (!TREASURE_RESOURCES.includes(p.resource)) return "treasure.bad_kind";
  if (!(Number.isFinite(p.amount) && p.amount > 0)) return "treasure.bad_amount";
  if (prizeNeedsRef(p.resource) && !p.token) return "treasure.bad_ref";
  if (p.resource === "art" && /^art_any_/.test(p.token ?? "")) return "treasure.bad_ref";
  // Только целые: дробный токен счёт не примет (fractional_not_allowed) — клад не выдался бы.
  if (!Number.isInteger(p.amount)) return "treasure.bad_amount";
  return null;
}

/** Слот, в котором мы сейчас: день (UTC) и его начало. До 06:00 UTC — вчерашний. */
export function treasureSlot(now: number): { day: string; startMs: number } {
  const d = new Date(now);
  let start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), TREASURE_SLOT_UTC_HOUR);
  if (start > now) start -= 24 * 3600_000;
  return { day: new Date(start).toISOString().slice(0, 10), startMs: start };
}

type Lang = "ru" | "en";

const fmt = (n: number, lang: Lang): string =>
  n
    .toLocaleString(lang === "en" ? "en-US" : "ru-RU", { maximumFractionDigits: 8 })
    .replace(/\u00a0/g, " ");

const LABELS_EN: Partial<Record<MarketPriceResource, string>> = {
  gold: "Gold",
  diamonds: "Diamonds",
  wood: "Wood",
  stone: "Stone",
  energy: "Energy",
  likes: "Likes",
  art: "Artifact",
  pack: "Pack",
  custom: "Item",
};

/** «5 000 000 Darai», «500 Золото», «1 Меч героя» — Telegram, админка, газета. */
export function prizeText(
  p: Pick<TreasurePrize, "resource" | "token" | "amount" | "name">,
  lang: Lang = "ru",
): string {
  const label = lang === "en" ? LABELS_EN[p.resource] : RESOURCE_LABELS_RU[p.resource];
  const what = p.resource === "token" ? (p.token ?? "token") : (p.name ?? label ?? p.resource);
  return `${fmt(p.amount, lang)} ${what}`;
}

/** «08.11 09:00 МСК» — до какого времени клад лежит. */
export function mskText(ms: number, lang: Lang = "ru"): string {
  const d = new Date(ms + 3 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  const tz = lang === "en" ? "MSK" : "МСК";
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ${tz}`;
}
