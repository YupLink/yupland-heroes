// Рюкзак героя рядом с полками склада: склад без него — окно, из которого
// нечего достать и некуда положить. Общий для склада на карте и склада замка.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { stackCells } from "@/lib/warehouseCells";
import { IS_POTION_SQL, POTION_JOIN } from "./potion-bag";
import { bagCellsOf, bagsOccupancy } from "@/lib/hero/potionBag";
import type { resolveBackpack } from "./market-backpack";

type Bp = NonNullable<Awaited<ReturnType<typeof resolveBackpack>>>;

export async function loadBackpackPanel(bp: Bp) {
  const rows = (await mcpExec(
    `SELECT b.stack_key AS "stackKey", b.kind, b.name, b.image, b.count,
              ${IS_POTION_SQL} AS potion
         FROM yuplink.raid_hero_backpack b ${POTION_JOIN}
        WHERE b.hero_id = ${sqlStr(bp.heroId)} AND b.count > 0 ORDER BY b.updated_at;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{
    stackKey: string;
    kind: string;
    name: string;
    image: string | null;
    count: number;
    potion: boolean;
  }>;
  const stacks = (rows ?? []).map((s) => ({
    ...s,
    potion: s.potion === true,
    count: Number(s.count) || 0,
    cells: stackCells(Number(s.count) || 0),
  }));
  // Рюкзак — только обычные товары: зелья живут в сумке.
  const { occupied } = bagsOccupancy({
    ...bagCellsOf(stacks),
    potionCapacity: bp.potionCapacity,
  });
  return { heroName: bp.heroName, capacity: bp.capacity, occupied, stacks };
}
