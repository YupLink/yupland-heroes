// Основной инструмент (владелец, 29.09.2026; ПРАВИЛА §8.24): в руках у героя
// один инструмент, и взаимодействовать с окружением можно только им.
//
// Инструмент — свой товар: «топор/кирка» — инструмент декора
// (meta.interact.toolItemIds у шаблона), «лопата» — галочка is_shovel, «удочка» —
// галочка is_rod (рыбалка, §8.35). Основной хранится у выбранного героя
// (hero_instance.main_tool — ключ стопки рюкзака). Правило одно на сервер
// (main-tool/*, гард в SQL удара tool-wear.ts и поимки fishing-catch-sql.ts) и окна.
//
// Лопаты и удочки — «семейства по галочке»: делу годится любая стопка вида.
//
// Какой основной сейчас (effectiveMain): стопка основного с целой штукой — она;
// последняя штука лопаты (удочки) сломалась, а у героя есть другая лопата
// (удочка), — та (начатая первой); иначе основного нет (сломался последний
// топор — рубить нечем).
//
// Что нужно действию (pickMain): рубке и добыче — инструмент этого декора
// (любой из его списка, lib/raid/decorTools), лопате — любая лопата, рыбалке —
// любая удочка. Основной подходит —
// действуем. Основного нет, а подходящая стопка одна, — она и есть основной
// (станет им первым же действием: так рубят те, кто рубил до выбора основного).
// Иначе «Взять …» (idle — есть, но не в руках или подходящих несколько) или
// «Нужен …» (none — нечем).

/** Стопка рюкзака глазами правила: ключ, штуки, лопата/удочка ли, прочность текущей штуки. */
export type ToolStack = {
  stackKey: string;
  count: number;
  shovel?: boolean | null;
  /** Удочка (галочка «Удочка», §8.35). */
  rod?: boolean | null;
  durability?: number | null;
};

/** Семейства по галочке: делу годится любая стопка вида. */
export type ToolFamily = "shovel" | "rod";

/**
 * Что нужно действию: лопата или удочка — любая, декору — ключ стопки его
 * инструмента или любой из списка (items, 05.10: несколько видов топоров).
 */
export type ToolNeed =
  | { kind: ToolFamily }
  | { kind: "item"; key: string }
  | { kind: "items"; keys: readonly string[] };

/** ok — чем действовать; idle — есть, но надо взять (key — что взять); none — нечем. */
export type MainPick =
  | { ok: true; key: string }
  | { ok: false; why: "none" }
  | { ok: false; why: "idle"; key: string };

const whole = (s: ToolStack): boolean => Number(s.count) >= 1;

const inFamily = (s: ToolStack, f: ToolFamily): boolean =>
  f === "rod" ? s.rod === true : s.shovel === true;

/** В рюкзаке есть стопка `key` с целой штукой. */
export const aliveKey = (stacks: readonly ToolStack[], key: string | null | undefined): boolean =>
  !!key && stacks.some((s) => s.stackKey === key && whole(s));

/** Стопки семейства с целой штукой: сначала начатая (меньше прочности), дальше по ключу. */
export function familyOf(stacks: readonly ToolStack[], f: ToolFamily): ToolStack[] {
  const left = (s: ToolStack) => Number(s.durability ?? 100);
  return stacks
    .filter((s) => inFamily(s, f) && whole(s))
    .sort(
      (a, b) =>
        left(a) - left(b) || (a.stackKey < b.stackKey ? -1 : a.stackKey > b.stackKey ? 1 : 0),
    );
}

/** Лопаты с целой штукой: сначала начатая (меньше прочности), дальше по ключу. */
export const shovelsOf = (stacks: readonly ToolStack[]): ToolStack[] => familyOf(stacks, "shovel");

/**
 * Основной сейчас. stored — что записано у героя (и лопата/удочка ли это: у
 * сломанной последней штуки строки в рюкзаке может уже не быть).
 */
export function effectiveMain(
  stored: { key: string | null; shovel: boolean; rod?: boolean },
  stacks: readonly ToolStack[],
): string | null {
  if (aliveKey(stacks, stored.key)) return stored.key;
  if (stored.key && stored.shovel) return familyOf(stacks, "shovel")[0]?.stackKey ?? null;
  if (stored.key && stored.rod) return familyOf(stacks, "rod")[0]?.stackKey ?? null;
  return null;
}

/** Чем действовать. main — основной сейчас (effectiveMain); мёртвый ключ = нет основного. */
export function pickMain(
  main: string | null,
  stacks: readonly ToolStack[],
  need: ToolNeed,
): MainPick {
  const cur = aliveKey(stacks, main) ? main : null;
  if (need.kind === "item" || need.kind === "items") {
    // Список: основной в руках из списка — он; иначе первый по порядку, что есть.
    const keys = need.kind === "item" ? [need.key] : need.keys;
    const fit = keys.filter((k) => aliveKey(stacks, k));
    if (fit.length === 0) return { ok: false, why: "none" };
    if (cur !== null && fit.includes(cur)) return { ok: true, key: cur };
    if (cur === null) return { ok: true, key: fit[0] };
    return { ok: false, why: "idle", key: fit[0] };
  }
  const fit = familyOf(stacks, need.kind);
  if (fit.length === 0) return { ok: false, why: "none" };
  if (cur !== null && fit.some((s) => s.stackKey === cur)) return { ok: true, key: cur };
  if (cur === null && fit.length === 1) return { ok: true, key: fit[0].stackKey };
  return { ok: false, why: "idle", key: fit[0].stackKey };
}

/**
 * Прочность для показа, %. У живой штуки не бывает 0 %: на нуле она ломается и
 * уходит из рюкзака сразу (§8.19), поэтому 0,4 % — это «1 %», а не «0 %».
 */
export const shownDurability = (d: number): number =>
  Math.min(100, Math.max(1, Math.round(Number(d) || 0)));
