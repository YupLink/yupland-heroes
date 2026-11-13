// Оплата сданных героев ломбарда: снимки закрыты (paid_at), рюкзаки и надетые
// артефакты высыпаны мешочком на клетку основного героя — одной транзакцией
// (владелец, 23.10.2026; ПРАВИЛА §8.73 п. 4). Ответ — для окна уведомления: что и
// куда упало; arts — надетые, что остались в инвентаре (надеты на другого героя).
//
// Клетка — где стоит основной герой; не на карте — клетка лавки. Мешочек живой
// незакопанный на клетке доливается, иначе новый 'lb_'||md5('pawnbag:'||ключ).
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { ownCell } from "@/server/api/beta-raid/encounter-where";
import { bagAtCellSql } from "@/server/api/beta-raid/loot-bag/bag-discard-sql";
import { noteBagPut } from "@/server/api/beta-raid/loot-bag/bag-note";
import { markPaidSql } from "./hero-pawn-sql";
import { pawnDropSql, pawnSnapsSql, type PawnDropRow } from "./hero-pawn-drop-sql";
import type { PawnHeroRef } from "./hero-any";
import type { PawnDrop } from "@/lib/pawnDrop";

/** Сколько артефактов было надето (equipped: слот → id предмета). */
export function equippedCount(eq: unknown): number {
  if (!eq || typeof eq !== "object" || Array.isArray(eq)) return 0;
  return Object.values(eq as Record<string, unknown>).filter((v) => typeof v === "string" && v)
    .length;
}

/** Строки ответа: мост отдаёт `_row` то объектом, то строкой JSON. */
function rowsOf(raw: unknown): PawnDropRow[] {
  const out: PawnDropRow[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const inner = r && typeof r === "object" && "_row" in r ? (r as { _row: unknown })._row : r;
    const v = typeof inner === "string" ? (JSON.parse(inner) as unknown) : inner;
    if (v && typeof v === "object" && "stack_key" in v) out.push(v as PawnDropRow);
  }
  return out;
}

export async function payPawnHeroes(o: {
  wallet: string;
  account: string;
  mapId: string;
  /** Клетка лавки — если основного героя на карте нет. */
  shop: { q: number; r: number };
  heroes: PawnHeroRef[];
}): Promise<PawnDrop | null> {
  const ops = [...new Set(o.heroes.map((h) => h.op))];
  if (!ops.length) return null;
  // Надетое — только для окна: сорвалось чтение — окно без строки про арты.
  const snaps = (await mcpExec(pawnSnapsSql(ops), { wrapJson: true }).catch(() => [])) as Array<{
    equipped: unknown;
  }>;
  const arts = (snaps ?? []).reduce((n, s) => n + equippedCount(s.equipped), 0);
  // Клетка основного героя: сбой чтения — ещё раз, не на карте — клетка лавки.
  const pos =
    (await ownCell(o.wallet)
      .catch(() => ownCell(o.wallet))
      .catch(() => null)) ?? o.shop;
  const found = (await mcpExec(`${bagAtCellSql(o.mapId, pos.q, pos.r)};`, {
    wrapJson: true,
  }).catch(() => null)) as Array<{ id: string }> | null;
  // Отметка «оплачено» и высыпание — одной транзакцией: сорвалось — ни того, ни другого.
  const key = `pawnbag:${ops[0]}`;
  const rows = rowsOf(
    await mcpExec(
      `${markPaidSql(ops)}\n${pawnDropSql({
        ops,
        account: o.account,
        mapId: o.mapId,
        ...pos,
        bagId: found?.[0]?.id ?? null,
        key,
      })}`,
    ),
  );
  if (rows.length) {
    publishRaid({ mapId: o.mapId, type: "bags", cells: [`${pos.q},${pos.r}`] });
    if (rows.some((r) => r.fresh)) {
      void import("@/server/api/beta-raid/loot-bag/bag-sweep").then((m) => m.startLootBagSweeper());
    }
    // Журнал сделок (§8.13): куда ушли вещи — как у «Выбросить».
    const actor = { wallet: o.wallet, mapId: o.mapId, account: o.account };
    for (const r of rows) {
      const stack = {
        stackKey: r.stack_key,
        kind: r.kind ?? "custom",
        refId: r.ref_id,
        name: r.name ?? r.stack_key,
        image: r.image,
      };
      void noteBagPut({ actor, bag: pos, stack, qty: Number(r.put) || 0, ref: `${key}:${r.stack_key}` });
    }
  }
  const items = rows.map((r) => ({
    name: r.name ?? r.stack_key,
    image: r.image ?? null,
    count: Number(r.put) || 0,
  }));
  // Надетые, что не легли в мешочек (уже надеты на другого героя), — остались в инвентаре.
  const left = Math.max(0, arts - rows.filter((r) => r.stack_key.startsWith("art:")).length);
  return items.length || left > 0 ? { ...pos, items, arts: left } : null;
}
