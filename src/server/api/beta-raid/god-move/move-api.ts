// Перемещение в режиме бога: «Переместить» в окне клетки → тап по цели.
//
// Переносится то, что ставит и держит карта (move-run, §8.33):
//  • здание — со всем хозяйством (move-write-sql); в блоке — весь блок с
//    формой, group_id, масштабом и декором блока (move-unit, move-cells-sql);
//  • декор — с отрастанием срубленного; в блоке — весь блок;
//  • объект клетки — с настройками, распиской Darai и боевым состоянием;
//  • сундук (обычный или магический) — с охраной, содержимым и бугорком;
//  • мешочки клетки — все разом.
// Корабли, игроки и беглецы ходят сами — их не переносим. Проверка и перенос
// каждого вида — один оператор под локами: отказ всегда до изменений, повтор
// того же переноса отвечает «уже там» и ничего не пишет. Только админ.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { godMapId } from "@/server/api/beta-raid/god-map";
import { refuse, runMove } from "@/server/api/beta-raid/god-move/move-run";
import { GOD_MOVE_KINDS, type GodMoveResult } from "@/lib/godMove";

const cell = z.object({ q: z.number().int(), r: z.number().int() });

export const adminGodMove = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(GOD_MOVE_KINDS),
        /** Ведущая клетка: у здания и декора в блоке — клетка, где они стоят. */
        from: cell,
        to: cell,
        /**
         * Что админ видел на клетке «откуда»: постройка без облика, декор,
         * объект клетки, «magic:<хозяин>» / «plain:<id>» сундука, id мешочков.
         */
        ref: z.string().min(1).max(4000),
        /** Карта окна админа: сменилась — перенос не по тем координатам. */
        mapId: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<GodMoveResult> => {
    requireAdmin();
    const mapId = await godMapId();
    if (data.mapId && data.mapId !== mapId) return refuse("other_map");
    if (data.from.q === data.to.q && data.from.r === data.to.r) return refuse("same_cell");
    return runMove({ mapId, kind: data.kind, from: data.from, to: data.to, ref: data.ref });
  });
