// Пак-замена: чем открывать и выдавать пак, у которого кончился запас.
//
// Коллекции внутри пака конечны (initial_supply). Когда они выбраны, открытие
// падало с «Запас всех коллекций пака исчерпан» — пак у игрока превращался в
// кирпич, а награда на карте продолжала выдавать такой же кирпич. Теперь у
// пака есть замена (fallback_pack_id): админ заранее говорит, чем подменять,
// и обе дороги — открытие и выдача — уходят по ней.
//
// Цепочка допускается (A → B → C), но короткая и с защитой от кольца: админ
// вполне может замкнуть A → B → A, и без счётчика это был бы вечный цикл.
import { pg } from "../db/pg";
import { getCollectionUsedCounts } from "./chips-utils";
import type { PgChipPack } from "../db/pg";

const MAX_CHAIN = 5;

export type PackItem = {
  collectionId?: string | null;
  templateId?: string | null;
  level: number;
  weight: number;
};

type DropTable = {
  slots?: number;
  dropTable?: PackItem[];
  guarantees?: Array<{ minLevel: number; slotsAtLeast: number }>;
};

/** Пак с полем замены — колонка новая, в типе таблицы её ещё нет. */
export type PackWithFallback = PgChipPack & { fallback_pack_id?: string | null };

/**
 * Что из дроп-таблицы ещё можно выдать.
 *
 * Позиция с коллекцией живёт, пока в коллекции остались невыданные фишки;
 * позиция с прямым шаблоном (без коллекции) не кончается никогда.
 */
export async function availableItems(pack: PackWithFallback): Promise<PackItem[]> {
  const dt = (pack.drop_table ?? {}) as DropTable;
  const raw = dt.dropTable ?? [];
  const colIds = Array.from(
    new Set(raw.map((it) => it.collectionId).filter((x): x is string => !!x)),
  );
  if (colIds.length === 0) return raw;

  const supply = new Map<string, number>();
  const cols = await pg.chipCollections.findMany();
  for (const c of cols) supply.set(c.id, c.initial_supply);
  const used = await getCollectionUsedCounts(colIds);

  return raw.filter((it) => {
    if (!it.collectionId) return true;
    return (supply.get(it.collectionId) ?? 0) > (used.get(it.collectionId) ?? 0);
  });
}

/**
 * Пак, которым реально можно открыть грант: сам исходный либо его замена.
 *
 * Возвращает и позиции дроп-таблицы — они уже посчитаны, и считать их второй
 * раз в открытии значило бы лишний проход по всем коллекциям.
 */
export async function resolveOpenablePack(
  packId: string,
): Promise<{ pack: PackWithFallback; items: PackItem[]; substituted: boolean } | null> {
  const seen = new Set<string>();
  let id: string | null = packId;
  while (id && !seen.has(id) && seen.size < MAX_CHAIN) {
    seen.add(id);
    const pack = (await pg.chipPacks.findOne({ id })) as PackWithFallback | null;
    if (!pack) return null;
    const items = await availableItems(pack);
    if (items.length > 0) return { pack, items, substituted: pack.id !== packId };
    id = pack.fallback_pack_id ?? null;
  }
  return null;
}

/**
 * Какой пак класть игроку в инвентарь.
 *
 * Подменяем уже на выдаче, а не только на открытии: иначе игрок видел бы у
 * себя пак, который заведомо не откроется, и шёл с этим к админу. Если замены
 * нет или она тоже пуста — отдаём исходный: пусть лежит, админ дольёт тираж.
 */
export async function resolveGrantablePack(packId: string): Promise<string> {
  const found = await resolveOpenablePack(packId).catch(() => null);
  return found?.pack.id ?? packId;
}
