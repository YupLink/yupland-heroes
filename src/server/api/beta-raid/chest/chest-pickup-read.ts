// «Забрать сундук»: чтение снимка для плана и итога нажатия из журнала.
//
// Снимок — одним запросом (chest-pickup-snap-sql.ts): план и отпечатки обязаны
// видеть одно и то же состояние рюкзака и сети, иначе запись сверяла бы
// отпечаток не того рюкзака, по которому считали место.
import { mcpExec } from "@/server/db/mcpClient";
import type { ChestPickupResult, ChestSlot, LootPick } from "@/lib/magicChest";
import { exactQty } from "@/lib/warehouseCells";
import { num, sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { plunderItems, type PlunderItem } from "@/server/api/beta-raid/chest/chest-plunder-sql";
import type { NetRow, PickupSnap } from "@/server/api/beta-raid/chest/chest-pickup-plan";
import {
  pickupDoneSql,
  pickupSnapSql,
  type PickupWho,
} from "@/server/api/beta-raid/chest/chest-pickup-snap-sql";

type RawSnap = {
  chest: { itemId: string; name: string; image: string | null; potion: boolean | null } | null;
  guard: { tpl: string; name: string; image: string | null; whole: boolean | null } | null;
  guarded: boolean | null;
  last: boolean | null;
  bag: Array<{ stackKey: string; count: number | string; potion: boolean | null }> | null;
  net: Array<
    Omit<NetRow, "count" | "potion"> & { count: number | string; potion: boolean | null }
  > | null;
  bag_fp: string | null;
  net_fp: string | null;
};

const img = (v: string | null | undefined): string | null =>
  v && String(v).trim() !== "" ? String(v) : null;

/** jsonb из ответа: мост отдаёт его то массивом, то строкой. */
const jsonList = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/** Снимок для плана (+ стоит ли живая охрана). Ошибку базы не глотаем: «не прочли» — не «пусто». */
export async function loadPickupSnap(o: PickupWho): Promise<PickupSnap & { guarded: boolean }> {
  const raw = sqlRow<RawSnap>((await mcpExec(pickupSnapSql(o))) as unknown[]);
  if (!raw) throw new Error("chest.busy");
  const c = raw.chest;
  return {
    chest: c
      ? { itemId: c.itemId, name: c.name, image: img(c.image), potion: c.potion === true }
      : null,
    guard: raw.guard
      ? { ...raw.guard, image: img(raw.guard.image), whole: raw.guard.whole === true }
      : null,
    guarded: raw.guarded === true || !!raw.guard,
    last: raw.last === true,
    bag: (raw.bag ?? []).map((b) => ({
      stackKey: b.stackKey,
      count: num(b.count),
      potion: b.potion === true,
    })),
    net: (raw.net ?? [])
      .map((n) => ({ ...n, image: img(n.image), count: num(n.count), potion: n.potion === true }))
      .filter((n) => n.count > 0),
    bagFp: raw.bag_fp ?? "",
    netFp: raw.net_fp ?? "",
  };
}

/**
 * Позиция журнала нажатия: товар сети или метка сундука/охраны. wounded —
 * охрана была ранена и не вернулась; bagged у сундука — не влез к чужому и
 * лёг мешочком.
 */
type JournalItem = PlunderItem & { guard?: boolean; wounded?: boolean; bagged?: boolean };

/** Журнал нажатия: сеть (сундук и охрана — метками) и то, что из неё легло. */
export function pickupItems(
  snap: Pick<PickupSnap, "chest" | "guard" | "net">,
  o: { last: boolean; foreign?: boolean; chestBagged?: boolean },
): JournalItem[] {
  const out: JournalItem[] = [];
  if (snap.chest) {
    const c = snap.chest;
    out.push({
      stackKey: `custom:${c.itemId}`,
      kind: "custom",
      refId: c.itemId,
      name: c.name,
      image: c.image,
      count: 1,
      chest: true,
      ...(o.chestBagged ? { bagged: true } : {}),
    });
  }
  // Охрана достаётся только хозяину; чужой снимает сундук без живой охраны.
  if (snap.guard && !o.foreign) {
    const g = snap.guard;
    out.push({
      stackKey: `boss:${g.tpl}`,
      kind: "boss",
      refId: g.tpl,
      name: g.name,
      image: g.image,
      count: 1,
      guard: true,
      ...(g.whole ? {} : { wounded: true }),
    });
  }
  if (o.last) {
    for (const n of snap.net) {
      out.push({
        stackKey: n.stackKey,
        kind: n.kind,
        refId: n.refId,
        name: n.name,
        image: n.image,
        count: n.count,
      });
    }
  }
  return out;
}

/** Товары сети из журнала — без меток сундука и охраны. */
export const netOfJournal = (items: readonly JournalItem[]): ChestSlot[] =>
  items
    .filter((it) => !it.chest && !it.guard)
    .map(({ stackKey, kind, name, image, count }) => ({
      stackKey,
      kind,
      name,
      image: image ?? null,
      count: num(count),
    }));

/** Что не легло в рюкзак — то же точное вычитание, что у плана (девять знаков). */
function restOf(net: readonly ChestSlot[], taken: readonly LootPick[]): LootPick[] {
  const got = new Map<string, number>();
  for (const t of taken) got.set(t.stackKey, exactQty((got.get(t.stackKey) ?? 0) + t.qty));
  return net
    .map((n) => ({ stackKey: n.stackKey, qty: exactQty(n.count - (got.get(n.stackKey) ?? 0)) }))
    .filter((p) => p.qty > 0);
}

/** Итог нажатия из журнала, чей был сундук и позиции журнала — для журнала сделок повтора. */
export type PickupDone = { result: ChestPickupResult; owner: string; items: PlunderItem[] };

/**
 * Итог прошлого нажатия с тем же ключом (повтор после коммита): сундука уже
 * нет, отвечаем тем, что тогда легло и что упало мешочком (не влезшее больше
 * не пропадает — всё, что не легло, лежит в мешочке). null — нажатия не было.
 */
export async function pickupDone(account: string, op: string): Promise<PickupDone | null> {
  const rows = (await mcpExec(pickupDoneSql(account, op), { wrapJson: true })) as Array<{
    items: PlunderItem[] | string | null;
    taken: unknown;
    owner_account: string | null;
  }>;
  const row = rows?.[0];
  if (!row) return null;
  const items: JournalItem[] = plunderItems(row.items);
  const taken = (jsonList(row.taken) as Array<Partial<LootPick>>)
    .map((t) => ({ stackKey: String(t.stackKey ?? ""), qty: num(t.qty) }))
    .filter((t) => t.stackKey !== "" && t.qty > 0);
  return {
    result: {
      guard: items.some((it) => it.guard === true && it.wounded !== true),
      taken,
      bagged: restOf(netOfJournal(items), taken),
      lost: [],
      chestBagged: items.some((it) => it.chest === true && it.bagged === true),
    },
    owner: String(row.owner_account ?? account),
    items,
  };
}
