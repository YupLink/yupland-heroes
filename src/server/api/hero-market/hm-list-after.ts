// Рынок героев: что делать после выставления (best-effort, вне транзакции).
//
//  · мешочек с не влезшим: соседям — событие «bags» клетке, новый мешочек —
//    сборщик, журнал сделок — «положил в мешочек» по каждой стопке (как «Выбросить»);
//  · грибы, которым не хватило места у основного: функция базы перенесла их
//    основному и сдвинула «час в рюкзаке» на сейчас — здесь сразу ставим их на
//    карту тем же обходом, что и по истечении часа (dmine-autoplace). Не встал
//    (некуда) — его подхватит минутный обход грибов (dmine-sweep), как любой
//    просроченный.
import { publishRaid } from "@/server/raidLive";
import { noteBagPut } from "@/server/api/beta-raid/loot-bag/bag-note";
import { isMushroomKind } from "@/lib/mushroomKinds";

/** Стопка из карманов, упавшая в мешочек. */
export type PocketStack = {
  stackKey: string;
  kind: string;
  refId: string | null;
  name: string;
  count: number;
};

export type BagOut = { id: string; mapId: string; q: number; r: number; fresh?: boolean };

/** Мешочек выставления: куда упало, что упало, ключ журнала. */
export type Drop = { bag: BagOut | null; pockets: PocketStack[]; ref: string };

export const pocketsOf = (v: unknown): PocketStack[] =>
  Array.isArray(v)
    ? v.map((p: Record<string, unknown>) => ({
        stackKey: String(p.stackKey ?? ""),
        kind: String(p.kind ?? ""),
        refId: typeof p.refId === "string" ? p.refId : null,
        name: String(p.name ?? ""),
        count: Number(p.count) || 0,
      }))
    : [];

export function bagOf(v: unknown): BagOut | null {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  if (typeof b.id !== "string" || typeof b.mapId !== "string") return null;
  return { id: b.id, mapId: b.mapId, q: Number(b.q), r: Number(b.r), fresh: b.fresh === true };
}

/** Мешочки выставления: события клеткам, сборщик, журнал по стопкам. */
export function afterDrops(wallet: string, account: string, drops: Drop[]): void {
  const cells = new Map<string, Set<string>>();
  let fresh = false;
  for (const { bag, pockets, ref } of drops) {
    if (!bag) continue;
    fresh ||= bag.fresh === true;
    const set = cells.get(bag.mapId) ?? new Set<string>();
    set.add(`${bag.q},${bag.r}`);
    cells.set(bag.mapId, set);
    const actor = { wallet, mapId: bag.mapId, account };
    for (const p of pockets) {
      const stack = {
        stackKey: p.stackKey,
        kind: p.kind,
        refId: p.refId,
        name: p.name,
        image: null,
      };
      void noteBagPut({
        actor,
        bag: { q: bag.q, r: bag.r },
        stack,
        qty: p.count,
        ref: `${ref}:${p.stackKey}`,
      });
    }
  }
  for (const [mapId, set] of cells) publishRaid({ mapId, type: "bags", cells: [...set] });
  if (fresh)
    void import("@/server/api/beta-raid/loot-bag/bag-sweep")
      .then((m) => m.startLootBagSweeper())
      .catch(() => {});
}

/**
 * Поставить «выпавшие» грибы у героя сразу (ответ базы: planted — какие, cell —
 * клетка игрока, mainHero — у кого они теперь в рюкзаке). Ждём: следующий
 * герой пачки считает место по рюкзаку уже без них.
 */
export async function plantNow(wallet: string, account: string, r: Record<string, unknown>) {
  const planted = Array.isArray(r.planted) ? (r.planted as Array<Record<string, unknown>>) : [];
  const cell = r.cell as { mapId?: unknown; q?: unknown; r?: unknown } | null | undefined;
  if (planted.length === 0 || typeof r.mainHero !== "string" || typeof cell?.mapId !== "string")
    return;
  try {
    const { autoPlaceDmine } = await import("@/server/api/beta-raid/dmine/dmine-autoplace");
    for (const d of planted) {
      if (typeof d.id !== "string") continue;
      await autoPlaceDmine({
        id: d.id,
        hero_id: r.mainHero,
        account_id: account,
        mushroom: isMushroomKind(d.mushroom) ? d.mushroom : "darai",
        wallet,
        map_id: cell.mapId,
        q: Number(cell.q),
        r: Number(cell.r),
      }).catch((e: unknown) =>
        console.warn("[hero-market] гриб встанет минутным обходом:", d.id, String(e)),
      );
    }
  } catch (e) {
    console.warn("[hero-market] автопостановка грибов недоступна:", String(e));
  }
}
