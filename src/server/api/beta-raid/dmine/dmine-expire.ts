// Конец жизни гриба любого вида (владелец, 22.10.2026: «живёт неделю … после недели
// исчезает»; lib/daraiMine, lib/mushroomKinds) — шаг минутного обхода (dmine-sweep):
//
//  • свёртка прежних стопок dmine:<id> в одну dmine:darai (raid_mushroom_fold:
//    окно между миграцией mushroom-01 и выкатом кода);
//  • гриб в рюкзаке — просто уходит: минус штука из стопки
//    (raid_mushroom_expire_item);
//  • гриб на карте — целые часы до конца жизни хозяину строкой «Отбитых шахт»
//    к «Забрать», не на счёт (maxHours клетки не даст больше; minecap-01;
//    тост и письмо — mine-lost-notify), клетка пуста (raid_mushroom_expire_cell), и все видят это
//    сразу: дельта клетки в журнал карты, «built» с owner — «Добыча» и флажки
//    хозяина перечитываются без F5.
// Обе функции базы под локами перепроверяют срок: повтор и второй процесс
// сервера — no-op (NULL / false), второй рассылки нет.
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { sqlStr } from "@/server/api/raid-shared";
import { mushroomCellSql } from "@/server/api/beta-raid/dmine/dmine-cell-sql";

/** Истёкших за проход; больше — следующим. */
const BATCH = 50;

export const foldSql = (): string => `SELECT yuplink.raid_mushroom_fold() AS n`;

/** Грибы в рюкзаках, чья жизнь кончилась. */
export const deadItemsSql = (): string =>
  `SELECT d.id FROM yuplink.raid_dmine d
    WHERE d.state = 'item' AND d.dies_at <= now()
    ORDER BY d.dies_at
    LIMIT ${BATCH}`;

export const expireItemSql = (id: string): string =>
  `SELECT yuplink.raid_mushroom_expire_item(${sqlStr(id)}) AS gone`;

/**
 * Грибы на карте, чья жизнь кончилась (частичный индекс raid_map_cells_mushroom).
 * Только гриб любого вида (raid_mushroom_kind — как в raid_mushroom_expire_cell):
 * клетку, которую админ перенастроил, функция базы всё равно не снимет — без
 * фильтра она занимала бы место в каждом проходе.
 */
export const deadCellsSql = (): string =>
  `SELECT c.map_id, c.q, c.r FROM yuplink.raid_map_cells c
    WHERE c.building_config ? 'diesAt' AND c.building_id IS NOT NULL
      AND ${mushroomCellSql("c")}
      AND (c.building_config->>'diesAt')::timestamptz <= now()
    LIMIT ${BATCH}`;

export const expireCellSql = (mapId: string, q: number, r: number): string =>
  `SELECT yuplink.raid_mushroom_expire_cell(${sqlStr(mapId)}, ${Math.floor(q)}, ${Math.floor(r)}) AS res`;

/** Итог снятия с клетки: кому начислено и был ли блок; null — снимать было нечего. */
export type ExpireRes = { owner: string | null; paid: number; block: boolean };

/** Ответ функции базы (jsonb объектом или строкой) → итог; NULL — null. */
export function expireResOf(rows: unknown): ExpireRes | null {
  const row = Array.isArray(rows) ? (rows[0] as { res?: unknown } | undefined) : undefined;
  let res = row?.res;
  if (typeof res === "string") {
    try {
      res = JSON.parse(res);
    } catch {
      return null;
    }
  }
  if (!res || typeof res !== "object") return null;
  const o = res as { owner?: unknown; paid?: unknown; block?: unknown };
  return {
    owner: typeof o.owner === "string" ? o.owner : null,
    paid: Number(o.paid) || 0,
    block: o.block === true,
  };
}

/** Снять истёкший гриб с клетки и разослать. true — снят этим вызовом. */
export async function expireCell(mapId: string, q: number, r: number): Promise<boolean> {
  const res = expireResOf(await mcpExec(expireCellSql(mapId, q, r), { wrapJson: true }));
  if (!res) return false;
  const { recordMapChange } = await import("@/server/api/beta-raid/map-journal");
  // Блок (если вдруг остался) — стена второй клетки у клиента из снимка: целиком.
  if (res.block) await recordMapChange(mapId, { full: true });
  else {
    await recordMapChange(mapId, {
      patches: [{ q, r, buildingId: null, buildingSkinId: null, buildingConfig: null }],
    });
  }
  publishRaid({ mapId, type: "built", mine: true, owner: true, cells: [`${q},${r}`] });
  return true;
}

/** Один шаг обхода: свёртка, рюкзаки, карта. Отдаёт, сколько грибов исчезло. */
export async function expireMushrooms(): Promise<number> {
  await mcpExec(foldSql(), { wrapJson: true }).catch((e: unknown) =>
    console.warn("[dmine] свёртка стопок:", e instanceof Error ? e.message : e),
  );
  let gone = 0;
  const items = ((await mcpExec(deadItemsSql(), { wrapJson: true })) ?? []) as Array<{
    id: string;
  }>;
  for (const it of items) {
    const rows = (await mcpExec(expireItemSql(it.id), { wrapJson: true }).catch(
      () => [],
    )) as Array<{ gone?: boolean }> | null;
    if (rows?.[0]?.gone === true) gone += 1;
  }
  const cells = ((await mcpExec(deadCellsSql(), { wrapJson: true })) ?? []) as Array<{
    map_id: string;
    q: number | string;
    r: number | string;
  }>;
  for (const c of cells) {
    try {
      if (await expireCell(String(c.map_id), Number(c.q), Number(c.r))) gone += 1;
    } catch (e) {
      console.warn("[dmine] гриб не снят:", c, e instanceof Error ? e.message : e);
    }
  }
  return gone;
}
