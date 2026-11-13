// «Поставить постройку» из рюкзака (lib/buildingSale): только в мире строителей,
// в радиусе 3 от героя, на пустую сушу. Постройка встаёт с обликом и настройкой
// чертежа — ровно как поставленная админом с той же настройкой. Проверки,
// постройка, минус штука и ключ нажатия — один оператор (bsale-place-sql).
//
// До записи — поведение чертежа ещё можно продавать (правило могли ужесточить
// после покупки; шаблон могли удалить). После — реестр города и дельта клетки
// (постройка, облик, эффект, тир) всем, кто смотрит этот мир, — как у постановки
// шахты, без полной перекачки карты. Повтор нажатия вторую постройку не ставит.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import {
  BUILDING_PLACE_RADIUS,
  SALE_BANNED_EFFECTS,
  blueprintOfStack,
  placeDist,
} from "@/lib/buildingSale";
import { cellBuildingEffect } from "@/lib/buildingEffect";
import { playerCell } from "@/server/api/beta-raid/encounter-where";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import { isBuilderWorld } from "@/server/api/beta-raid/land/builder-world";
import { buildingPlaceVerdict, placeBuildingSql, type BuildingPlaceRow } from "./bsale-place-sql";

const input = z.object({
  stackKey: z.string().min(1).max(200),
  q: z.number().int(),
  r: z.number().int(),
  /** Ключ нажатия: повтор того же нажатия вторую постройку не ставит. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

export type BuildingPlaced = { ok: true; q: number; r: number };

type Placed = {
  mapId: string;
  q: number;
  r: number;
  building: string;
  skin: string | null;
  config: Record<string, unknown> | null;
  tier: number;
};

/** Ключ нажатия уже исполнен — что и где встало (по клетке). Ошибку чтения не глотаем. */
async function loadOp(op: string): Promise<Placed | null> {
  const rows = (await mcpExec(
    `SELECT o.map_id, o.q, o.r, c.building_id, c.building_skin_id, c.building_config,
            COALESCE(st.tier, 0) AS tier
       FROM yuplink.raid_building_place_op o
       LEFT JOIN yuplink.raid_map_cells c ON c.map_id = o.map_id AND c.q = o.q AND c.r = o.r
       LEFT JOIN yuplink.beta_raid_building_state st
         ON st.map_id = o.map_id AND st.q = o.q AND st.r = o.r
      WHERE o.op = ${sqlStr(op)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<Record<string, unknown>> | null;
  const row = rows?.[0];
  if (!row) return null;
  return {
    mapId: String(row.map_id),
    q: Number(row.q),
    r: Number(row.r),
    building: typeof row.building_id === "string" ? row.building_id : "",
    skin: typeof row.building_skin_id === "string" ? row.building_skin_id : null,
    config: (row.building_config as Record<string, unknown> | null) ?? null,
    tier: Number(row.tier) || 0,
  };
}

/** Чертёж ещё можно ставить: шаблон жив, поведение не из запрещённых. */
async function assertPlaceable(blueprintId: string): Promise<void> {
  const rows = (await mcpExec(
    `SELECT p.building_config, t.meta, t.name FROM yuplink.raid_building_blueprint p
       JOIN yuplink.mystic_item_template t ON t.id = p.building_id AND t.kind = 'building'
      WHERE p.id = ${sqlStr(blueprintId)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ building_config: unknown; meta: unknown; name: string | null }> | null;
  const row = rows?.[0];
  if (!row) throw new Error("bsale.banned");
  const effect = cellBuildingEffect(row.building_config, row.meta, row.name);
  if (effect && SALE_BANNED_EFFECTS.includes(effect)) throw new Error("bsale.banned");
}

/**
 * Реестр города и дельта клетки. Каждый шаг — своим try: сбой реестра не должен
 * оставить игроков без постройки на карте. Сбой рассылки постройку не отменяет.
 */
async function announce(p: Placed): Promise<void> {
  if (!p.building) return;
  try {
    const { ensureTownSchema, handleBuildingChange } = await import("../town-resolve");
    await ensureTownSchema();
    await handleBuildingChange(p.mapId, p.q, p.r, null, p.building);
  } catch (e) {
    console.warn("[bsale-place] реестр города:", e instanceof Error ? e.message : e);
  }
  try {
    const { purgeMapBase } = await import("../map-base");
    purgeMapBase(p.mapId);
    // Новый склад сразу принимает урожай (кэш складов карты — 30 с).
    (await import("../warehouse-map-cells")).forgetWarehouseCells(p.mapId);
    const { deltaBuildingConfig } = await import("../delta-building-config");
    const { noteAdminPatches } = await import("../map-change-hooks");
    const patch = {
      q: p.q,
      r: p.r,
      buildingId: p.building,
      buildingSkinId: p.skin,
      buildingConfig: deltaBuildingConfig(p.config),
      tier: p.tier,
    };
    // edit_seq поднял сам оператор установки — второй раз не нужно.
    await noteAdminPatches(p.mapId, [patch], { edit: false });
  } catch (e) {
    console.warn("[bsale-place] рассылка не прошла:", e instanceof Error ? e.message : e);
  }
}

export const placeBuilding = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<BuildingPlaced> => {
    const blueprintId = blueprintOfStack(data.stackKey);
    if (!blueprintId) throw new Error("bsale.no_item");
    const a = await pchestActor("bsale-place");
    // Только в мире, где игроки строят сами (владелец: «только в том мире»).
    if (!(await isBuilderWorld(a.mapId))) throw new Error("bsale.not_builder_world");
    const op = `bsale:${a.account}:${data.op}`;
    const prev = await loadOp(op);
    if (prev) return { ok: true, q: prev.q, r: prev.r };
    await assertPlaceable(blueprintId);

    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");
    const pos = await playerCell(a.wallet);
    const { q, r } = data;
    // Здесь — только дальность; клетку судит оператор под локами.
    if (placeDist(pos, { q, r }) > BUILDING_PLACE_RADIUS) throw new Error("bsale.far");

    const sql = placeBuildingSql({
      mapId: a.mapId,
      q,
      r,
      account: a.account,
      heroId: bp.heroId,
      blueprintId,
      op,
    });
    let row: BuildingPlaceRow | null = null;
    let failed: unknown = null;
    try {
      row = sqlRow<BuildingPlaceRow>((await mcpExec(sql)) as unknown[]) ?? null;
    } catch (e) {
      failed = e;
    }
    if (row?.placed && !row.was && typeof row.building === "string") {
      await announce({
        mapId: a.mapId,
        q,
        r,
        building: row.building,
        skin: typeof row.skin === "string" ? row.skin : null,
        config: (row.config as Record<string, unknown> | null) ?? null,
        tier: Number(row.tier) || 0,
      });
      return { ok: true, q, r };
    }
    // Повтор, пустой ответ или обрыв после коммита — судит ключ нажатия.
    const again = await loadOp(op).catch(() => null);
    if (again) {
      await announce(again);
      return { ok: true, q: again.q, r: again.r };
    }
    if (failed) throw failed;
    const verdict = buildingPlaceVerdict(row);
    if (verdict !== "ok") throw new Error(verdict);
    return { ok: true, q, r };
  });
