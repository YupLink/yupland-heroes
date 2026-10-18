// Купол снят с клетки — игроку нужна вся клетка, а не только «купола нет».
//
// Пока клетка была под глухим туманом, снимок отдавал её игрокам пустой
// (voidSanitize): ни местности, ни дороги, ни объекта. Патч «voidFog: false»
// сам по себе оставил бы у игрока пустую клетку до перекачки карты. Поэтому
// к такому патчу дописываем содержимое клетки из базы — слои и правду об
// объекте тем же правилом, что и у боя (cellTruthPatches).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { cellTruthPatches } from "./map-change-hooks";
import type { CellPatch } from "@/lib/raid/mapDelta";
import { clampIconScale } from "@/lib/mergeScale";

type CellRow = {
  q: number;
  r: number;
  terrain_id: string | null;
  road_id: string | null;
  decoration_id: string | null;
  building_id: string | null;
  building_skin_id: string | null;
  group_id: string | null;
  icon_scale: number | string | null;
};

/** Патчи со снятым куполом дополнить содержимым клетки; остальные — как есть. */
export async function fillLifted(mapId: string, patches: CellPatch[]): Promise<CellPatch[]> {
  const lifted = patches.filter((p) => p.voidFog === false);
  if (lifted.length === 0) return patches;
  const list = lifted.map((p) => `(${Math.floor(p.q)},${Math.floor(p.r)})`).join(",");
  // Декор — только с живым шаблоном: снимок игроку мёртвую ссылку не отдаёт
  // (map-assemble ← dead-decor), и дельта снятого купола не должна её
  // протаскивать обратно — вернулась бы зелёная точка-стена.
  const rows = (await mcpExec(
    `SELECT c.q, c.r, c.terrain_id, c.road_id,
            CASE WHEN EXISTS (SELECT 1 FROM yuplink.mystic_item_template dk
                               WHERE dk.id = c.decoration_id)
                 THEN c.decoration_id END AS decoration_id,
            c.building_id, c.building_skin_id, c.group_id, c.icon_scale
       FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(mapId)} AND (c.q, c.r) IN (${list});`,
    { wrapJson: true },
  )) as CellRow[] | null;
  const truth = await cellTruthPatches(
    mapId,
    lifted.map((p) => `${p.q},${p.r}`),
  );
  const byKey = new Map<string, CellPatch>();
  for (const row of rows ?? []) {
    byKey.set(`${row.q},${row.r}`, {
      q: Number(row.q),
      r: Number(row.r),
      terrainId: row.terrain_id,
      roadId: row.road_id,
      decorationId: row.decoration_id,
      buildingId: row.building_id,
      buildingSkinId: row.building_skin_id,
      // Снятый купол возвращает игроку и блок: без этого член блока рисовался
      // бы одиночкой до перекачки карты.
      groupId: row.group_id ?? null,
      iconScale: row.group_id ? clampIconScale(Number(row.icon_scale ?? 1)) : null,
    });
  }
  for (const t of truth) {
    const k = `${t.q},${t.r}`;
    byKey.set(k, { ...(byKey.get(k) ?? { q: t.q, r: t.r }), ...t });
  }
  return patches.map((p) => {
    if (p.voidFog !== false) return p;
    const full = byKey.get(`${p.q},${p.r}`);
    // Содержимое из базы — основа, сам патч (что админ только что поставил)
    // — поверх: он новее.
    return full ? { ...full, ...p } : p;
  });
}
