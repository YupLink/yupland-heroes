// Рассылка клетки после «Забрать» / «Разместить» DARAI-шахты — надёжно, как у
// постановки шахт v2 (mine-place-announce): дельта уходит через
// recordMapChange (версия карты, журнал, событие 'map'); не записалась — ключ
// нажатия остаётся без sent_at, и клетку дошлёт повтор нажатия или минутный
// цикл (dmine-sweep). Записалась — ключ отмечен.
//
// Дельта повторяет клетку как она есть СЕЙЧАС и только если на ней всё ещё
// наше: после «Забрать» — пустая (кто-то уже поставил своё — та правка
// разослала себя сама), после «Разместить» — та самая постройка. Отметка
// шахты едет в настройках клетки ({ effect: 'mine' }): стену клиент помечает
// и без словаря (packedMines). Словарь шаблона и облика читаем ДО сдвига
// версии: без записи шаблона постройка у клиента не нарисуется.
// Забрали шахту-блок (minebag-02: блок распущен) — дельтой не обойтись: стена
// второй клетки блока у клиента — из снимка (mine-block-sync), поэтому «карта
// перестроена» целиком.
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { sqlStr } from "@/server/api/raid-shared";
import { parseTiers } from "@/server/api/beta-raid/buildings";
import { buildingEffect } from "@/lib/buildingEffect";
import { skinDisplayName } from "@/lib/skinName";
import type { CellPatch, MapDeltaAssets } from "@/lib/raid/mapDelta";

/** Ключ нажатия с клеткой как она есть. */
export type DmineOpRow = {
  op: string;
  kind: string;
  map_id: string;
  q: number | string;
  r: number | string;
  dmine_id: string;
  paid: number | string | null;
  sent: boolean | null;
  /** Постройка клетки сейчас. */
  building_id: string | null;
  building_skin_id: string | null;
  /** Постройка забранной шахты (что ставили). */
  dmine_building: string | null;
  /** Забранная шахта стояла блоком клеток (raid_dmine.block). */
  block?: boolean | null;
};

const OP_ROW = `SELECT o.op, o.kind, o.map_id, o.q, o.r, o.dmine_id, o.paid,
            o.sent_at IS NOT NULL AS sent, c.building_id, c.building_skin_id,
            d.building_id AS dmine_building, d.block IS NOT NULL AS block
       FROM yuplink.raid_dmine_op o
       LEFT JOIN yuplink.raid_map_cells c ON c.map_id = o.map_id AND c.q = o.q AND c.r = o.r
       LEFT JOIN yuplink.raid_dmine d ON d.id = o.dmine_id`;

/** Сколько ждать досылки: свежее рассылает сама ручка. */
export const DMINE_RESEND_AFTER_SEC = 30;

/** Ключ нажатия — свежим отдельным чтением (ключ лёг только вместе с делом). */
export const dmineOpSql = (op: string): string =>
  `${OP_ROW}
      WHERE o.op = ${sqlStr(op)} LIMIT 1;`;

/** Неразосланные старше DMINE_RESEND_AFTER_SEC — старые первыми. */
export const dmineUnsentSql = (): string =>
  `${OP_ROW}
      WHERE o.sent_at IS NULL AND o.at < now() - interval '${DMINE_RESEND_AFTER_SEC} seconds'
      ORDER BY o.at
      LIMIT 100;`;

export const dmineSentSql = (op: string): string =>
  `UPDATE yuplink.raid_dmine_op SET sent_at = now()
    WHERE op = ${sqlStr(op)} AND sent_at IS NULL;`;

/** Ключи старше двух суток (повтор моста живёт секунды). */
export const dmineOpSweepSql = (): string =>
  `DELETE FROM yuplink.raid_dmine_op WHERE at < now() - interval '2 days' AND sent_at IS NOT NULL;`;

/** Ключ нажатия или null — нажатия не было. Ошибку чтения не глотаем. */
export async function loadDmineOp(op: string): Promise<DmineOpRow | null> {
  const rows = (await mcpExec(dmineOpSql(op), { wrapJson: true })) as DmineOpRow[] | null;
  return rows?.[0] ?? null;
}

/** На клетке всё ещё наше: после «Забрать» — пусто, после «Разместить» — та постройка. */
export function stillOurs(row: DmineOpRow): boolean {
  if (row.kind === "take") return !row.building_id;
  return !!row.building_id && row.building_id === row.dmine_building;
}

/** Дельта клетки: снятая постройка или вставшая шахта. */
export function dminePatch(row: DmineOpRow): CellPatch {
  const [q, r] = [Number(row.q), Number(row.r)];
  if (row.kind === "take" || !row.building_id) {
    return { q, r, buildingId: null, buildingSkinId: null, buildingConfig: null };
  }
  return {
    q,
    r,
    buildingId: row.building_id,
    buildingSkinId: row.building_skin_id ?? null,
    buildingConfig: { effect: "mine" },
  };
}

/** Словарь шаблона (и облика) для клиентов, у которых записи ещё нет. */
export async function dmineAssets(
  buildingId: string,
  skinId: string | null,
): Promise<MapDeltaAssets> {
  const rows = (await mcpExec(
    `SELECT id, name, meta FROM yuplink.mystic_item_template
      WHERE id = ${sqlStr(buildingId)} AND kind = 'building' LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ id: string; name: string; meta: unknown }> | null;
  const t = rows?.[0];
  if (!t) throw new Error(`словарь шахты не прочитан: ${buildingId}`);
  const tiers = parseTiers(t.meta);
  const buildings: Record<string, unknown> = {
    [t.id]: { id: t.id, name: t.name, tiers, effect: buildingEffect(t.meta, t.name) },
  };
  if (skinId) {
    const { skinsByIds, skinKey } = await import("@/server/api/beta-raid/building-skins");
    const skin = (await skinsByIds([skinId]))[0];
    if (skin) {
      buildings[skinKey(skin.id)] = {
        id: skinKey(skin.id),
        name: skinDisplayName(skin.name, t.name),
        tiers: tiers.map((x) => ({ ...x, imageUrl: skin.image })),
        effect: buildingEffect(t.meta, t.name),
      };
    }
  }
  return { buildings };
}

/**
 * Разослать клетку нажатия и отметить ключ. true — дельта записана (или не
 * нужна) и ключ отмечен; false — дошлём позже.
 */
export async function announceDmine(row: DmineOpRow): Promise<boolean> {
  const here = stillOurs(row);
  const mapId = String(row.map_id);
  const patch = dminePatch(row);
  let ok = true;
  try {
    if (here) {
      const assets = patch.buildingId
        ? await dmineAssets(patch.buildingId, patch.buildingSkinId ?? null)
        : undefined;
      const { recordMapChange } = await import("@/server/api/beta-raid/map-journal");
      // edit_seq поднял сам оператор — второй раз не нужно.
      if (row.kind === "take" && row.block) await recordMapChange(mapId, { full: true });
      else await recordMapChange(mapId, { patches: [patch] }, async () => assets);
    }
    await mcpExec(dmineSentSql(row.op));
  } catch (e) {
    ok = false;
    console.warn("[dmine] рассылка не прошла:", e instanceof Error ? e.message : e);
  }
  if (here) {
    const { withoutVoid } = await import("@/server/api/beta-raid/voidCells");
    const cells = await withoutVoid(mapId, [`${patch.q},${patch.r}`]).catch(() => [] as string[]);
    publishRaid({ mapId, type: "built", mine: true, owner: true, cells });
  }
  return ok;
}
