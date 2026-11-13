// Экипаж корабля, взорванного синим динамитом (§8.75а, владелец 26.10.2026: «если на
// этом корабле был какой-то чувак… его спавнят на его основной город»): каждого — в ЕГО
// основной город тем же путём, что заклинание «домой» (spell-teleport-home: основной
// замок, главный мир, с любого этажа; без платы и без отката заклинания).
//
// Надёжно: экипаж записан в итоге взрыва (detail.ships), а ключ нажатия ждёт (crew_due),
// пока всех не отнесут. Отнесли — отметка в ключе (detail.homed). Недонесённых доносит
// повтор того же нажатия или минутный обход (mine-break-sweep → resendCrewsHome). Второй
// раз не носим: отметка, а без неё — перенос только тех, кто всё ещё стоит на клетке
// взрыва и не в лодке. В воде без корабля игрок не остаётся.
//
// События — ничьи (by: null): перенос делает чужой бросок, и поток бросившего не
// должен принять его за свой шаг. Сам отнесённый получает личное «sentHome»: его поток
// перечитывает этаж и центр, клиент — карту и позицию (sentHomeLive).
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import { blastOf, type BlastDetail } from "@/server/api/beta-raid/dynamite/dynamite-sql";
import {
  crewDoneSql,
  crewDueSql,
  crewToHome,
  homedSql,
  strandedSql,
} from "@/server/api/beta-raid/dynamite/dynamite-ships";

type Hex = { q: number; r: number };

const warn = (what: string) => (e: unknown) => {
  console.warn(`[dynamite] ${what}:`, e instanceof Error ? e.message : e);
  return null;
};

/** Отнести одного. true — на клетке взрыва его больше нет (отнесли или ушёл сам). */
async function homeOne(op: string, account: string, mapId: string, at: Hex): Promise<boolean> {
  const rows = (await mcpExec(strandedSql(account, mapId, at), { wrapJson: true })) as Array<{
    stranded?: boolean;
  }> | null;
  if (!rows?.[0]?.stranded) return true;
  const { teleportHome } = await import("@/server/api/beta-raid/spell-teleport-home");
  const res = await teleportHome(account, { by: null });
  if (!res.ok) return false;
  // Окно «корабль подорвали — вас телепортировало в город» до «Понятно» (ship-blast-notice).
  const { noteShipBlast } = await import("@/server/api/beta-raid/dynamite/ship-blast-notice");
  await noteShipBlast(op, account, mapId, at).catch(warn("окно экипажа не записано"));
  // Перенос в том же мире объявлен клеткой прибытия: у обломков точку снимаем отдельно.
  if (!res.map) publishRaid({ mapId, type: "moved", from: { q: at.q, r: at.r }, to: null }, null);
  publishRaid({ mapId: null, type: "sentHome", to: account }, null);
  return true;
}

/** Отнести экипаж сбитых кораблей; ответ — скольких больше нет на обломках. */
export async function sendCrewsHome(o: {
  op: string;
  mapId: string;
  detail: BlastDetail;
}): Promise<number> {
  if (!o.detail.ships.some((s) => s.crew)) return 0;
  let done = 0;
  let left = 0;
  for (const account of crewToHome(o.detail)) {
    const ok = await homeOne(o.op, account, o.mapId, o.detail.at).catch(warn("экипаж не отнесён"));
    if (!ok) {
      left += 1;
      continue;
    }
    done += 1;
    await mcpExec(homedSql(o.op, account)).catch(warn("отметка экипажа не легла"));
  }
  if (left === 0) await mcpExec(crewDoneSql(o.op)).catch(warn("ключ экипажа не снят"));
  return done;
}

type DueRow = { op: string; map_id: string; detail: unknown };

/** Шаг минутного обхода: донести экипаж, который не донесло нажатие. */
export async function resendCrewsHome(): Promise<number> {
  const rows = ((await mcpExec(crewDueSql(), { wrapJson: true })) ?? []) as DueRow[];
  let n = 0;
  for (const row of rows) {
    const detail = blastOf(row.detail);
    if (detail) n += await sendCrewsHome({ op: row.op, mapId: String(row.map_id), detail });
  }
  return n;
}
