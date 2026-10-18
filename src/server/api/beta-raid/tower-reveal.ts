// Обзорная вышка: осмотреть округу за энергию.
//
// Открывает соты вокруг себя на пять клеток в каждую сторону. Работает
// индивидуально: каждый игрок разведывает с вышки один раз, зато пользоваться
// ею может любой герой — постройку строит один, а видом делится со всеми.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId, playerCell, requireAdjacent } from "./encounter-where";
import { raidOwner } from "./owner";
import { noteEnergySpend } from "./econ/energy-note";
import { loadCellBuilding } from "./building-action";
import { isBuilt, TOWER_ENERGY, TOWER_RADIUS } from "@/lib/buildingEffect";
import { mergeFogCells } from "./fog";
import { VOID_SQL } from "./voidCells";
import { canIgnoreVoid, requireNotVoid } from "./voidGate";

const cellInput = (d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d);

/** Снять отметку «этот игрок уже смотрел с этой вышки». */
async function dropClaim(owner: string, mapId: string, q: number, r: number): Promise<void> {
  await mcpExec(
    `DELETE FROM yuplink.beta_raid_building_use
      WHERE owner = ${sqlStr(owner)} AND map_id = ${sqlStr(mapId)}
        AND q = ${q} AND r = ${r} AND kind = 'watchtower';`,
    { wrapJson: false },
  );
}

/** Все клетки внутри гекс-круга радиусом R (соты вокруг центра, axial). */
export function hexDisc(q: number, r: number, radius: number): Array<{ q: number; r: number }> {
  const out: Array<{ q: number; r: number }> = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const from = Math.max(-radius, -dq - radius);
    const to = Math.min(radius, -dq + radius);
    for (let dr = from; dr <= to; dr++) out.push({ q: q + dq, r: r + dr });
  }
  return out;
}

export const revealFromTower = createServerFn({ method: "POST" })
  .inputValidator(cellInput)
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const pos = await playerCell(wallet);
    requireAdjacent(pos, data.q, data.r);
    // Сама вышка в тумане — не вышка: смотреть с неё нельзя, даже с берега.
    await requireNotVoid(wallet, mapId, data.q, data.r);

    const b = await loadCellBuilding(mapId, data.q, data.r);
    if (!b) throw new Error("Здесь нет постройки");
    if (b.effect !== "watchtower") throw new Error("Это не обзорная вышка");
    if (!isBuilt(b.tier, b.tiers.length)) throw new Error("Вышка ещё не достроена");

    const owner = await raidOwner(wallet);
    // След ставим ДО списания: иначе два нажатия подряд спишут энергию дважды.
    const claim = (await mcpExec(
      `INSERT INTO yuplink.beta_raid_building_use (owner, map_id, q, r, kind)
       VALUES (${sqlStr(owner)}, ${sqlStr(mapId)}, ${data.q}, ${data.r}, 'watchtower')
       ON CONFLICT DO NOTHING RETURNING owner;`,
      { wrapJsonCte: true },
    )) as Array<{ owner: string }>;
    if (!claim?.[0]) throw new Error("Ты уже осмотрел округу с этой вышки");

    const { sb } = await import("../../db/pg");
    const { error } = await sb.rpc("touch_energy_atomic", {
      p_wallet: wallet,
      p_spend: TOWER_ENERGY,
    });
    if (error) {
      // Не хватило энергии — снимаем след, пусть попробует позже.
      await dropClaim(owner, mapId, data.q, data.r);
      if (String(error.message).includes("not_enough_energy")) {
        throw new Error(`Недостаточно энергии (нужно ${TOWER_ENERGY})`);
      }
      throw new Error(error.message);
    }
    void noteEnergySpend(owner, TOWER_ENERGY, "tower");

    // Открываем только настоящие клетки карты: пустоту за краем показывать нечем.
    // Купол отсекаем прямо здесь: этот список уходит клиенту
    // напрямую, в обход фильтра mergeFogCells, — и вышка подсветила бы зону.
    // Админу не отсекаем: у него зона и так на виду, а «дыра» в осмотре
    // выглядела бы как пустая карта там, где он сам её и нарисовал.
    const bypassVoid = canIgnoreVoid(wallet);
    const around = hexDisc(data.q, data.r, TOWER_RADIUS);
    const pairs = around.map((c) => `(${c.q}, ${c.r})`).join(",");
    const rows = (await mcpExec(
      `SELECT c.q, c.r FROM yuplink.raid_map_cells c
        WHERE c.map_id = ${sqlStr(mapId)} AND (c.q, c.r) IN (${pairs})
          AND c.terrain_id IS NOT NULL ${bypassVoid ? "" : `AND NOT ${VOID_SQL}`};`,
      { wrapJson: true },
    )) as Array<{ q: number; r: number }>;
    const cells = (rows ?? []).map((c) => `${Number(c.q)},${Number(c.r)}`);
    try {
      await mergeFogCells(owner, mapId, cells, bypassVoid);
    } catch (e) {
      // Энергия ушла, а карта не открылась — снимаем след, чтобы игрок мог
      // повторить, а не остался ни с чем.
      await dropClaim(owner, mapId, data.q, data.r);
      throw e;
    }

    return { ok: true as const, cells, spent: TOWER_ENERGY };
  });
