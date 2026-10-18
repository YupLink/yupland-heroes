// «Ремонт корабля» (вид repair_ship): полный запас хода кораблю рядом с героем.
//
// С 22.09 заклинание стояло видом boost без эффектов: брало энергию и откат и
// ничего не чинило. Механика — та же, что у починки досками (ship-repair.ts):
// какой борт чинить, тот же порядок — своё судно первым, дальше самое
// разбитое из свободных; штамп «разбит с …» снимается сразу. Разница одна:
// платит энергия каста, а не доски, и чинится до полного.
//
// Про деньги — как у «Создать корабль»: энергию каст уже списал, отказ
// (ok:false) её вернёт. Поэтому запись идемпотентна: повтор моста ставит те же
// hp по тому же id и отдаёт ту же строку, а не «ноль строк» с возвратом.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { publishRaid } from "../../raidLive";
import { raidOwner } from "./owner";
import { myMapId, ownCell } from "./encounter-where";
import { getNeighbors } from "./helpers";
import { shipMaxHp } from "@/lib/shipHealth";
import type { SpellEffectResult } from "./spell-effects";

type Target = { id: string; q: number; r: number; kind: "small" | "big" };

/**
 * Что чинить. Своё судно — где бы оно ни стояло: на нём плывут, и ремонт на
 * ходу — главный смысл заклинания. Иначе — самое разбитое свободное в клетке
 * героя или соседней (как у досок: чинит тот, кто рядом). Целые не берём.
 */
async function repairTarget(mapId: string, account: string, pos: { q: number; r: number }) {
  const cells = [pos, ...getNeighbors(pos.q, pos.r)].map((c) => `(${c.q}, ${c.r})`).join(",");
  const mine = `s.crew_account = ${sqlStr(account)}`;
  // «Своё первым» — через COALESCE: у свободного борта crew_account NULL, и
  // голое сравнение даёт NULL, а в DESC Postgres ставит NULL ПЕРВЫМ. Без этого
  // порядок переворачивался — капитан платил, а чинился обломок у причала.
  const rows = (await mcpExec(
    `SELECT s.id, s.q, s.r, COALESCE(s.kind, 'small') AS kind
       FROM yuplink.beta_raid_ship s
      WHERE s.map_id = ${sqlStr(mapId)}
        AND s.hp < (CASE WHEN s.kind = 'big' THEN ${shipMaxHp("big")} ELSE ${shipMaxHp("small")} END)
        AND (${mine} OR (s.crew_account IS NULL AND (s.q, s.r) IN (${cells})))
      ORDER BY COALESCE(${mine}, false) DESC, s.hp, s.created_at LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ id: string; q: number; r: number; kind: string }>;
  const row = rows?.[0];
  if (!row) return null;
  const t: Target = {
    id: String(row.id),
    q: Number(row.q),
    r: Number(row.r),
    kind: row.kind === "big" ? "big" : "small",
  };
  return t;
}

export async function repairShipNearHero(wallet: string): Promise<SpellEffectResult> {
  const mapId = await myMapId(wallet);
  const pos = await ownCell(wallet).catch(() => null);
  if (!pos) return { ok: false, reasonKey: "spell.not_on_map" };
  const account = await raidOwner(wallet);
  const ship = await repairTarget(mapId, account, pos);
  if (!ship) return { ok: false, reasonKey: "spell.no_ship_to_repair" };

  // Условие только по id: повтор моста после удачной записи снова найдёт
  // строку и отдаст её, а не «ноль строк», которые каст прочёл бы как отказ.
  const rows = (await mcpExec(
    `UPDATE yuplink.beta_raid_ship
        SET hp = ${shipMaxHp(ship.kind)}, hp_zero_at = NULL, updated_at = now()
      WHERE id = ${sqlStr(ship.id)}
      RETURNING id;`,
    { wrapJsonCte: true },
  )) as Array<{ id: string }>;
  // Судно убрали между выбором и записью (уборка разбитых) — чинить нечего.
  if (!rows?.length) return { ok: false, reasonKey: "spell.no_ship_to_repair" };

  try {
    console.log(`[repair-ship] ${ship.id} (${ship.q},${ship.r}) → full by ${wallet}`);
    publishRaid({ mapId, type: "ships" });
  } catch (e) {
    console.error("[repair-ship] публикация сорвалась:", ship.id, e);
  }
  return { ok: true, rolls: [], moved: null, ship: { id: ship.id, q: ship.q, r: ship.r } };
}
