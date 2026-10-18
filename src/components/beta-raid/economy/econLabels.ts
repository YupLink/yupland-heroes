// Подписи для новых вкладок Экономики: группы движений, леджеры, источники
// и стороны сделок, лазейки, валюты, время и координаты. Всё через словарь
// econ.* (ru+en) — старый currencyLabel из economyFormat русскоязычный и для
// новых вкладок не годится.
import type { Lang } from "@/lib/store";
import type {
  EconKindGroup,
  FeedRow,
  LoopholeKind,
  TradeSide,
  TradeSource,
} from "@/lib/econ/types";
import { dict as econDict } from "@/lib/translations/econ";

type T = (key: string, params?: Record<string, string | number>) => string;

export function groupLabel(t: T, g: EconKindGroup): string {
  return t(`econ.group.${g}`);
}

export function ledgerLabel(t: T, l: FeedRow["ledger"]): string {
  return t(`econ.ledger.${l}`);
}

export function sourceLabel(t: T, s: TradeSource): string {
  return t(`econ.source.${s}`);
}

export function sideLabel(t: T, s: TradeSide): string {
  return t(`econ.side.${s}`);
}

export function loopholeLabel(t: T, k: LoopholeKind): string {
  return t(`econ.loop.${k}`);
}

export function loopholeHint(t: T, k: LoopholeKind): string {
  return t(`econ.loop.${k}_hint`);
}

/** Валюта: известные — по словарю, токены (Darai, GJ, USDT…) — как есть. */
export function econCurrencyLabel(t: T, cur: string): string {
  return `econ.cur.${cur}` in econDict ? t(`econ.cur.${cur}`) : cur;
}

/** Контрагент: игрок по имени, иначе служебные 'shop'|'town'|'sink'. */
export function counterpartyLabel(t: T, id: string | null, name: string | null): string {
  if (name) return name;
  if (id === "shop" || id === "town" || id === "sink") return t(`econ.cp.${id}`);
  return id ? `${id.slice(0, 10)}…` : "—";
}

/** Координата как текст: «28,45», с картой — «map:28,45» (если не дефолт). */
export function placeLabel(
  place: { mapId: string | null; q: number | null; r: number | null } | null,
): string {
  if (!place || place.q == null || place.r == null) return "—";
  const cell = `${place.q},${place.r}`;
  return place.mapId && place.mapId !== "default" ? `${place.mapId}:${cell}` : cell;
}

const LOCALE: Record<Lang, string> = { ru: "ru-RU", en: "en-GB" };

/** «22.09 14:05» — компактно, без года: окно отчёта не длиннее 92 дней. */
export function fmtWhen(at: string, lang: Lang): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleString(LOCALE[lang], {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Ключ дня отчёта 'YYYY-MM-DD' → «22.09» / «22/09». */
export function fmtDay(day: string, lang: Lang): string {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(LOCALE[lang], { day: "2-digit", month: "2-digit" });
}
