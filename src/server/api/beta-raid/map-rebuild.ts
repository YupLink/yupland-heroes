// Кнопка «Перестроить карту»: сбросить снимок и прогреть его заново.
//
// Обычно этого не требуется — снимок сам сбрасывается на правках и живёт
// секунды. Но когда карту меняли мимо игры (правка в базе, восстановление
// руками, странный кэш после долгого простоя), полезно иметь одну кнопку,
// после которой все видят свежее.
//
// Заодно чистим осиротевшее: строки HP объектов, которых на карте уже нет —
// они копятся от снятых кистью объектов и попадают в каждый снимок.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireAdmin } from "../../auth";
import { dropMapBase, mapBase } from "./map-base";
import { publishRaid } from "../../raidLive";
import { requireGodAdmin } from "@/server/api/beta-raid/island/island-editor-auth";

export const adminRebuildMap = createServerFn({ method: "POST" }).handler(async () => {
  const { mapId } = await requireGodAdmin();

  // Сироты HP: объект с клетки убрали, а строка здоровья осталась. На саму
  // игру не влияет, но растёт и утяжеляет каждый снимок карты.
  const orphans = (await mcpExec(
    `DELETE FROM yuplink.beta_raid_object_hp h
      WHERE h.map_id = ${sqlStr(mapId)}
        AND h.cycle_no = 0
        AND NOT EXISTS (
          SELECT 1 FROM yuplink.raid_map_cells c
           WHERE c.map_id = h.map_id AND c.q = h.q AND c.r = h.r AND c.object_id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM yuplink.beta_raid_runner rn
           WHERE rn.map_id = h.map_id AND rn.q = h.q AND rn.r = h.r)
      RETURNING h.id;`,
    { wrapJsonCte: true },
  ).catch(() => [])) as Array<{ id: string }>;

  dropMapBase();
  const base = await mapBase(mapId);
  const { noteMapRebuilt } = await import("./map-change-hooks");
  await noteMapRebuilt(mapId);
  // Живой поток: у всех открытых экранов карта перечитается сама.
  publishRaid({ mapId, type: "restored" });

  return {
    ok: true as const,
    cells: base.cells.length,
    objects: base.objects.length,
    orphansRemoved: orphans?.length ?? 0,
  };
});
