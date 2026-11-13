// Рассылка поставленной шахты — надёжно, как у возврата декора (decor-respawn).
//
// Дельта клетки уходит через recordMapChange (версия карты + журнал + сброс
// снимка + событие 'map'); он бросает, если версия не сдвинулась, — тогда
// ключ нажатия остаётся без sent_at, и шахту дошлёт повтор того же нажатия или
// минутный цикл (mine-place-resend). Запись прошла — ключ отмечен. Строка
// журнала, не легшая после сдвига версии, — дыра: клиент возьмёт снимок, в
// нём шахта уже есть. Повторная дельта той же клетки безвредна.
//
// Словарь шаблона читаем ДО recordMapChange: тот ошибку словаря глотает и
// шлёт дельту без него, а у клиента без записи шаблона (шахт этого вида на
// карте не было) постройка не рисуется. Не прочитался или пуст — бросаем,
// ключ ждёт досылки. Отметка шахты едет и в настройках клетки ({ effect }, как
// у кисти — delta-building-config): стену клиент помечает и без словаря.
//
// 'built' с owner — окна построек, охрана и флажки у всех: у соседа шахта
// сразу чужая (красный флажок), а не ничья до случайного перечитывания.
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { sqlStr } from "@/server/api/raid-shared";
import { parseTiers } from "@/server/api/beta-raid/buildings";
import { buildingEffect } from "@/lib/buildingEffect";
import {
  MINE_PLACE_BUILDING,
  PLACEABLE_BLUEPRINTS,
  type PlaceableBlueprint,
} from "@/lib/minePlacement";
import type { MapDeltaAssets } from "@/lib/raid/mapDelta";
import { placeSentSql, type PlaceOpRow } from "@/server/api/beta-raid/mine-place/mine-place-op-sql";

/** Постановка по ключу нажатия. here — шахта всё ещё стоит на клетке. */
export type PlacedOp = {
  op: string;
  mapId: string;
  q: number;
  r: number;
  kind: PlaceableBlueprint;
  here: boolean;
  sent: boolean;
};

const placeable = (kind: string): kind is PlaceableBlueprint =>
  (PLACEABLE_BLUEPRINTS as readonly string[]).includes(kind);

/** Строка ключа → постановка; вид не из ставящихся — null (чужая строка). */
export function placedOpOf(row: PlaceOpRow | null | undefined): PlacedOp | null {
  const kind = row?.kind;
  if (!row || !kind || !placeable(kind)) return null;
  return {
    op: String(row.op),
    mapId: String(row.map_id),
    q: Number(row.q),
    r: Number(row.r),
    kind,
    here: row.building_id === MINE_PLACE_BUILDING[kind],
    sent: row.sent === true,
  };
}

/**
 * Словарь шаблона шахты для клиентов, у которых его ещё нет (как у кисти
 * админа). Ошибка запроса — наружу; шаблона нет — тоже ошибка: без записи
 * словаря клиент постройку не нарисует.
 */
async function mineAssets(buildingId: string): Promise<MapDeltaAssets> {
  const rows = (await mcpExec(
    `SELECT id, name, meta FROM yuplink.mystic_item_template
      WHERE id = ${sqlStr(buildingId)} AND kind = 'building' LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ id: string; name: string; meta: unknown }> | null;
  const t = rows?.[0];
  if (!t) throw new Error(`словарь шахты не прочитан: ${buildingId}`);
  const entry = {
    id: t.id,
    name: t.name,
    tiers: parseTiers(t.meta),
    effect: buildingEffect(t.meta, t.name),
  };
  return { buildings: { [t.id]: entry } };
}

/** Настройки клетки шахты в дельте — только эффект, как у кисти (delta-building-config). */
const MINE_PATCH_CONFIG = { effect: "mine" } as const;

/** Дельта клетки шахты в журнал карты. Ошибка словаря или записи — наружу. */
export async function recordPlaced(p: Pick<PlacedOp, "mapId" | "q" | "r" | "kind">): Promise<void> {
  const { recordMapChange } = await import("@/server/api/beta-raid/map-journal");
  const buildingId = MINE_PLACE_BUILDING[p.kind];
  // До сдвига версии: сбой словаря оставит ключ неразосланным.
  const assets = await mineAssets(buildingId);
  const patch = {
    q: p.q,
    r: p.r,
    buildingId,
    buildingSkinId: null,
    buildingConfig: { ...MINE_PATCH_CONFIG },
  };
  // edit_seq поднял сам оператор постановки — второй раз не нужно.
  await recordMapChange(p.mapId, { patches: [patch] }, async () => assets);
}

/**
 * Разослать постановку и отметить ключ. Шахты на клетке уже нет (админ правил
 * клетку) — только отметка: та правка разослала клетку сама. true — дельта
 * записана (или не нужна) и ключ отмечен; false — дошлём позже.
 */
export async function announcePlaced(p: Omit<PlacedOp, "sent">): Promise<boolean> {
  let ok = true;
  try {
    if (p.here) await recordPlaced(p);
    await mcpExec(placeSentSql(p.op));
  } catch (e) {
    ok = false;
    console.warn("[mine-place] рассылка не прошла:", e instanceof Error ? e.message : e);
  }
  if (p.here) {
    const { withoutVoid } = await import("@/server/api/beta-raid/voidCells");
    const cells = await withoutVoid(p.mapId, [`${p.q},${p.r}`]).catch(() => [] as string[]);
    publishRaid({ mapId: p.mapId, type: "built", mine: true, owner: true, cells });
  }
  return ok;
}
