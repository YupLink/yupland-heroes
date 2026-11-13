// Взаимодействие с декором (владелец, 25.09): галочка «Взаимодействие» у
// шаблона декора = декор можно уничтожить. Стоит энергию, даёт свой товар
// (например «Дерево») фиксированным числом или диапазоном «n-n»; после
// взаимодействия декор исчезает с клетки полностью, товар — игроку.
//
// Хранится в meta шаблона:
//   meta.interact = { on, cost, itemId, amount, toolItemIds?, toolItemId?, respawnMin?, label? }.
//
// Инструмент (владелец, 27.09): «1 топор = 1 декор». Если у шаблона задан
// свой товар-инструмент, декор не собирается молча — игроку предлагается
// «Срубить», и за каждый декор уходит ровно 1 штука из рюкзака героя (с
// 28.09 — прочность инструмента, если у товара задан износ: lib/raid/toolWear).
// Старые настройки без toolItemId работают как раньше.
//
// Несколько инструментов (владелец, 05.10): toolItemIds — подходит любой из
// списка (lib/raid/decorTools); toolItemId — первый из него, для старого кода.
//
// Респавн (владелец, 28.09): «Респавн, мин» — через столько минут срубленный
// декор встаёт на ту же клетку (server/api/beta-raid/decor-respawn.ts). Пусто —
// не возвращается, как раньше.
//
// Надпись действия (владелец, 29.09): «не „уничтожить“ должно быть, а
// „срубить“». Своя у шаблона, по-русски и по-английски: плашка маршрута,
// её кнопка и окно рубки пишут её. Нет en — ru; нет вовсе — прежние тексты.
import type { Lang } from "@/lib/store";
import { toolIdOf, toolIdsOf } from "@/lib/raid/decorTools";
import { secureRandom } from "@/lib/secureRandom";

export { toolIdOf };

export type DecorInteract = {
  /** Энергия за взаимодействие (0 — бесплатно). */
  cost: number;
  /** Свой товар (raid_custom_item, cst_…), который получит игрок. */
  itemId: string;
  /** Сколько: «3» или «2-5». */
  amount: string;
  /** Первый из toolItemIds — для старого кода и кэшей. */
  toolItemId?: string;
  /** Свои товары-инструменты (cst_…), подходит любой: снимает прочность за один декор. */
  toolItemIds?: string[];
  /** Через сколько минут декор вернётся на клетку; нет — не вернётся. */
  respawnMin?: number;
  /** Надпись действия («Срубить» / «Chop»); нет — прежние тексты игры. */
  label?: DecorLabel;
};

/** Надпись действия по языкам; пустой язык не хранится. */
export type DecorLabel = { ru?: string; en?: string };

export type AmountRange = { min: number; max: number };

/** Потолок количества за одно взаимодействие — опечатка, а не щедрость. */
export const AMOUNT_MAX = 1_000_000;
/** Потолок цены в энергии. */
export const COST_MAX = 100_000;

/** «3» → 3..3, «2-5» → 2..5 (перевёрнутый разворачиваем). Целые ≥ 1; мусор — null. */
export function amountRange(v: unknown): AmountRange | null {
  const m = /^\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*$/.exec(String(v ?? ""));
  if (!m) return null;
  const a = Math.min(AMOUNT_MAX, Number(m[1]));
  const b = m[2] === undefined ? a : Math.min(AMOUNT_MAX, Number(m[2]));
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return min >= 1 ? { min, max } : null;
}

export const amountText = (r: AmountRange): string =>
  r.min === r.max ? String(r.min) : `${r.min}-${r.max}`;

/** Цена в энергии: до десятых (энергия дробная), не меньше нуля. */
export function costOf(v: unknown): number {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(COST_MAX, Math.round(n * 10) / 10);
}

/** Потолок респавна — 30 суток: больше — опечатка, а не задумка. */
export const RESPAWN_MAX_MIN = 30 * 24 * 60;

/** «Респавн, мин»: целое ≥ 1 (до потолка); пусто, ноль и мусор — не возвращается. */
export function respawnOf(v: unknown): number | null {
  const n = Math.floor(
    Number(
      String(v ?? "")
        .trim()
        .replace(",", "."),
    ),
  );
  return Number.isFinite(n) && n >= 1 ? Math.min(RESPAWN_MAX_MIN, n) : null;
}

/** Потолок надписи в знаках: это подпись кнопки, а не описание. */
export const LABEL_MAX = 20;

/**
 * Строка надписи: без управляющих символов и битых половинок UTF-16 (jsonb их
 * не примет), без невидимых (пустая на вид надпись, разворот текста плашки;
 * склейку эмодзи и теги флагов не трогаем), пробелы по краям срезаны, внутри —
 * по одному.
 */
export function labelLine(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/[\p{Cc}\p{Cs}]/gu, " ")
    .replace(/(?![‍\u{E0020}-\u{E007F}])\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Длиннее потолка? Считаем знаки, а не половинки UTF-16: эмодзи — один знак. */
export const labelTooLong = (v: unknown): boolean => [...labelLine(v)].length > LABEL_MAX;

/**
 * Надпись из meta или формы: строки чистятся, пустой язык выпадает, обе пусты —
 * null. Длиннее потолка режем: запись длиннее сервер не пускает, а чтение не
 * должно верить форме.
 */
export function labelOf(v: unknown): DecorLabel | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: DecorLabel = {};
  for (const lang of ["ru", "en"] as const) {
    const s = [...labelLine(o[lang])].slice(0, LABEL_MAX).join("").trim();
    if (s) out[lang] = s;
  }
  return out.ru || out.en ? out : null;
}

/** Надпись на языке игрока: свой язык, нет en — ru; нет — null (экран пишет прежнее). */
export function labelFor(v: unknown, lang: Lang): string | null {
  const l = labelOf(v);
  return (lang === "en" ? l?.en || l?.ru : l?.ru) || null;
}

/** Настройка из meta.interact; выключено или не заполнено — null. */
export function parseDecorInteract(raw: unknown): DecorInteract | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.on !== true) return null;
  const itemId = typeof o.itemId === "string" && o.itemId.startsWith("cst_") ? o.itemId : null;
  const range = amountRange(o.amount);
  if (!itemId || !range) return null;
  const conf: DecorInteract = { cost: costOf(o.cost), itemId, amount: amountText(range) };
  const tools = toolIdsOf(o);
  if (tools.length > 0) Object.assign(conf, { toolItemId: tools[0], toolItemIds: tools });
  const respawn = respawnOf(o.respawnMin);
  if (respawn) conf.respawnMin = respawn;
  const label = labelOf(o.label);
  if (label) conf.label = label;
  return conf;
}

/** Бросок количества в диапазоне (оба края включительно). */
export function rollAmount(r: AmountRange, rnd: () => number = secureRandom): number {
  const span = r.max - r.min + 1;
  return r.min + Math.min(span - 1, Math.floor(Math.max(0, rnd()) * span));
}
