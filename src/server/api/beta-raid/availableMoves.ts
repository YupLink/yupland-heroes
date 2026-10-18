// Доступные ходы бета-рейда: любая соседняя клетка с местностью, без
// декора-преграды (cell-sql.decorBlocksSql) и без живого объекта. Пути
// (routes) больше не участвуют.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { requireBetaRaid } from "./gate";
import { sqlStr } from "../raid-shared";
import { raidOwner } from "./owner";
import { getNeighbors, cellMoveCost } from "./helpers";
import { VOID_SQL } from "./voidCells";
import { canIgnoreVoid } from "./voidGate";
import { objectKnownSql } from "./boss-snapshot";
import { WATER_SQL, decorBlocksSql } from "./cell-sql";
import { stepEnergyCost } from "@/lib/shipRules";

export const getAvailableMoves = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = await requireBetaRaid();
  const account = await raidOwner(wallet);

  const settingsRows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = 'beta_raid_map';`,
    { wrapJson: true },
  )) as Array<{ value: string }>;

  let mapId: string | null = null;
  try {
    mapId = (JSON.parse(settingsRows?.[0]?.value ?? "{}") as { mapId?: string }).mapId ?? null;
  } catch {
    /* ignore */
  }
  if (!mapId) return { moves: [] };

  const posRows = (await mcpExec(
    `SELECT q, r FROM yuplink.beta_raid_positions
       WHERE account_id = ${sqlStr(account)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ q: number; r: number }>;

  // Позиции ещё нет — игрок у замка (в главном мире — у ратуши Юпленда).
  const currentPos = posRows?.[0] ?? (await (await import("./castle-door")).startCell(mapId));
  const pq = currentPos.q,
    pr = currentPos.r;
  const moveSet = new Map<string, { cellCost: number; water: boolean }>();

  // Все 6 соседей: доступны те, где есть местность, нет декора-преграды и
  // нет живого объекта. Повержённый объект (HP=0) проход не закрывает.
  for (const n of getNeighbors(pq, pr)) {
    const key = `${n.q},${n.r}`;
    if (moveSet.has(key)) continue;
    const cell = await getCellInfo(mapId, n.q, n.r);
    if (!cell?.terrain_id) continue;
    // Клетка под глухим туманом кружка не получает: эндпоинт живой, и врать о том,
    // куда сервер всё равно не пустит, ему нельзя. Админа же пускает и ход
    // (helpers.isValidMove) — значит и кружок ему положен, иначе два ответа
    // на один вопрос разошлись бы.
    if (cell.void_fog && !canIgnoreVoid(wallet)) continue;
    // Декор непроходим — но по тому же правилу, что и у шага
    // (step-facts ← decorBlocksSql): шаблон ЕСТЬ и не walkable. Голый
    // `decoration_id` держал кружок и там, куда сервер после удаления
    // шаблона уже пускал, и у проходимой таблички («две мёртвые клетки»).
    if (cell.decoration_blocks) continue;
    // Объект держит клетку, только пока жив И пока его вообще есть чем
    // показать: у шага (step-facts.stepBlockedReason) правило то же, и без
    // проверки шаблона кружок хода пропадал там, куда сервер пускает.
    if (cell.object_id && cell.object_known !== false) {
      const hpRows = (await mcpExec(
        `SELECT current_hp FROM yuplink.beta_raid_object_hp
          WHERE map_id = '${mapId}' AND q = ${n.q} AND r = ${n.r} AND cycle_no = 0 LIMIT 1;`,
        { wrapJson: true },
      )) as Array<{ current_hp: number }>;
      const alive = hpRows.length === 0 || Number(hpRows[0].current_hp) > 0;
      if (alive) continue;
    }
    const cellCost = await cellMoveCost(cell.terrain_id, cell.road_id);
    moveSet.set(key, { cellCost, water: !!cell.water });
  }

  // Замедление удорожает КАЖДЫЙ шаг, пока действует — показываем честно. Цену
  // считает та же stepEnergyCost, что и шаг (move-step): суша — (клетка +
  // замедление) × (1 − скидка героя), правило 27.09; вода — посадка или гребок
  // (свой борт, большой — дешевле), там база + замедление и скидки нет.
  const [{ slowExtraCost }, { loadHeroPower }, { myShip }] = await Promise.all([
    import("./encounter-effects"),
    import("./hero-power"),
    import("./ship-crew"),
  ]);
  const [slowExtra, hero, ship] = await Promise.all([
    slowExtraCost(account),
    loadHeroPower(wallet).catch(() => null),
    myShip(wallet, mapId).catch(() => null),
  ]);
  const heroStepDiscountPct = hero?.field.stepDiscountPct;

  return {
    moves: Array.from(moveSet.entries()).map(([key, { cellCost, water }]) => {
      const [q, r] = key.split(",").map(Number);
      const cost = water
        ? stepEnergyCost({
            boarding: !ship,
            sailing: !!ship,
            bigShip: ship?.kind === "big",
            slowExtra,
          })
        : stepEnergyCost({ cellCost, slowExtra, heroStepDiscountPct });
      return { q, r, cost, terrainName: "" };
    }),
    slowExtra,
  };
});

async function getCellInfo(
  mapId: string,
  q: number,
  r: number,
): Promise<{
  terrain_id: string | null;
  object_id: string | null;
  decoration_blocks: boolean | null;
  road_id: string | null;
  void_fog: boolean | null;
  object_known: boolean | null;
  water: boolean | null;
} | null> {
  const rows = (await mcpExec(
    `SELECT c.terrain_id, c.object_id, c.road_id, ${VOID_SQL} AS void_fog,
            ${decorBlocksSql("c")} AS decoration_blocks,
            ${objectKnownSql("c")} AS object_known,
            EXISTS (SELECT 1 FROM yuplink.mystic_item_template t
                     WHERE t.id = c.terrain_id AND ${WATER_SQL}) AS water
       FROM yuplink.raid_map_cells c
      WHERE c.map_id = '${mapId}' AND c.q = ${q} AND c.r = ${r} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{
    terrain_id: string | null;
    object_id: string | null;
    decoration_blocks: boolean | null;
    road_id: string | null;
    void_fog: boolean | null;
    object_known: boolean | null;
    water: boolean | null;
  }>;
  return rows?.[0] ?? null;
}
