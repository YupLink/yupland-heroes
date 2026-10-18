// Починка корабля досками.
//
// Разрушенное судно (жизни кончились, экипаж сошёл) стоит у берега мёртвым
// артом, пока его не залатают. Доски берём из рюкзака выбранного героя —
// это обычный «свой товар», ищем стек по имени, а не по конкретному id
// шаблона: владелец волен пересоздать «Доску» в справочнике.
//
// Чиним на сколько хватило досок: одна доска — SHIP_HP_PER_PLANK жизней.
// Первая же доска снимает клеймо «разрушен» — судно снова на ходу.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId, ownCell } from "./encounter-where";
import { raidOwner } from "./owner";
import { areNeighbors } from "./helpers";
import { resolveBackpack, takeFromBackpackStack } from "./market-backpack";
import { PLANK_NAME_RE, planksToRepair, repairedHp, shipMaxHp } from "@/lib/shipHealth";
import { publishRaid } from "../../raidLive";
import { plankStackKey } from "./plank-item";

type ShipRow = { id: string; kind: "small" | "big"; hp: number };
type PlankStack = { stackKey: string; count: number; name: string };

/**
 * Что чинить на этой клетке. Первым — СВОЁ судно: чинят обычно тот борт, на
 * котором плывут, и ждать, пока с него сойдёшь, незачем. Дальше — самое
 * разбитое из свободных. Целые борта в выборку не попадают: чинить нечего.
 */
async function damagedShipAt(
  mapId: string,
  account: string | null,
  q: number,
  r: number,
  /** Игрок ткнул в конкретный борт в окне — чиним ровно его. */
  shipId?: string | null,
): Promise<ShipRow | null> {
  const mine = account ? `s.crew_account = ${sqlStr(account)}` : "false";
  // COALESCE: у свободного борта сравнение даёт NULL, а NULL в DESC идёт
  // первым — и «своё первым» переворачивалось в «сначала чужой обломок».
  const rows = (await mcpExec(
    `SELECT s.id, COALESCE(s.kind, 'small') AS kind, s.hp
       FROM yuplink.beta_raid_ship s
      WHERE s.map_id = ${sqlStr(mapId)} AND s.q = ${q} AND s.r = ${r}
        AND s.hp < (CASE WHEN s.kind = 'big' THEN 2000 ELSE 1000 END)
        AND (s.crew_account IS NULL OR ${mine})
        ${shipId ? `AND s.id = ${sqlStr(shipId)}` : ""}
      ORDER BY COALESCE(${mine}, false) DESC, s.hp, s.created_at LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string; kind: string; hp: number }>;
  const row = rows?.[0];
  return row
    ? { id: row.id, kind: row.kind === "big" ? "big" : "small", hp: Number(row.hp) }
    : null;
}

/**
 * Стек досок в рюкзаке героя: имя, ключ и сколько лежит. Берём ОДИН стек —
 * ровно с него потом и списываем (takeFromBackpackStack по ключу), поэтому
 * «есть N» на кнопке равно тому, что реально снимется. Первым — канон
 * (тот же ключ, что у досок из маркета и разборки), старые стеки 'custom:'
 * без шаблона — только если канона нет: до слияния данных они ещё лежат.
 */
async function plankStack(heroId: string): Promise<PlankStack | null> {
  const canon = await plankStackKey();
  const rows = (await mcpExec(
    `SELECT stack_key AS "stackKey", name, count
       FROM yuplink.raid_hero_backpack
      WHERE hero_id = ${sqlStr(heroId)} AND count > 0
      ORDER BY (stack_key = ${sqlStr(canon)}) DESC, count DESC;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ stackKey: string; name: string; count: number }>;
  const hit = (rows ?? []).find((r) => PLANK_NAME_RE.test(String(r.name ?? "")));
  return hit
    ? { stackKey: hit.stackKey, name: String(hit.name), count: Math.floor(Number(hit.count) || 0) }
    : null;
}

/** Сколько досок нужно этому судну и сколько их у игрока — для кнопки. */
export const getShipRepair = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ q: z.number().int(), r: z.number().int(), shipId: z.string().nullish() }).parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const [mapId, account] = await Promise.all([myMapId(wallet), raidOwner(wallet)]);
    const [ship, bp] = await Promise.all([
      damagedShipAt(mapId, account, data.q, data.r, data.shipId ?? null),
      resolveBackpack(wallet).catch(() => null),
    ]);
    if (!ship) return null;
    const stack = bp?.heroId ? await plankStack(bp.heroId) : null;
    return {
      hp: ship.hp,
      hpMax: shipMaxHp(ship.kind),
      need: planksToRepair(ship.hp, ship.kind),
      have: stack?.count ?? 0,
      plankName: stack?.name ?? null,
    };
  });

export const repairShip = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        shipId: z.string().nullish(),
        // Сколько досок хочет потратить игрок. Не задано — как раньше, «до
        // упора»: min(что-в-рюкзаке, что-нужно-судну). Задано — берём именно
        // столько, но не больше стека и не больше нужды: чинить с запасом
        // выше HP-max нельзя, а тратить лишние доски из рюкзака в пустоту —
        // прямо то, на что игроки жалуются («тратятся все доски»).
        spend: z.number().int().min(1).max(100000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const [mapId, account] = await Promise.all([myMapId(wallet), raidOwner(wallet)]);
    const [pos, ship, bp] = await Promise.all([
      ownCell(wallet),
      damagedShipAt(mapId, account, data.q, data.r, data.shipId ?? null),
      resolveBackpack(wallet).catch(() => null),
    ]);
    if (!pos) throw new Error("Ты ещё не на карте");
    const near =
      (pos.q === data.q && pos.r === data.r) || areNeighbors(pos.q, pos.r, data.q, data.r);
    if (!near) throw new Error("braid.ship_repair_far");
    if (!ship) throw new Error("braid.ship_repair_none");
    if (!bp?.heroId) throw new Error("Сначала выбери героя");

    const stack = await plankStack(bp.heroId);
    if (!stack || stack.count <= 0) throw new Error("braid.ship_repair_no_planks");

    // Верхний потолок — то, что реально нужно судну и есть в рюкзаке. Если
    // клиент запросил меньше — уважаем: игрок хочет починить частично.
    const cap = Math.min(stack.count, planksToRepair(ship.hp, ship.kind));
    const spend = Math.max(1, Math.min(cap, data.spend ?? cap));
    if (spend <= 0) throw new Error("braid.ship_repair_none");
    const taken = await takeFromBackpackStack(bp.heroId, stack.stackKey, spend);
    if (!taken) throw new Error("braid.ship_repair_no_planks");

    const hp = repairedHp(ship.hp, ship.kind, spend);
    // Штамп «разбит с …» (hp_zero_at, ship-sweep) снимаем ЗДЕСЬ, а не ждём
    // минутного тика уборки: «починил одной доской → сел (−50) → сошёл» за одну
    // минуту оставляло старый штамп, и следующий тик удалял только что
    // починенное судно как простоявшее разбитым двое суток.
    const rows = (await mcpExec(
      `UPDATE yuplink.beta_raid_ship SET hp = ${hp}, hp_zero_at = NULL, updated_at = now()
        WHERE id = ${sqlStr(ship.id)} RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    if (!rows || rows.length === 0) {
      // Судно исчезло между чтением и записью — доски возвращаем, чинить нечего.
      const { returnToBackpackStack } = await import("./market-backpack");
      await returnToBackpackStack(bp.heroId, stack.stackKey, spend, taken, null).catch(() => {});
      throw new Error("braid.ship_repair_none");
    }

    publishRaid({ mapId, type: "ships" });
    return { ok: true as const, hp, hpMax: shipMaxHp(ship.kind), spent: spend };
  });
