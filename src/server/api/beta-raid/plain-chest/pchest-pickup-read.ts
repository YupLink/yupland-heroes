// «Забрать сундук» (обычный): чтение снимка для плана, итог нажатия из ключа и
// рассылка после записи. Снимок — одним запросом (pchest-pickup-sql): план и
// отпечатки обязаны видеть одно и то же состояние рюкзака и сундука.
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import type { LootPick } from "@/lib/magicChest";
import type { PlainPickupResult } from "@/lib/plainChest";
import { noteTrades } from "@/server/api/beta-raid/econ/trade-journal";
import { stackItemKey } from "@/server/api/beta-raid/econ/trade-keys";
import { num, sqlRow, type ChestActor } from "@/server/api/beta-raid/chest/chest-row";
import type { PchestOp } from "@/server/api/beta-raid/plain-chest/pchest-row";
import type { PlainSnap, SnapSlot } from "@/server/api/beta-raid/plain-chest/pchest-pickup-plan";
import { pickupSnapSql } from "@/server/api/beta-raid/plain-chest/pchest-pickup-sql";
import { plainNotes } from "@/server/api/beta-raid/plain-chest/pchest-note";

type Raw = {
  chest:
    | (Omit<NonNullable<PlainSnap["chest"]>, "potion" | "buried"> & {
        potion: boolean | null;
        buried: boolean | null;
      })
    | null;
  bag: Array<{ stackKey: string; count: unknown; potion: boolean | null }> | null;
  slots: Array<
    Omit<SnapSlot, "count" | "potion"> & { count: unknown; potion: boolean | null }
  > | null;
  bag_fp: string | null;
  slot_fp: string | null;
};

const img = (v: string | null | undefined): string | null =>
  v && String(v).trim() !== "" ? String(v) : null;

/** jsonb из ответа: мост отдаёт его то значением, то строкой. */
function jsonOf(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Снимок для плана. Ошибку базы не глотаем: «не прочли» — не «пусто». */
export async function loadPlainSnap(o: {
  mapId: string;
  q: number;
  r: number;
  heroId: string;
}): Promise<PlainSnap> {
  const raw = sqlRow<Raw>((await mcpExec(pickupSnapSql(o))) as unknown[]);
  if (!raw) throw new Error("chest.busy");
  const c = raw.chest;
  return {
    chest: c
      ? {
          id: String(c.id),
          itemId: String(c.itemId),
          name: String(c.name ?? ""),
          image: img(c.image),
          potion: c.potion === true,
          buried: c.buried === true,
        }
      : null,
    bag: (raw.bag ?? []).map((b) => ({
      stackKey: b.stackKey,
      count: num(b.count),
      potion: b.potion === true,
    })),
    slots: (raw.slots ?? [])
      .map((s) => ({
        stackKey: s.stackKey,
        kind: s.kind,
        refId: s.refId ?? null,
        itemId: s.itemId ?? null,
        name: String(s.name ?? ""),
        image: img(s.image),
        count: num(s.count),
        potion: s.potion === true,
      }))
      .filter((s) => s.count > 0),
    bagFp: raw.bag_fp ?? "",
    slotFp: raw.slot_fp ?? "",
  };
}

const picksOf = (raw: unknown): LootPick[] =>
  (Array.isArray(raw) ? (raw as Array<Partial<LootPick>>) : [])
    .map((p) => ({ stackKey: String(p.stackKey ?? ""), qty: num(p.qty) }))
    .filter((p) => p.stackKey !== "" && p.qty > 0);

/** Итог прошлого нажатия из ключа (повтор после коммита) или null — не было. */
export function pickupResultOf(op: PchestOp | null): PlainPickupResult | null {
  if (!op || op.state !== "done") return null;
  const r = jsonOf(op.result) as { taken?: unknown; bagged?: unknown; bagId?: unknown } | null;
  if (!r || typeof r !== "object") return null;
  return {
    taken: picksOf(r.taken),
    bagged: picksOf(r.bagged),
    bagId: typeof r.bagId === "string" ? r.bagId : null,
  };
}

/**
 * После записи (и на повторе — ответ первого прогона мог потеряться до
 * рассылки): сундук исчез у всех (слой по 'built'), окно и бугорки рядом — по
 * 'bags', упал мешочек — сборщик мешочков в этом процессе. Журнал сделок —
 * по снимку (на повторе без снимка — без журнала: ключи его не задвоят, а
 * подписи товаров уже не прочесть).
 */
export function announcePickup(
  a: ChestActor,
  at: { q: number; r: number },
  op: string,
  res: PlainPickupResult,
  snap: PlainSnap | null,
): void {
  const cell = `${at.q},${at.r}`;
  publishRaid({ mapId: a.mapId, type: "built", cells: [cell] });
  publishRaid({ mapId: a.mapId, type: "bags", cells: [cell] });
  if (res.bagId) {
    void import("@/server/api/beta-raid/loot-bag/bag-sweep").then((m) => m.startLootBagSweeper());
  }
  if (!snap) return;
  const bySlot = new Map(snap.slots.map((s) => [s.stackKey, s]));
  const moves = (list: LootPick[], tag: string) =>
    list.flatMap((p, i) => {
      const s = bySlot.get(p.stackKey);
      return s ? [{ item: s, qty: p.qty, ref: `${op}:${tag}${i}` }] : [];
    });
  const notes = plainNotes(a, at, "take", moves(res.taken, "t"));
  // Остаток ушёл в мешочек — «положил в мешочек» (контрагент — кто поднимет).
  for (const m of moves(res.bagged, "b")) {
    notes.push({
      accountId: a.account,
      counterparty: null,
      mapId: a.mapId,
      q: at.q,
      r: at.r,
      source: "loot_bag",
      side: "put",
      itemKey: stackItemKey(m.item.stackKey, m.item.kind, m.item.refId, m.item.name),
      itemName: m.item.name,
      qty: m.qty,
      ref: m.ref,
    });
  }
  void noteTrades(notes);
}
