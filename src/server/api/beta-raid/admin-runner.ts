// Что админ может сделать с беглецом: убрать его с карты.
//
// Отдельным файлом, потому что admin-live-edit уже у лимита в 250 строк
// (§13 ПРАВИЛА.md), и потому что беглец — не слой клетки: правки клетки его не
// касаются вовсе (runners.ts), значит и в общую очередь «Выгрузить» ему нельзя.
// Он живёт в своей таблице и убирается сразу, как корабль.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import { sqlStr } from "../raid-shared";
import { publishRaid } from "../../raidLive";
import { godMapId } from "./god-map";
import { dropFleeCache } from "./flee-cells";
import { dropRunnerSql, runnerAt } from "./runners";
import { readDaraiHold, settleDaraiHold } from "./map-darai-hold";

export const adminRemoveRunner = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const mapId = await godMapId();
    const runner = await runnerAt(mapId, data.q, data.r);
    if (!runner) throw new Error("Беглеца здесь нет");

    // Обеспечение сводим той же машинкой, что и у объекта клетки: снимок до и
    // после, разница возвращается в пул. Невскрытый объект уносит свой номинал
    // обратно — снимает его админ, а не игрок.
    const hold = await readDaraiHold(mapId, [{ q: data.q, r: data.r }]);
    await mcpExec(dropRunnerSql(mapId, data.q, data.r), { wrapJson: false });
    await settleDaraiHold(hold);
    // Снимок «кто здесь убегает» держит и слой беглецов — он устарел.
    dropFleeCache(mapId);
    // Версия и патч клетки — через журнал: игрокам уедет одна клетка, а не
    // «перекачай карту» (голый UPDATE revision оставлял дыру в журнале).
    const { noteCellsChanged } = await import("./map-change-hooks");
    await noteCellsChanged(mapId, [`${data.q},${data.r}`]);
    publishRaid({ mapId, type: "restored" });
    return { ok: true as const, objectId: runner.objectId };
  });
