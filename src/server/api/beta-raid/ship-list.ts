// Кто стоит на этой клетке: поимённый список судов.
//
// Раньше клетка отдавалась одной строкой-итогом («всего 3, занято 1»), и все
// действия адресовались клеткой, а не бортом: посадка брала первый подходящий,
// починка — самый разбитый. Игроки жаловались: на клетке три корабля, а сесть
// или починить можно «какой-то», и не тот. Здесь — разбор по бортам, чтобы
// окно дало выбрать конкретный.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { raidOwner } from "./owner";
import { shipBroken, shipMaxHp } from "@/lib/shipHealth";

export type ShipAtCell = {
  id: string;
  kind: "small" | "big";
  hp: number;
  hpMax: number;
  /** На борту записан этот игрок. */
  mine: boolean;
  /** Занят кем-то (мной или чужим) — сесть нельзя. */
  busy: boolean;
  /** Жизни кончились и экипаж сошёл: сперва починить. */
  broken: boolean;
};

export const shipsAtCell = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d))
  .handler(async ({ data }): Promise<{ ships: ShipAtCell[] }> => {
    const wallet = await requireBetaRaid();
    const [mapId, account] = await Promise.all([myMapId(wallet), raidOwner(wallet)]);
    const rows = (await mcpExec(
      `SELECT s.id, COALESCE(s.kind, 'small') AS kind, s.hp, s.crew_account AS crew
         FROM yuplink.beta_raid_ship s
        WHERE s.map_id = ${sqlStr(mapId)} AND s.q = ${data.q} AND s.r = ${data.r}
        ORDER BY (s.crew_account = ${sqlStr(account)}) DESC NULLS LAST,
                 (s.kind = 'big') DESC, s.created_at, s.id;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ id: string; kind: string; hp: number; crew: string | null }>;
    return {
      ships: (rows ?? []).map((s) => {
        const kind = s.kind === "big" ? ("big" as const) : ("small" as const);
        const hp = Number(s.hp) || 0;
        const crew = s.crew ?? null;
        return {
          id: String(s.id),
          kind,
          hp,
          hpMax: shipMaxHp(kind),
          mine: !!crew && crew === account,
          busy: !!crew,
          broken: shipBroken(hp, !!crew),
        };
      }),
    };
  });
