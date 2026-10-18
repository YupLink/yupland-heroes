// Чтение мешочков для карты и окна (ПРАВИЛА §8.21).
//
// Мешочек и бугорок видно во «втором обзоре» (владелец, 29.09): в круге
// активной зоны тумана вокруг героя (FOG_ACTIVE_RADIUS = 20) на разведанных
// клетках не под куполом; дальше, в тёмном тумане, — нет. Фильтр — здесь, на
// сервере, от позиции героя в базе, а не от того, что прислал клиент; админу
// видно всё в круге, как и остальная карта. Клиент перечитывает слой после
// своих шагов и по событию 'bags' — запрос дешёвый: один оператор, позиция по
// ключу, диапазон клеток по индексу мешочков, разведанное — по ключу тумана.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import type { LootBagCellView, LootBagSpot } from "@/lib/lootBag";
import type { DigHoleSpot } from "@/lib/digHole";
import { BAG_OPEN_PRICE } from "@/lib/openPass";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { raidOwner } from "@/server/api/beta-raid/owner";
import { activeBetaMapId } from "@/server/api/beta-raid/encounter-where";
import { canIgnoreVoid } from "@/server/api/beta-raid/voidGate";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { bagActor, blockedAt, requireBagNear } from "@/server/api/beta-raid/loot-bag/bag-actor";
import { cellSql, nearSql } from "@/server/api/beta-raid/loot-bag/bag-read-sql";
import { findShovel } from "@/server/api/beta-raid/loot-bag/bag-shovel";
import { holesNearSql, myMoundsSql } from "@/server/api/beta-raid/main-tool/dig-hole";

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Дополнение слоя: сбой — и запроса, и его сборки — мешочки не роняет. */
const extra = (sql: () => string): Promise<unknown[]> =>
  Promise.resolve()
    .then(() => mcpExec(sql(), { wrapJson: true }) as Promise<unknown[]>)
    .catch(() => []);

type SpotRow = { id: string; q: unknown; r: unknown; buried: boolean; leftMs: unknown };

const spotOf = (b: SpotRow, mine: boolean): LootBagSpot => ({
  id: String(b.id),
  q: num(b.q),
  r: num(b.r),
  buried: b.buried === true,
  leftMs: num(b.leftMs),
  ...(mine ? { mine: true } : {}),
});

/**
 * Мешочки и бугорки во «втором обзоре» героя, плюс (02.10) мои бугорки с
 * любого расстояния и ямки от лопаты в том же круге. Героя на карте нет —
 * пусто. Мои бугорки и ямки — дополнение: их сбой слой не роняет.
 */
export const getLootBagsNear = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ bags: LootBagSpot[]; holes: DigHoleSpot[] }> => {
    const wallet = await requireBetaRaid();
    // Аккаунт и активная карта — из кэшей процесса; к базе — три запроса разом.
    const [account, activeMapId] = await Promise.all([raidOwner(wallet), activeBetaMapId()]);
    const near = { account, activeMapId, admin: canIgnoreVoid(wallet) };
    const [rows, mineRows, holeRows] = (await Promise.all([
      mcpExec(nearSql(near), { wrapJson: true }),
      extra(() => myMoundsSql(near)),
      extra(() => holesNearSql(near)),
    ])) as [SpotRow[], SpotRow[], Array<{ q: unknown; r: unknown; leftMs: unknown }>];
    const mine = new Set((mineRows ?? []).map((b) => String(b.id)));
    const bags = (rows ?? []).map((b) => spotOf(b, mine.has(String(b.id))));
    const seen = new Set(bags.map((b) => b.id));
    for (const b of mineRows ?? []) if (!seen.has(String(b.id))) bags.push(spotOf(b, true));
    return {
      bags,
      holes: (holeRows ?? []).map((h) => ({ q: num(h.q), r: num(h.r), leftMs: num(h.leftMs) })),
    };
  },
);

type CellRow = {
  id: string;
  buried: boolean;
  /** Мой вход в мешочек жив (§8.23): только тогда в items есть содержимое. */
  open?: boolean | null;
  leftMs: unknown;
  items: Array<{
    stackKey: string;
    kind: string;
    refId: string | null;
    name: string;
    image: string | null;
    count: unknown;
    leftMs: unknown;
  }> | null;
};

/**
 * Окно клетки: мешочки и бугорки на ней (герой вплотную) и есть ли у героя
 * лопата — без неё «Закопать»/«Выкопать» неактивны.
 */
export const getLootBagsAt = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d))
  .handler(async ({ data }): Promise<LootBagCellView> => {
    const a = await bagActor(null);
    await requireBagNear(a, data.q, data.r);
    // Декор вырос поверх (дополнение №5) — мешочков и бугорков не видно, пока не срубят.
    if ((await blockedAt(a.mapId, data.q, data.r)) === "bag.decor") throw new Error("bag.decor");
    const [rows, shovel] = await Promise.all([
      mcpExec(cellSql({ mapId: a.mapId, q: data.q, r: data.r, account: a.account }), {
        wrapJson: true,
      }) as Promise<
        CellRow[]
      >,
      resolveBackpack(a.wallet)
        .then((bp) => (bp ? findShovel(bp.heroId) : null))
        .catch(() => null),
    ]);
    return {
      q: data.q,
      r: data.r,
      shovel: !!shovel,
      bags: (rows ?? []).map((b) => ({
        id: String(b.id),
        buried: b.buried === true,
        open: b.open === true,
        price: BAG_OPEN_PRICE,
        leftMs: num(b.leftMs),
        items: (Array.isArray(b.items) ? b.items : []).map((i) => ({
          stackKey: String(i.stackKey),
          kind: String(i.kind),
          refId: i.refId ?? null,
          name: String(i.name ?? ""),
          image: i.image ?? null,
          count: num(i.count),
          leftMs: num(i.leftMs),
        })),
      })),
    };
  });
