// Уборка кораблей, простоявших разбитыми (без хода и без экипажа) 2 суток.
//
// Отдельной отметки «когда разбит» у корабля не было — «разбитость» считается на
// лету (hp<=0 && нет экипажа). Штампуем момент в hp_zero_at при ПЕРВОМ наблюдении
// разбитым, снимаем штамп при починке доской или посадке экипажа. Крона под это
// нет — уборка ленивая, при чтении кораблей, не чаще раза в минуту на карту.
//
// Снимают штамп и сами починка (ship-repair) с посадкой (ship-crew.seatOnShip),
// не только тик ниже: между двумя тиками борт успевает «починен → занят → сошёл
// в минус», и старый штамп подводил его под DELETE как двухсуточного.
import { publishRaid } from "../../raidLive";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

const BROKEN_TTL_DAYS = 2;
const lastSwept = new Map<string, number>();

export async function sweepBrokenShips(mapId: string): Promise<void> {
  const now = Date.now();
  if (now - (lastSwept.get(mapId) ?? 0) < 60_000) return;
  lastSwept.set(mapId, now);
  const m = sqlStr(mapId);
  // Разбит впервые — штампуем момент (дальше от него считаем 2 суток).
  await mcpExec(
    `UPDATE yuplink.beta_raid_ship SET hp_zero_at = now()
      WHERE map_id = ${m} AND hp <= 0 AND crew_account IS NULL AND hp_zero_at IS NULL;`,
  ).catch(() => {});
  // Починили (hp>0) или взяли экипаж — «разбит» снят, отметку убираем.
  await mcpExec(
    `UPDATE yuplink.beta_raid_ship SET hp_zero_at = NULL
      WHERE map_id = ${m} AND hp_zero_at IS NOT NULL AND (hp > 0 OR crew_account IS NOT NULL);`,
  ).catch(() => {});
  // Простоял разбитым 2 суток — снимаем с карты.
  const gone = (await mcpExec(
    `DELETE FROM yuplink.beta_raid_ship
      WHERE map_id = ${m} AND hp <= 0 AND crew_account IS NULL
        AND hp_zero_at IS NOT NULL AND hp_zero_at < now() - interval '${BROKEN_TTL_DAYS} days'
      RETURNING id;`,
    { wrapJsonCte: true },
  ).catch(() => null)) as Array<{ id: string }> | null;
  // Причалы кэшируются (ship-berths): без события снятое судно висело бы у
  // всех на карте ещё до 10 с. Снятое — в лог: журнала удалений нет, и жалобу
  // «корабль испарился» иначе не с чем сверить.
  if (gone && gone.length > 0) {
    console.log(`[ship-sweep] сняты с карты ${mapId}: ${gone.map((g) => g.id).join(", ")}`);
    publishRaid({ mapId, type: "ships" });
  }
}
