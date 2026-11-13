// Покупка и посадка деревьев (владелец, 22.10.2026): «должна быть возможность
// купить деревья — те, которые можно разместить как срубаемые — добавь их в
// товары, чтобы админ мог задать им цену покупки — попадают в инвентарь — по
// выставлению — как и грибы, по принципу размещения шахт, с подсветом поля.
// Загородить можно всё что угодно. Нельзя поставить на объект: здание, постройку
// или декор; на дорогу тоже нельзя; на кучку технически можно — но только на
// кучку. Размещение стоит 15 энергии».
//
// Общие правила сервера и клиента:
//  · дерево — шаблон декора с включённым взаимодействием и надписью «Срубить» /
//    «Chop» (meta.interact.label, lib/raid/decorInteract);
//  · товар лавки — вид `tree`, ref — id шаблона; в рюкзаке стопка `tree:<id>`;
//  · кучка — бугорок: закопанный мешочек, обычный или магический сундук
//    (ПРАВИЛА §8.21, §8.22, дополнение №5 — «бугорки-кучки под деревом»).
//    Остаётся под деревом; срубили — снова видна;
//  · клетка под дерево — пустая или с кучкой: без постройки, объекта, декора,
//    блока, дороги, воды, купола, стоящего сундука, мешочка на земле, судна,
//    охраны и чужого игрока (своя или соседняя — как у шахт и грибов).
//
// Камни и горы (владелец, 25.10.2026: «такое же для камней, под горы, камни —
// что киркой можно снести»; поставленные игроком — тоже одноразовые): товар
// `rock`, стопка `rock:<id>`; шаблон — декор, среди инструментов которого есть
// кирка (tree-cell-sql pickRockSql). Дальше всё как у дерева: те же клетки,
// энергия и окно; добыли поставленное — не отрастает (метка planted_decor).
import type { Lang } from "@/lib/store";
import { parseDecorInteract } from "@/lib/raid/decorInteract";
import { localizeAssetName } from "@/lib/translations/assetNames";

/** Цена посадки в энергии. */
export const TREE_PLANT_ENERGY = 15;

/** Вид товара лавки и строки рюкзака. */
export const TREE_KIND = "tree" as const;

/** Камень или гора для установки — вид товара лавки и строки рюкзака. */
export const ROCK_KIND = "rock" as const;

/** Что ставится из рюкзака на клетку декором: дерево или камень. */
export type PlantKind = typeof TREE_KIND | typeof ROCK_KIND;

const DECOR_ID = /^decoration_[A-Za-z0-9_-]{1,64}$/;

/** Ключ стопки рюкзака по шаблону: tree:<id> или rock:<id>. */
export const plantStackKey = (kind: PlantKind, decorId: string): string => `${kind}:${decorId}`;

/** Ключ стопки рюкзака по шаблону дерева. */
export const treeStackKey = (decorId: string): string => plantStackKey(TREE_KIND, decorId);

/** Вид и шаблон из ключа стопки; не дерево и не камень (или мусор) — null. */
export function plantOfStack(
  stackKey: string | null | undefined,
): { kind: PlantKind; decorId: string } | null {
  const key = typeof stackKey === "string" ? stackKey : "";
  for (const kind of [TREE_KIND, ROCK_KIND] as const) {
    if (!key.startsWith(`${kind}:`)) continue;
    const decorId = key.slice(kind.length + 1);
    return DECOR_ID.test(decorId) ? { kind, decorId } : null;
  }
  return null;
}

/** Шаблон из ключа стопки дерева или камня; прочее — null. */
export const treeIdOfStack = (stackKey: string | null | undefined): string | null =>
  plantOfStack(stackKey)?.decorId ?? null;

/** Стопка ставится на клетку декором (дерево или камень). */
export const isTreeStackKey = (stackKey: string | null | undefined): boolean =>
  treeIdOfStack(stackKey) !== null;

/** Стопка — камень или гора (rock:<id>). */
export const isRockStackKey = (stackKey: string | null | undefined): boolean =>
  plantOfStack(stackKey)?.kind === ROCK_KIND;

/** Тексты, у которых у камня свои слова («поставить камень», а не «посадить дерево»). */
const ROCK_TEXT = new Set([
  "tree.plant_title",
  "tree.plant_cost",
  "tree.planted",
  "tree.road",
  "tree.water",
  "tree.no_item",
  "tree.gone_kind",
  "tree.island",
]);

/** Ключ словаря окна и отказа под стопку: у камня — rock.*, общие — как есть. */
export const plantTextKey = (key: string, stackKey: string | null | undefined): string =>
  isRockStackKey(stackKey) && ROCK_TEXT.has(key) ? `rock.${key.slice("tree.".length)}` : key;

/**
 * Срубаемое дерево: взаимодействие включено и настроено (товар, количество),
 * надпись действия — «Срубить» или «Chop». «Добыть», «Выжать» — не дерево.
 */
export function isChoppableInteract(raw: unknown): boolean {
  const conf = parseDecorInteract(raw);
  if (!conf) return false;
  const ru = (conf.label?.ru ?? "").trim().toLowerCase();
  const en = (conf.label?.en ?? "").trim().toLowerCase();
  return ru === "срубить" || en === "chop";
}

/** Имя стопки на языке игрока: дерево и камень — переводом имени шаблона, прочее — как есть. */
export const treeNameOr = (
  stackKey: string | null | undefined,
  name: string,
  lang: Lang,
): string => (isTreeStackKey(stackKey) ? localizeAssetName(name, lang) : name);

/** Признаки клетки (как их отдаёт база, tree-cell-sql). */
export type TreeCellFlags = {
  building?: boolean | null;
  obj?: boolean | null;
  water?: boolean | null;
  dome?: boolean | null;
  guard?: boolean | null;
  decor?: boolean | null;
  ship?: boolean | null;
  road?: boolean | null;
  /** Блок клеток, объект (и повергнутый) или любой декор. */
  taken?: boolean | null;
  /** На клетке стоит другой игрок. */
  player?: boolean | null;
  /** Стоящий (не закопанный) сундук. */
  stand_chest?: boolean | null;
  /** Живой мешочек на земле (закопанный — кучка, ей можно). */
  ground_bag?: boolean | null;
};

/**
 * Почему сюда нельзя (ключ словаря) или null — можно. Клетки нет — занято.
 * Кучка (бугорок) не мешает: её признаков здесь нет вовсе.
 */
export function treeCellVerdict(f: TreeCellFlags | null | undefined): string | null {
  if (!f) return "tree.busy";
  if (f.water) return "tree.water";
  if (f.road) return "tree.road";
  if (f.player) return "tree.player";
  if (f.ground_bag) return "tree.bag";
  const held =
    f.building || f.obj || f.dome || f.guard || f.decor || f.ship || f.taken || f.stand_chest;
  return held ? "tree.busy" : null;
}

/** Клетка выбора: смещение от героя, можно ли и почему нет. */
export type TreeCellChoice = { dq: number; dr: number; ok: boolean; reason: string | null };
